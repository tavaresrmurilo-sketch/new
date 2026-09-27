"""File Intelligence: incremental local index (SQLite FTS5) of the user's folders.

- Name, path, extension, parent, size and modification time for every file.
- Text content for small text/code files, PDFs and DOCX (optional).
- Project detection (package.json, pyproject.toml, .git, *.sln, ...).
- Per-directory mark-and-sweep keeps memory flat even for large trees.
"""

from __future__ import annotations

import asyncio
import os
import re
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from ..activity import ActivityLog, Category
from ..db import Database, fts_query
from ..eventbus import EventBus
from ..security import is_sensitive

EXCLUDED_DIRS = {
    "node_modules", ".git", ".svn", ".hg", "__pycache__", ".venv", "venv", "env", ".tox", ".mypy_cache",
    ".pytest_cache", ".ruff_cache", "dist", "build", ".next", ".nuxt", ".turbo", ".parcel-cache", "out", "target",
    "bin", "obj", ".gradle", ".idea", ".vs", ".vscode-test", ".cache", "appdata", "$recycle.bin", ".trash",
    "library", "coverage", "vendor", "site-packages", ".expo", ".angular", ".svelte-kit", "packages-cache",
    "onedrive - personal cache", "temp", "tmp", ".android", ".nuget", ".m2", ".cargo", ".rustup",
}

PROJECT_MARKERS = {
    "package.json", "pyproject.toml", "setup.py", "cargo.toml", "go.mod", "pom.xml", "build.gradle",
    "composer.json", "gemfile", "deno.json", "pubspec.yaml", "cmakelists.txt", ".git",
}
PROJECT_SUFFIXES = (".sln", ".csproj")

TEXT_EXTS = {
    "txt", "md", "markdown", "csv", "json", "py", "js", "ts", "tsx", "jsx", "mjs", "cjs", "html", "htm", "css",
    "scss", "java", "kt", "c", "cpp", "h", "hpp", "cs", "go", "rs", "rb", "php", "sh", "ps1", "bat", "cmd", "yml",
    "yaml", "toml", "ini", "cfg", "log", "sql", "xml", "vue", "svelte", "dart", "swift", "r", "tex", "rst",
}
MAX_TEXT_BYTES = 512 * 1024
MAX_DOC_BYTES = 20 * 1024 * 1024
MAX_CONTENT_CHARS = 20_000
MAX_FILES = 300_000

EXT_GROUPS: dict[str, list[str]] = {
    "apresentacao": ["pptx", "ppt", "odp", "key", "pdf"],
    "planilha": ["xlsx", "xls", "csv", "ods"],
    "documento": ["docx", "doc", "pdf", "odt", "txt", "md", "rtf"],
    "pdf": ["pdf"],
    "imagem": ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "heic"],
    "foto": ["jpg", "jpeg", "png", "heic", "webp"],
    "video": ["mp4", "mkv", "mov", "avi", "webm"],
    "musica": ["mp3", "flac", "wav", "m4a", "ogg"],
    "audio": ["mp3", "flac", "wav", "m4a", "ogg"],
    "codigo": ["py", "js", "ts", "tsx", "jsx", "java", "cs", "cpp", "c", "go", "rs"],
    "zip": ["zip", "rar", "7z", "tar", "gz"],
    "texto": ["txt", "md"],
}

_CAMEL = re.compile(r"(?<=[a-z])(?=[A-Z])|(?<=[A-Za-z])(?=\d)|(?<=\d)(?=[A-Za-z])|[_\-.\s]+")


def name_tokens(name: str) -> str:
    parts = [p for p in _CAMEL.split(name) if p]
    return name + " " + " ".join(parts)


@dataclass
class IndexStatus:
    state: str = "idle"
    files: int = 0
    projects: int = 0
    roots: list[str] = field(default_factory=list)
    last_run: float | None = None
    duration_s: float | None = None
    scanned_dirs: int = 0
    scanned_files: int = 0
    error: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "state": self.state, "files": self.files, "projects": self.projects, "roots": self.roots,
            "lastRun": self.last_run, "durationS": self.duration_s, "scannedDirs": self.scanned_dirs,
            "scannedFiles": self.scanned_files, "error": self.error,
        }


def extract_text(path: Path, ext: str, size: int) -> str:
    try:
        if ext in TEXT_EXTS and size <= MAX_TEXT_BYTES:
            with open(path, "rb") as fh:
                raw = fh.read(MAX_TEXT_BYTES)
            if b"\x00" in raw[:4096]:
                return ""
            return raw.decode("utf-8", errors="ignore")[:MAX_CONTENT_CHARS]
        if ext == "pdf" and size <= MAX_DOC_BYTES:
            from pypdf import PdfReader

            reader = PdfReader(str(path))
            chunks = []
            for page in reader.pages[:15]:
                chunks.append(page.extract_text() or "")
                if sum(len(c) for c in chunks) > MAX_CONTENT_CHARS:
                    break
            return "\n".join(chunks)[:MAX_CONTENT_CHARS]
        if ext == "docx" and size <= MAX_DOC_BYTES:
            import docx  # python-docx

            d = docx.Document(str(path))
            return "\n".join(p.text for p in d.paragraphs)[:MAX_CONTENT_CHARS]
    except Exception:
        return ""
    return ""


class FileIndex:
    RESCAN_INTERVAL_S = 30 * 60

    def __init__(self, db: Database, bus: EventBus, activity: ActivityLog,
                 roots_provider: Callable[[], list[Path]], content_enabled: Callable[[], bool]) -> None:
        self.db = db
        self.bus = bus
        self.activity = activity
        self.roots_provider = roots_provider
        self.content_enabled = content_enabled
        self.status = IndexStatus()
        self._cancel = threading.Event()
        self._running = threading.Lock()
        self._loop_task: asyncio.Task[None] | None = None
        self._gen = 0
        self._gen_lock = threading.Lock()
        self._refresh_counts()

    def _next_gen(self) -> int:
        """Unique, increasing scan generation (used by mark-and-sweep)."""
        with self._gen_lock:
            current = int(self.db.scalar("SELECT COALESCE(MAX(seen), 0) FROM files") or 0)
            self._gen = max(self._gen, current) + 1
            return self._gen

    def _refresh_counts(self) -> None:
        self.status.files = int(self.db.scalar("SELECT COUNT(*) FROM files") or 0)
        self.status.projects = int(self.db.scalar("SELECT COUNT(*) FROM files WHERE is_project = 1") or 0)

    # ------------------------------------------------------------- indexing
    def roots(self) -> list[Path]:
        seen: list[Path] = []
        for r in self.roots_provider():
            try:
                rp = r.resolve()
            except OSError:
                continue
            if rp.is_dir() and not any(_within(rp, s) for s in seen):
                seen = [s for s in seen if not _within(s, rp)]
                seen.append(rp)
        return seen

    def scan(self, progress: Callable[[IndexStatus], None] | None = None) -> IndexStatus:
        if not self._running.acquire(blocking=False):
            return self.status
        self._cancel.clear()
        started = time.time()
        gen = self._next_gen()
        st = self.status
        st.state, st.error, st.scanned_dirs, st.scanned_files = "indexing", "", 0, 0
        roots = self.roots()
        st.roots = [str(r) for r in roots]
        want_content = self.content_enabled()
        conn = self.db.conn
        try:
            for root in roots:
                stack = [root]
                while stack:
                    if self._cancel.is_set():
                        raise InterruptedError
                    d = stack.pop()
                    self._scan_dir(conn, d, gen, stack, want_content)
                    st.scanned_dirs += 1
                    if progress and st.scanned_dirs % 200 == 0:
                        progress(st)
                    if st.scanned_files >= MAX_FILES:
                        stack.clear()
            # Sweep entries under the indexed roots not seen in this pass (a concurrent refresh_dirs
            # stamps a newer generation, so only older rows are stale).
            conn.execute("BEGIN")
            try:
                for root in roots:
                    prefix = str(root)
                    like = prefix.rstrip("\\/") + os.sep + "%"
                    ids = [r[0] for r in conn.execute(
                        "SELECT id FROM files WHERE seen < ? AND (path = ? OR path LIKE ?)", (gen, prefix, like))]
                    for i in range(0, len(ids), 500):
                        chunk = ids[i:i + 500]
                        marks = ",".join("?" * len(chunk))
                        conn.execute(f"DELETE FROM files_fts WHERE rowid IN ({marks})", chunk)
                        conn.execute(f"DELETE FROM files WHERE id IN ({marks})", chunk)
                # Files from roots that are no longer configured.
                if roots:
                    conds = " AND ".join(["NOT (path = ? OR path LIKE ?)"] * len(roots))
                    params: list[Any] = []
                    for root in roots:
                        params += [str(root), str(root).rstrip("\\/") + os.sep + "%"]
                    stale = [r[0] for r in conn.execute(f"SELECT id FROM files WHERE {conds}", params)]
                    for i in range(0, len(stale), 500):
                        chunk = stale[i:i + 500]
                        marks = ",".join("?" * len(chunk))
                        conn.execute(f"DELETE FROM files_fts WHERE rowid IN ({marks})", chunk)
                        conn.execute(f"DELETE FROM files WHERE id IN ({marks})", chunk)
                conn.execute("COMMIT")
            except Exception:
                conn.execute("ROLLBACK")
                raise
            st.state = "idle"
        except InterruptedError:
            st.state = "cancelled"
        except Exception as exc:  # pragma: no cover - defensive
            st.state = "error"
            st.error = str(exc)
        finally:
            st.last_run = time.time()
            st.duration_s = round(time.time() - started, 2)
            self._refresh_counts()
            self._running.release()
        return st

    def _scan_dir(self, conn: Any, d: Path, gen: int, stack: list[Path], want_content: bool) -> None:
        try:
            with os.scandir(d) as it:
                entries = list(it)
        except (PermissionError, FileNotFoundError, NotADirectoryError, OSError):
            return
        existing = {row[0]: (row[1], row[2], row[3]) for row in conn.execute(
            "SELECT path, mtime, size, id FROM files WHERE parent = ?", (str(d),))}
        names_lower = {e.name.lower() for e in entries}
        is_project = bool(names_lower & PROJECT_MARKERS) or any(n.endswith(PROJECT_SUFFIXES) for n in names_lower)
        conn.execute("UPDATE files SET is_project = ? WHERE path = ? AND is_project != ?",
                     (int(is_project), str(d), int(is_project)))
        rows_upsert: list[tuple[Any, ...]] = []
        unchanged: list[tuple[int, str]] = []
        for entry in entries:
            name = entry.name
            lower = name.lower()
            try:
                is_dir = entry.is_dir(follow_symlinks=False)
                if entry.is_symlink():
                    continue
                stat = entry.stat(follow_symlinks=False)
            except OSError:
                continue
            path = entry.path
            if is_dir:
                if lower in EXCLUDED_DIRS or lower.startswith("."):
                    continue
                if is_sensitive(Path(path)):
                    continue
                stack.append(Path(path))
            elif lower.startswith("~$") or lower in ("desktop.ini", "thumbs.db", ".ds_store"):
                continue
            ext = "" if is_dir else (lower.rsplit(".", 1)[-1] if "." in lower else "")
            size = 0 if is_dir else stat.st_size
            mtime = stat.st_mtime
            prev = existing.get(path)
            self.status.scanned_files += 1
            if prev and abs(prev[0] - mtime) < 1e-3 and prev[1] == size:
                unchanged.append((gen, path))
                continue
            content = ""
            if want_content and not is_dir:
                content = extract_text(Path(path), ext, size)
            rows_upsert.append((path, name, ext, str(d), size, mtime, int(is_dir), int(bool(content)), gen, content,
                                prev[2] if prev else None))
        conn.execute("BEGIN")
        try:
            conn.executemany("UPDATE files SET seen = ? WHERE path = ?", unchanged)
            for (path, name, ext, parent, size, mtime, is_dir, has_content, g, content, old_id) in rows_upsert:
                if old_id is not None:
                    conn.execute(
                        "UPDATE files SET size=?, mtime=?, has_content=?, seen=? WHERE id=?",
                        (size, mtime, has_content, g, old_id))
                    conn.execute("DELETE FROM files_fts WHERE rowid = ?", (old_id,))
                    rowid = old_id
                else:
                    cur = conn.execute(
                        "INSERT INTO files(path, name, ext, parent, size, mtime, is_dir, has_content, seen) "
                        "VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(path) DO UPDATE SET size=excluded.size, "
                        "mtime=excluded.mtime, has_content=excluded.has_content, seen=excluded.seen RETURNING id",
                        (path, name, ext, parent, size, mtime, is_dir, has_content, g))
                    rowid = cur.fetchone()[0]
                    conn.execute("DELETE FROM files_fts WHERE rowid = ?", (rowid,))
                conn.execute("INSERT INTO files_fts(rowid, name, path, content) VALUES (?,?,?,?)",
                             (rowid, name_tokens(name), path, content))
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise

    def refresh_dirs(self, dirs: list[Path], depth: int = 1) -> None:
        """Re-scan specific directories right after Jarvis changed them (keeps search results truthful)."""
        conn = self.db.conn
        want = self.content_enabled()
        queue = [(Path(d), 0) for d in dict.fromkeys(str(x) for x in dirs)]
        seen_dirs: set[str] = set()
        while queue:
            d, level = queue.pop()
            key = str(d)
            if key in seen_dirs:
                continue
            seen_dirs.add(key)
            if not d.is_dir():
                self._delete_tree(conn, key)
                continue
            gen = self._next_gen()
            subdirs: list[Path] = []
            self._scan_dir(conn, d, gen, subdirs, want)
            gone = [r[0] for r in conn.execute("SELECT path FROM files WHERE parent = ? AND seen < ?", (key, gen))]
            for path in gone:
                self._delete_tree(conn, path)
            if level < depth:
                queue.extend((sd, level + 1) for sd in subdirs)
        self._refresh_counts()

    def _delete_tree(self, conn: Any, path: str) -> None:
        like = path.rstrip("\\/") + os.sep + "%"
        ids = [r[0] for r in conn.execute("SELECT id FROM files WHERE path = ? OR path LIKE ?", (path, like))]
        for i in range(0, len(ids), 500):
            chunk = ids[i:i + 500]
            marks = ",".join("?" * len(chunk))
            conn.execute(f"DELETE FROM files_fts WHERE rowid IN ({marks})", chunk)
            conn.execute(f"DELETE FROM files WHERE id IN ({marks})", chunk)

    async def refresh_async(self, dirs: list[Path | str], depth: int = 1) -> None:
        try:
            await asyncio.to_thread(self.refresh_dirs, [Path(d) for d in dirs], depth)
        except Exception as exc:  # index freshness must never break the action that triggered it
            self.activity.log(Category.ERROR, "Falha ao atualizar o índice", level="warning", error=str(exc))

    def cancel(self) -> None:
        self._cancel.set()

    async def scan_async(self) -> IndexStatus:
        await self.bus.publish("files.index", self.status.to_dict() | {"state": "indexing"})
        loop = asyncio.get_running_loop()

        def progress(st: IndexStatus) -> None:
            asyncio.run_coroutine_threadsafe(self.bus.publish("files.index", st.to_dict()), loop)

        st = await asyncio.to_thread(self.scan, progress)
        self.activity.log(Category.SYSTEM, f"Índice de arquivos: {st.files} itens ({st.state})",
                          durationS=st.duration_s, projects=st.projects)
        await self.bus.publish("files.index", st.to_dict())
        return st

    def start_background(self, enabled: Callable[[], bool]) -> None:
        async def loop() -> None:
            await asyncio.sleep(3)  # let startup finish first
            while True:
                if enabled():
                    await self.scan_async()
                await asyncio.sleep(self.RESCAN_INTERVAL_S)

        if self._loop_task is None:
            self._loop_task = asyncio.create_task(loop(), name="file-index")

    async def stop(self) -> None:
        self.cancel()
        if self._loop_task:
            self._loop_task.cancel()
            try:
                await self._loop_task
            except asyncio.CancelledError:
                pass
            self._loop_task = None

    # --------------------------------------------------------------- search
    def search(self, terms: str = "", *, exts: list[str] | None = None, folder: Path | None = None,
               modified_after: float | None = None, modified_before: float | None = None,
               kind: str | None = None, limit: int = 20, sort: str = "relevance") -> list[dict[str, Any]]:
        limit = max(1, min(limit, 200))
        where: list[str] = []
        params: list[Any] = []
        if exts:
            where.append(f"f.ext IN ({','.join('?' * len(exts))})")
            params += [e.lower().lstrip(".") for e in exts]
        if folder is not None:
            where.append("(f.path LIKE ?)")
            params.append(str(folder).rstrip("\\/") + os.sep + "%")
        if modified_after is not None:
            where.append("f.mtime >= ?")
            params.append(modified_after)
        if modified_before is not None:
            where.append("f.mtime < ?")
            params.append(modified_before)
        if kind == "dir":
            where.append("f.is_dir = 1")
        elif kind == "file":
            where.append("f.is_dir = 0")
        elif kind == "project":
            where.append("f.is_project = 1")

        scored: dict[int, dict[str, Any]] = {}
        base_where = (" AND " + " AND ".join(where)) if where else ""
        match = fts_query(terms) if terms.strip() else ""
        if match:
            sql = ("SELECT f.*, bm25(files_fts, 8.0, 1.0, 0.6) AS rank, "
                   "snippet(files_fts, 2, '[', ']', '…', 12) AS snip FROM files_fts "
                   "JOIN files f ON f.id = files_fts.rowid WHERE files_fts MATCH ?" + base_where +
                   " ORDER BY rank LIMIT 300")
            for row in self.db.query(sql, [match] + params):
                row["score"] = -float(row.pop("rank"))
                scored[row["id"]] = row
            # Substring fallback on names (FTS tokens miss "projetobeta" for "beta").
            likes = [t for t in re.findall(r"\w+", terms.lower()) if len(t) >= 3][:4]
            if likes:
                like_sql = "SELECT f.* FROM files f WHERE " + " AND ".join(["lower(f.name) LIKE ?"] * len(likes)) + \
                           base_where + " ORDER BY f.mtime DESC LIMIT 200"
                for row in self.db.query(like_sql, [f"%{t}%" for t in likes] + params):
                    if row["id"] not in scored:
                        row["score"] = 4.0
                        row["snip"] = ""
                        scored[row["id"]] = row
            if not scored:
                return []
        else:
            sql = "SELECT f.* FROM files f" + (" WHERE " + " AND ".join(where) if where else "") + \
                  " ORDER BY f.mtime DESC LIMIT ?"
            for row in self.db.query(sql, params + [limit]):
                row["score"] = 0.0
                row["snip"] = ""
                scored[row["id"]] = row

        now_ts = time.time()
        results = []
        words = [w for w in re.findall(r"\w+", terms.lower()) if len(w) > 1]
        for row in scored.values():
            name_l = row["name"].lower()
            bonus = 0.0
            for w in words:
                if name_l == w or name_l.rsplit(".", 1)[0] == w:
                    bonus += 6
                elif w in name_l:
                    bonus += 3
            if row["is_project"]:
                bonus += 2 if kind in (None, "project", "dir") else 0
            age_days = max(0.0, (now_ts - row["mtime"]) / 86400)
            recency = 2.0 / (1.0 + age_days / 30)
            row["score"] = round(row["score"] + bonus + recency, 3)
            results.append(row)
        if sort == "recent":
            results.sort(key=lambda r: r["mtime"], reverse=True)
        else:
            results.sort(key=lambda r: r["score"], reverse=True)
        return [self._public(r) for r in results[:limit]]

    @staticmethod
    def _public(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "path": row["path"], "name": row["name"], "ext": row["ext"], "parent": row["parent"],
            "size": row["size"], "mtime": row["mtime"], "isDir": bool(row["is_dir"]),
            "isProject": bool(row["is_project"]), "snippet": row.get("snip") or "", "score": row.get("score", 0),
        }

    def live_search(self, terms: str, roots: list[Path], budget_s: float = 2.5, limit: int = 20) -> list[dict[str, Any]]:
        """Bounded direct walk used while the first index pass is still running."""
        words = [w for w in re.findall(r"\w+", terms.lower()) if len(w) >= 2]
        if not words:
            return []
        deadline = time.time() + budget_s
        found: list[dict[str, Any]] = []
        stack = list(roots)
        while stack and time.time() < deadline and len(found) < limit * 3:
            d = stack.pop()
            try:
                with os.scandir(d) as it:
                    for e in it:
                        lower = e.name.lower()
                        try:
                            is_dir = e.is_dir(follow_symlinks=False)
                        except OSError:
                            continue
                        if is_dir and (lower in EXCLUDED_DIRS or lower.startswith(".")):
                            continue
                        if is_dir:
                            stack.append(Path(e.path))
                        if all(w in lower for w in words):
                            try:
                                st = e.stat(follow_symlinks=False)
                            except OSError:
                                continue
                            found.append({"path": e.path, "name": e.name,
                                          "ext": "" if is_dir else lower.rsplit(".", 1)[-1] if "." in lower else "",
                                          "parent": str(d), "size": 0 if is_dir else st.st_size,
                                          "mtime": st.st_mtime, "isDir": is_dir, "isProject": False,
                                          "snippet": "", "score": 1.0})
            except OSError:
                continue
        found.sort(key=lambda r: r["mtime"], reverse=True)
        return found[:limit]

    def projects(self, terms: str = "", limit: int = 20) -> list[dict[str, Any]]:
        return self.search(terms, kind="project", limit=limit, sort="relevance" if terms else "recent")


def _within(child: Path, parent: Path) -> bool:
    try:
        child.relative_to(parent)
        return True
    except ValueError:
        return False
