"""Safe terminal integration.

The model can never type a command line. It picks a *classified command*
(e.g. `run_script`, `git_status`) whose arguments are validated; the manager
builds the argv list itself, applies the security denylist (to the argv and to
the bodies of the package.json scripts the package manager will run) and
spawns the process without a shell. Output is streamed to the UI and every process can
be cancelled (whole process tree).
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import secrets
import shutil
import sys
import time
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import psutil

from ..activity import ActivityLog, Category
from ..eventbus import EventBus
from ..security import check_command, check_read, check_script

_SCRIPT_NAME = re.compile(r"^[A-Za-z0-9:_.\-]{1,64}$")
_PORT_PATTERNS = [
    re.compile(r"https?://(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\])(?::(\d{2,5}))", re.I),
    re.compile(r"\b(?:port|porta)\s*[:=]?\s*(\d{2,5})\b", re.I),
]
_ERROR_HINT = re.compile(r"(error|erro|exception|traceback|failed|fatal|cannot find|not found|ENOENT|EADDRINUSE)",
                         re.I)


@dataclass
class ManagedProcess:
    id: str
    label: str
    argv: list[str]
    cwd: str
    started_at: float
    status: str = "running"  # running | exited | killed | failed
    exit_code: int | None = None
    ended_at: float | None = None
    ports: list[int] = field(default_factory=list)
    output: deque[str] = field(default_factory=lambda: deque(maxlen=2000))
    proc: asyncio.subprocess.Process | None = field(default=None, repr=False)
    long_running: bool = False

    @property
    def duration_s(self) -> float:
        return round((self.ended_at or time.time()) - self.started_at, 2)

    def public(self, with_output: bool = False, tail: int = 200) -> dict[str, Any]:
        out = {
            "id": self.id, "label": self.label, "command": " ".join(self.argv), "cwd": self.cwd,
            "startedAt": self.started_at, "status": self.status, "exitCode": self.exit_code,
            "durationS": self.duration_s, "ports": self.ports, "pid": self.proc.pid if self.proc else None,
            "longRunning": self.long_running,
        }
        if with_output:
            out["output"] = list(self.output)[-tail:]
        return out

    def error_lines(self, limit: int = 40) -> list[str]:
        lines = list(self.output)
        hits = [i for i, line in enumerate(lines) if _ERROR_HINT.search(line)]
        if not hits:
            return lines[-limit:]
        start = max(0, hits[0] - 3)
        return lines[start:start + limit]


def detect_package_manager(project: Path) -> str:
    if (project / "pnpm-lock.yaml").exists():
        return "pnpm"
    if (project / "yarn.lock").exists():
        return "yarn"
    if (project / "bun.lockb").exists() or (project / "bun.lock").exists():
        return "bun"
    return "npm"


def read_package_json(project: Path) -> dict[str, Any] | None:
    pj = project / "package.json"
    if not pj.is_file():
        return None
    try:
        return json.loads(pj.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def project_scripts(project: Path) -> dict[str, str]:
    data = read_package_json(project) or {}
    scripts = data.get("scripts") or {}
    return {k: str(v) for k, v in scripts.items() if isinstance(k, str) and _SCRIPT_NAME.match(k)}


_SCRIPT_REF = re.compile(r"\b(?:npm|pnpm|yarn|bun)(?:\s+run)?\s+([A-Za-z0-9:_.\-]{1,64})")
INSTALL_HOOKS = ("preinstall", "install", "postinstall", "preprepare", "prepare", "postprepare")


def scripts_to_run(scripts: dict[str, str], entry: tuple[str, ...]) -> list[str]:
    """The scripts a package manager will run for `entry`: pre/post hooks and scripts they call."""
    seen: list[str] = []
    todo = list(entry)
    while todo:
        name = todo.pop(0)
        if name in seen or name not in scripts:
            continue
        seen.append(name)
        todo += [f"pre{name}", f"post{name}"] + _SCRIPT_REF.findall(scripts[name])
    return seen


def check_scripts(scripts: dict[str, str], entry: tuple[str, ...]) -> None:
    for name in scripts_to_run(scripts, entry):
        check_script(name, scripts[name])


def _resolve_exe(name: str) -> str:
    exe = shutil.which(name)
    if not exe:
        raise FileNotFoundError(f"'{name}' não foi encontrado no PATH.")
    return exe


class TerminalManager:
    MAX_PROCESSES = 12

    def __init__(self, bus: EventBus, activity: ActivityLog) -> None:
        self.bus = bus
        self.activity = activity
        self.processes: dict[str, ManagedProcess] = {}

    # ------------------------------------------------------ classification
    def build(self, command: str, project: Path, args: dict[str, Any]) -> tuple[list[str], str, bool]:
        """Return (argv, label, long_running) for a classified command. Raises ValueError."""
        project = check_read(project)
        if not project.is_dir():
            raise ValueError(f"Pasta do projeto não encontrada: {project}")
        py = sys.executable
        if command == "run_script":
            script = str(args.get("script", ""))
            scripts = project_scripts(project)
            if script not in scripts:
                avail = ", ".join(sorted(scripts)) or "nenhum"
                raise ValueError(f"Script '{script}' não existe no package.json (disponíveis: {avail}).")
            check_scripts(scripts, (script,))
            pm = detect_package_manager(project)
            argv = [_resolve_exe(pm), "run", script]
            long_running = script in ("dev", "start", "serve", "watch", "preview") or "watch" in scripts[script]
            return argv, f"{pm} run {script}", long_running
        if command == "install_deps":
            pm = detect_package_manager(project)
            if not (project / "package.json").exists():
                raise ValueError("Não há package.json nesse projeto.")
            check_scripts(project_scripts(project), INSTALL_HOOKS)
            return [_resolve_exe(pm), "install"], f"{pm} install", False
        if command == "run_tests":
            if (project / "package.json").exists() and "test" in project_scripts(project):
                check_scripts(project_scripts(project), ("test",))
                pm = detect_package_manager(project)
                return [_resolve_exe(pm), "test"], f"{pm} test", False
            if any((project / f).exists() for f in ("pyproject.toml", "pytest.ini", "setup.cfg", "tests")):
                venv_py = project / (".venv/Scripts/python.exe" if os.name == "nt" else ".venv/bin/python")
                interpreter = str(venv_py) if venv_py.exists() else py
                return [interpreter, "-m", "pytest", "-q"], "pytest", False
            if (project / "Cargo.toml").exists():
                return [_resolve_exe("cargo"), "test"], "cargo test", False
            raise ValueError("Não encontrei uma suíte de testes reconhecida nesse projeto.")
        if command == "git_status":
            return [_resolve_exe("git"), "status", "--short", "--branch"], "git status", False
        if command == "git_log":
            return [_resolve_exe("git"), "log", "--oneline", "-n", "15"], "git log", False
        if command == "git_diff_stat":
            return [_resolve_exe("git"), "diff", "--stat"], "git diff --stat", False
        if command == "versions":
            tool = str(args.get("tool", "node"))
            allowed = {"node": ["node", "--version"], "npm": ["npm", "--version"], "python": [py, "--version"],
                       "git": ["git", "--version"], "pnpm": ["pnpm", "--version"], "yarn": ["yarn", "--version"]}
            if tool not in allowed:
                raise ValueError(f"Ferramenta não suportada: {tool}")
            argv = allowed[tool]
            return [argv[0] if os.path.isabs(argv[0]) else _resolve_exe(argv[0])] + argv[1:], f"{tool} --version", False
        raise ValueError(f"Comando não classificado: {command}")

    # ----------------------------------------------------------- execution
    async def start(self, argv: list[str], cwd: Path, label: str, long_running: bool = False) -> ManagedProcess:
        check_command(argv)
        running = [p for p in self.processes.values() if p.status == "running"]
        if len(running) >= self.MAX_PROCESSES:
            raise RuntimeError("Muitos processos em execução. Encerre algum antes.")
        mp = ManagedProcess(secrets.token_hex(4), label, argv, str(cwd), time.time(), long_running=long_running)
        env = dict(os.environ)
        env.setdefault("FORCE_COLOR", "0")
        env["NO_COLOR"] = "1"
        kwargs: dict[str, Any] = {}
        if os.name == "nt":
            kwargs["creationflags"] = 0x08000000 | 0x00000200  # CREATE_NO_WINDOW | NEW_PROCESS_GROUP
        else:
            kwargs["start_new_session"] = True
        try:
            mp.proc = await asyncio.create_subprocess_exec(
                *argv, cwd=str(cwd), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
                stdin=asyncio.subprocess.DEVNULL, env=env, **kwargs)
        except (OSError, ValueError) as exc:
            mp.status, mp.ended_at = "failed", time.time()
            mp.output.append(str(exc))
            self.processes[mp.id] = mp
            raise RuntimeError(f"Não consegui iniciar '{label}': {exc}") from exc
        self.processes[mp.id] = mp
        self._trim()
        self.activity.log(Category.TOOLS, f"Processo iniciado: {label}", cwd=str(cwd), pid=mp.proc.pid)
        await self.bus.publish("terminal.started", mp.public())
        asyncio.create_task(self._pump(mp), name=f"terminal-{mp.id}")
        return mp

    async def _pump(self, mp: ManagedProcess) -> None:
        assert mp.proc and mp.proc.stdout
        batch: list[str] = []
        last_flush = time.time()
        pending = b""
        while True:
            # Chunked reads: readline() raises on lines over 64 KiB (minified output, progress bars).
            try:
                chunk: bytes | None = await asyncio.wait_for(mp.proc.stdout.read(65536), timeout=0.25)
            except asyncio.TimeoutError:
                chunk = None
            if chunk == b"":
                if pending:
                    await self._ingest(mp, pending, batch)
                break
            if chunk:
                *complete, pending = (pending + chunk).split(b"\n")
                if len(pending) > 65536:
                    complete.append(pending)
                    pending = b""
                for line_b in complete:
                    await self._ingest(mp, line_b, batch)
            if batch and (time.time() - last_flush > 0.1 or len(batch) > 50):
                await self.bus.publish("terminal.output", {"id": mp.id, "lines": batch})
                batch, last_flush = [], time.time()
        if batch:
            await self.bus.publish("terminal.output", {"id": mp.id, "lines": batch})
        code = await mp.proc.wait()
        mp.exit_code = code
        mp.ended_at = time.time()
        if mp.status == "running":
            mp.status = "exited"
        level = "info" if code == 0 or mp.status == "killed" else "warning"
        self.activity.log(Category.TOOLS, f"Processo finalizado: {mp.label} (código {code})", level=level,
                          durationS=mp.duration_s)
        await self.bus.publish("terminal.exited", mp.public())

    async def _ingest(self, mp: ManagedProcess, line_b: bytes, batch: list[str]) -> None:
        line = _strip_ansi(line_b.decode("utf-8", errors="replace").rstrip("\r"))[:4000]
        mp.output.append(line)
        batch.append(line)
        for rx in _PORT_PATTERNS:
            for m in rx.finditer(line):
                try:
                    port = int(m.group(1))
                except (TypeError, ValueError):
                    continue
                if 1 <= port <= 65535 and port not in mp.ports:
                    mp.ports.append(port)
                    await self.bus.publish("terminal.port", {"id": mp.id, "port": port})

    async def wait(self, mp: ManagedProcess, timeout: float) -> bool:
        if not mp.proc:
            return True
        try:
            await asyncio.wait_for(mp.proc.wait(), timeout=timeout)
            # let the pump drain the last lines
            for _ in range(20):
                if mp.ended_at:
                    break
                await asyncio.sleep(0.05)
            return True
        except asyncio.TimeoutError:
            return False

    async def stop(self, proc_id: str) -> bool:
        mp = self.processes.get(proc_id)
        if not mp or not mp.proc or mp.status != "running":
            return False
        mp.status = "killed"
        await asyncio.to_thread(kill_tree, mp.proc.pid)
        return True

    async def stop_all(self) -> None:
        for pid in [p.id for p in self.processes.values() if p.status == "running"]:
            await self.stop(pid)

    def last(self) -> ManagedProcess | None:
        if not self.processes:
            return None
        return max(self.processes.values(), key=lambda p: p.started_at)

    def get(self, proc_id: str) -> ManagedProcess | None:
        return self.processes.get(proc_id)

    def public(self) -> list[dict[str, Any]]:
        return [p.public() for p in sorted(self.processes.values(), key=lambda p: p.started_at, reverse=True)]

    def _trim(self) -> None:
        finished = sorted((p for p in self.processes.values() if p.status != "running"), key=lambda p: p.started_at)
        while len(self.processes) > 30 and finished:
            self.processes.pop(finished.pop(0).id, None)


def kill_tree(pid: int, timeout: float = 4.0) -> None:
    try:
        parent = psutil.Process(pid)
    except psutil.NoSuchProcess:
        return
    procs = parent.children(recursive=True) + [parent]
    for p in procs:
        try:
            p.terminate()
        except psutil.Error:
            pass
    for p in _wait_gone(procs, timeout):
        try:
            p.kill()
        except psutil.Error:
            pass


def _alive(p: psutil.Process) -> bool:
    try:
        return p.is_running() and p.status() != psutil.STATUS_ZOMBIE
    except psutil.Error:
        return False


def _wait_gone(procs: list[psutil.Process], timeout: float) -> list[psutil.Process]:
    """Poll until the processes exit. Never reaps them: psutil.wait_procs() calls waitpid() on our
    own children, stealing the exit status from the event loop so `await proc.wait()` never returns."""
    deadline = time.time() + timeout
    alive = [p for p in procs if _alive(p)]
    while alive and time.time() < deadline:
        time.sleep(0.05)
        alive = [p for p in alive if _alive(p)]
    return alive


_ANSI = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]")


def _strip_ansi(s: str) -> str:
    return _ANSI.sub("", s)


def listening_ports() -> list[dict[str, Any]]:
    rows: dict[tuple[int, int], dict[str, Any]] = {}
    try:
        conns = psutil.net_connections(kind="inet")
    except (psutil.AccessDenied, OSError):
        return []
    for c in conns:
        if c.status != psutil.CONN_LISTEN or not c.laddr:
            continue
        key = (c.laddr.port, c.pid or 0)
        if key in rows:
            continue
        name = ""
        if c.pid:
            try:
                name = psutil.Process(c.pid).name()
            except psutil.Error:
                name = ""
        rows[key] = {"port": c.laddr.port, "address": c.laddr.ip, "pid": c.pid, "process": name}
    return sorted(rows.values(), key=lambda r: r["port"])
