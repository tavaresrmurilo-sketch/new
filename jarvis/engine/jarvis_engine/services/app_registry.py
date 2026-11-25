"""App Registry: discovers installed applications and maps natural names to them.

Sources (Windows): Start Menu + Desktop shortcuts, Get-StartApps (Store/UWP),
App Paths registry and Program Files. Results are cached in SQLite and
refreshed at most once per day (or on demand).
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Any

from ..activity import ActivityLog, Category
from ..core.text import clean_entity, normalize, similarity
from ..db import Database, dumps, loads, now
from ..platform.base import AppEntry, PlatformAdapter

# Natural-language aliases. Keys are normalised app names.
KNOWN_ALIASES: dict[str, list[str]] = {
    "google chrome": ["chrome", "google", "navegador do google", "navegador chrome", "chrome do google"],
    "microsoft edge": ["edge", "navegador da microsoft", "navegador edge"],
    "mozilla firefox": ["firefox", "navegador firefox", "raposa"],
    "firefox": ["navegador firefox"],
    "brave": ["brave browser", "navegador brave"],
    "opera": ["opera gx", "navegador opera"],
    "visual studio code": ["vs code", "vscode", "code", "editor de codigo", "visual code", "vs codi", "vis code"],
    "code": ["vs code", "vscode", "visual studio code"],
    "spotify": ["spotify music", "spot"],
    "whatsapp": ["zap", "whats", "zapzap", "whatsapp desktop"],
    "discord": ["disc"],
    "steam": ["loja steam"],
    "microsoft word": ["word", "editor de texto word"],
    "word": ["microsoft word"],
    "microsoft excel": ["excel", "planilha excel"],
    "excel": ["microsoft excel"],
    "microsoft powerpoint": ["powerpoint", "power point", "ppt"],
    "powerpoint": ["power point", "microsoft powerpoint"],
    "microsoft outlook": ["outlook"],
    "outlook": ["microsoft outlook"],
    "microsoft teams": ["teams"],
    "obs studio": ["obs"],
    "notion": ["notion app"],
    "telegram desktop": ["telegram"],
    "slack": ["slack app"],
    "zoom": ["zoom meetings"],
    "figma": ["figma desktop"],
    "postman": ["post man"],
    "docker desktop": ["docker"],
    "vlc media player": ["vlc"],
    "adobe photoshop": ["photoshop"],
    "windows terminal": ["terminal"],
    "git bash": ["bash"],
    "calculadora": ["calculator", "calc"],
    "calculator": ["calculadora"],
}


@dataclass
class AppMatch:
    entry: AppEntry
    score: float
    matched: str

    def to_dict(self) -> dict[str, Any]:
        return {"entry": self.entry.to_dict(), "score": round(self.score, 3), "matched": self.matched}


class AppRegistry:
    MAX_AGE_S = 24 * 3600

    def __init__(self, db: Database, platform: PlatformAdapter, activity: ActivityLog) -> None:
        self.db = db
        self.platform = platform
        self.activity = activity
        self._entries: list[AppEntry] = []
        self._lock = asyncio.Lock()
        self.last_refresh: float = 0.0
        self.refreshing = False

    # ------------------------------------------------------------ loading
    def load_cached(self) -> int:
        rows = self.db.query("SELECT * FROM app_registry ORDER BY name")
        self._entries = [
            AppEntry(r["name"], r["launch"], r["kind"], r["exe_name"], r["source"], loads(r["aliases"], []))
            for r in rows
        ]
        self.last_refresh = float(self.db.scalar("SELECT MAX(updated_at) FROM app_registry") or 0.0)
        if not self._entries:
            self._entries = list(self.platform.builtin_apps())
        return len(self._entries)

    def needs_refresh(self) -> bool:
        return time.time() - self.last_refresh > self.MAX_AGE_S or len(self._entries) < 3

    async def refresh(self) -> int:
        async with self._lock:
            self.refreshing = True
            started = time.time()
            try:
                scanned = await asyncio.to_thread(self.platform.scan_apps)
            except Exception as exc:
                self.activity.log(Category.ERROR, "Falha ao indexar aplicativos", level="error", error=str(exc))
                scanned = []
            finally:
                self.refreshing = False
            entries = self._dedupe(list(self.platform.builtin_apps()) + scanned)
            for e in entries:
                e.aliases = sorted(set(e.aliases + KNOWN_ALIASES.get(normalize(e.name), [])))
            ts = now()
            conn = self.db.conn
            conn.execute("BEGIN")
            try:
                conn.execute("DELETE FROM app_registry")
                conn.executemany(
                    "INSERT OR IGNORE INTO app_registry(name, normalized, aliases, kind, launch, exe_name, source, updated_at) "
                    "VALUES (?,?,?,?,?,?,?,?)",
                    [(e.name, normalize(e.name), dumps(e.aliases), e.kind, e.launch, e.exe_name, e.source, ts)
                     for e in entries],
                )
                conn.execute("COMMIT")
            except Exception:
                conn.execute("ROLLBACK")
                raise
            self._entries = entries
            self.last_refresh = ts
            self.activity.log(Category.SYSTEM, f"App Registry atualizado: {len(entries)} aplicativos",
                              durationMs=int((time.time() - started) * 1000))
            return len(entries)

    @staticmethod
    def _dedupe(entries: list[AppEntry]) -> list[AppEntry]:
        # Prefer shortcuts/Store entries (proper launch context) over raw exes.
        rank = {"builtin": 0, "uri": 0, "lnk": 1, "uwp": 2, "desktop": 1, "exe": 3}
        best: dict[str, AppEntry] = {}
        for e in entries:
            key = normalize(e.name)
            if not key:
                continue
            current = best.get(key)
            if current is None or rank.get(e.kind, 9) < rank.get(current.kind, 9):
                if current and not e.exe_name:
                    e.exe_name = current.exe_name
                best[key] = e
            elif current and not current.exe_name and e.exe_name:
                current.exe_name = e.exe_name
        return sorted(best.values(), key=lambda e: e.name.lower())

    # ------------------------------------------------------------ queries
    @property
    def entries(self) -> list[AppEntry]:
        return self._entries

    def resolve(self, query: str, limit: int = 5) -> list[AppMatch]:
        q = clean_entity(query)
        if not q:
            return []
        matches: list[AppMatch] = []
        for e in self._entries:
            name = normalize(e.name)
            names = [name] + [normalize(a) for a in e.aliases]
            best_score = 0.0
            best_name = name
            for n in names:
                if not n:
                    continue
                if q == n:
                    score = 1.0 if n == name else 0.97
                elif q in n.split() or (len(q) >= 4 and n.startswith(q)):
                    score = 0.9 - min(0.2, (len(n) - len(q)) * 0.01)
                elif len(q) >= 4 and q in n:
                    score = 0.8 - min(0.2, (len(n) - len(q)) * 0.01)
                elif len(n) >= 4 and n in q:
                    score = 0.75
                else:
                    score = similarity(q, n) * 0.85
                if score > best_score:
                    best_score, best_name = score, n
            if best_score >= 0.6:
                matches.append(AppMatch(e, best_score, best_name))
        matches.sort(key=lambda m: (m.score, -len(m.entry.name)), reverse=True)
        return matches[:limit]

    def best(self, query: str) -> AppMatch | None:
        found = self.resolve(query, limit=1)
        return found[0] if found else None

    def process_names_for(self, entry: AppEntry) -> list[str]:
        names = set()
        if entry.exe_name:
            names.add(entry.exe_name.lower())
        base = normalize(entry.name).replace(" ", "")
        if base:
            names.add(base + ".exe")
            names.add(base)
        for alias in entry.aliases:
            a = normalize(alias).replace(" ", "")
            if a and len(a) > 3:
                names.add(a + ".exe")
        if "chrome" in normalize(entry.name):
            names.add("chrome.exe")
        if "edge" in normalize(entry.name):
            names.add("msedge.exe")
        if "visual studio code" in normalize(entry.name):
            names.add("code.exe")
        return sorted(names)

    def public(self) -> list[dict[str, Any]]:
        return [e.to_dict() for e in self._entries]
