"""Application tools: open/close/focus apps, window state, VS Code."""

from __future__ import annotations

import asyncio
import os
import re
import time
from pathlib import Path
from typing import Any

import psutil

from ..core.text import normalize, similarity
from ..platform.base import AppEntry, spawn_detached
from ..security import check_read, is_critical_process
from .base import PermissionLevel as L
from .base import Tool, ToolContext, ToolExecutionError, ToolParam, ToolResult, fail, ok, tool


def _running_names() -> dict[str, list[int]]:
    out: dict[str, list[int]] = {}
    for p in psutil.process_iter(["name"]):
        n = (p.info.get("name") or "").lower()
        if n:
            out.setdefault(n, []).append(p.pid)
    return out


def _matching_pids(names: list[str], query: str) -> dict[str, list[int]]:
    running = _running_names()
    wanted = {n.lower() for n in names}
    q = normalize(query).replace(" ", "")
    hits: dict[str, list[int]] = {}
    for pname, pids in running.items():
        stem = pname[:-4] if pname.endswith(".exe") else pname
        if pname in wanted or stem in wanted or (len(q) >= 4 and (stem == q or similarity(stem, q) > 0.88)):
            hits[pname] = pids
    return hits


def _resolve_app(ctx: ToolContext, name: str) -> AppEntry:
    apps = ctx.services.apps
    match = apps.best(name)
    if match is None:
        if apps.refreshing:
            raise ToolExecutionError(f"Ainda estou indexando os aplicativos instalados. Tente '{name}' de novo "
                                     "em alguns segundos.")
        raise ToolExecutionError(f"Não encontrei um aplicativo chamado '{name}'.")
    return match.entry


@tool("open_application", "Abrir aplicativo",
      "Abre um aplicativo instalado pelo nome natural (ex.: 'Spotify', 'Chrome', 'VS Code', 'calculadora').",
      L.REVERSIBLE, "apps",
      [ToolParam("name", "string", "Nome do aplicativo", max_length=120)],
      describe=lambda a: f"Abrir {a.get('name')}")
async def open_application(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    entry = _resolve_app(ctx, args["name"])
    apps = ctx.services.apps
    names = apps.process_names_for(entry)
    before = _matching_pids(names, entry.name)
    before_pids = {pid for pids in before.values() for pid in pids}
    await asyncio.to_thread(ctx.services.platform.launch_app, entry)
    verified = False
    deadline = time.time() + 6
    while time.time() < deadline:
        await asyncio.sleep(0.5)
        now_hits = await asyncio.to_thread(_matching_pids, names, entry.name)
        pids = {pid for p in now_hits.values() for pid in p}
        if pids - before_pids or (before_pids and pids):
            verified = True
            break
    ent = {"app": {"name": entry.name, "exe": entry.exe_name, "processNames": names}}
    if verified:
        msg = f"{entry.name} aberto." if not before_pids else f"{entry.name} já estava aberto; trouxe uma nova janela."
        return ok(msg, {"app": entry.to_dict()}, entities=ent, verified=True)
    return ok(f"Solicitei a abertura do {entry.name}.", {"app": entry.to_dict()}, entities=ent, verified=False)


def _close_target(args: dict[str, Any], ctx: ToolContext) -> tuple[str, list[str]]:
    name = args.get("name") or ""
    if not name:
        app = ctx.services.context.get("app")
        if not app:
            raise ToolExecutionError("Qual aplicativo devo fechar?")
        return app["name"], app.get("processNames") or []
    match = ctx.services.apps.best(name)
    if match:
        return match.entry.name, ctx.services.apps.process_names_for(match.entry)
    return name, [normalize(name).replace(" ", "") + ".exe"]


async def _close_precheck(args: dict[str, Any], ctx: ToolContext) -> ToolResult | None:
    label, names = _close_target(args, ctx)
    hits = await asyncio.to_thread(_matching_pids, names, label)
    if not any(not is_critical_process(n) for n in hits):
        return fail(f"{label} não está aberto.")
    return None


@tool("close_application", "Fechar aplicativo",
      "Fecha um aplicativo pedindo que ele encerre normalmente (o programa pode pedir para salvar).",
      L.IMPORTANT, "apps",
      [ToolParam("name", "string", "Nome do aplicativo (vazio = o último mencionado)", required=False,
                 max_length=120)],
      describe=lambda a: f"Fechar {a.get('name') or 'o aplicativo atual'}", precheck=_close_precheck)
async def close_application(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    label, names = _close_target(args, ctx)
    hits = await asyncio.to_thread(_matching_pids, names, label)
    hits = {n: p for n, p in hits.items() if not is_critical_process(n)}
    own = os.getpid()
    pids = [pid for p in hits.values() for pid in p if pid != own]
    if not pids:
        return fail(f"{label} não está aberto.")
    roots = []
    for pid in pids:
        try:
            parent = psutil.Process(pid).parent()
        except psutil.Error:
            continue
        if parent is None or parent.pid not in pids:
            roots.append(pid)
    for pid in roots or pids:
        try:
            await asyncio.to_thread(ctx.services.platform.close_process_gracefully, pid)
        except (ProcessLookupError, psutil.Error, OSError):
            pass
    await asyncio.sleep(3)
    alive = [pid for pid in pids if psutil.pid_exists(pid)]
    if alive:
        return ToolResult(False, f"{label} não fechou (talvez esteja pedindo para salvar algo). "
                                 "Posso forçar o encerramento se você confirmar.",
                          {"alive": alive}, "still_running", verified=False)
    return ok(f"{label} fechado.", {"closed": pids}, verified=True)


@tool("list_applications", "Aplicativos instalados",
      "Pesquisa os aplicativos instalados que o Jarvis conhece.", L.READ, "apps",
      [ToolParam("query", "string", "Filtro (vazio lista a contagem)", required=False, max_length=120)],
      describe=lambda a: "Consultar aplicativos instalados")
async def list_applications(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    apps = ctx.services.apps
    q = args.get("query")
    if q:
        found = apps.resolve(q, limit=8)
        if not found:
            return fail(f"Nenhum aplicativo instalado corresponde a '{q}'.")
        return ok("Encontrei: " + ", ".join(m.entry.name for m in found) + ".",
                  {"apps": [m.to_dict() for m in found]})
    return ok(f"Conheço {len(apps.entries)} aplicativos instalados.", {"count": len(apps.entries)})


def _find_window(ctx: ToolContext, name: str | None) -> Any:
    windows = ctx.services.platform.list_windows()
    target = name or (ctx.services.context.get("app") or {}).get("name")
    if not target:
        raise ToolExecutionError("Qual janela?")
    q = normalize(target)
    names = []
    m = ctx.services.apps.best(target)
    if m:
        names = [n.lower() for n in ctx.services.apps.process_names_for(m.entry)]
    best, best_score = None, 0.0
    for w in windows:
        proc = w.process.lower()
        title = normalize(w.title)
        score = 0.0
        if proc in names:
            score = 1.0
        elif q and q in title:
            score = 0.9
        elif q and similarity(q, proc.replace(".exe", "")) > 0.8:
            score = 0.8
        if score > best_score:
            best, best_score = w, score
    if best is None:
        raise ToolExecutionError(f"Não encontrei uma janela de {target}.")
    return best


@tool("focus_window", "Focar janela", "Traz a janela de um aplicativo para frente.", L.REVERSIBLE, "apps",
      [ToolParam("name", "string", "Aplicativo ou título da janela", required=False, max_length=120)],
      describe=lambda a: f"Trazer {a.get('name') or 'a janela'} para frente", platforms=("win32",))
async def focus_window(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    w = await asyncio.to_thread(_find_window, ctx, args.get("name"))
    focused = await asyncio.to_thread(ctx.services.platform.focus_window, w.handle)
    active = await asyncio.to_thread(ctx.services.platform.active_window)
    verified = bool(active and active.handle == w.handle)
    return ok(f"Janela '{w.title}' em primeiro plano." if (focused or verified) else
              f"Pedi para focar '{w.title}', mas o Windows pode ter bloqueado.", {"window": w.to_dict()},
              entities={"window": w.to_dict()}, verified=verified)


@tool("window_state", "Minimizar/maximizar janela", "Minimiza, maximiza ou restaura a janela de um aplicativo.",
      L.REVERSIBLE, "apps",
      [ToolParam("state", "string", "Estado desejado", enum=["minimize", "maximize", "restore"]),
       ToolParam("name", "string", "Aplicativo (vazio = último mencionado)", required=False, max_length=120)],
      describe=lambda a: {"minimize": "Minimizar", "maximize": "Maximizar", "restore": "Restaurar"}[a["state"]] +
                         f" {a.get('name') or 'a janela'}", platforms=("win32",))
async def window_state(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    w = await asyncio.to_thread(_find_window, ctx, args.get("name"))
    await asyncio.to_thread(ctx.services.platform.set_window_state, w.handle, args["state"])
    verb = {"minimize": "minimizada", "maximize": "maximizada", "restore": "restaurada"}[args["state"]]
    return ok(f"Janela de {w.process or w.title} {verb}.", {"window": w.to_dict()})


_CMD_UNSAFE = re.compile(r'[&|<>^%"!]')


@tool("open_in_vscode", "Abrir no VS Code",
      "Abre uma pasta ou arquivo no Visual Studio Code (vazio = pasta/projeto do contexto atual).",
      L.REVERSIBLE, "dev",
      [ToolParam("path", "string", "Caminho da pasta ou arquivo", required=False, max_length=1000)],
      describe=lambda a: f"Abrir {a.get('path') or 'a pasta atual'} no VS Code")
async def open_in_vscode(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    cmd = ctx.services.platform.vscode_command()
    if not cmd:
        return fail("Não encontrei o VS Code instalado (comando 'code').")
    raw = args.get("path") or ctx.services.context.latest_file_or_folder()
    argv = list(cmd)
    target: Path | None = None
    if raw:
        target = check_read(raw)
        if not target.exists():
            return fail(f"Caminho não encontrado: {target}")
        if cmd[0].lower().endswith((".cmd", ".bat")) and _CMD_UNSAFE.search(str(target)):
            return fail("Esse caminho tem caracteres que não posso repassar com segurança ao VS Code.")
        argv.append(str(target))
    await asyncio.to_thread(spawn_detached, argv)
    ent: dict[str, Any] = {"app": {"name": "Visual Studio Code", "exe": "code.exe", "processNames": ["code.exe", "code"]}}
    if target is not None:
        ent["project" if target.is_dir() else "file"] = {"path": str(target), "name": target.name}
    where = f" com {target.name}" if target else ""
    return ok(f"Abrindo o VS Code{where}.", {"path": str(target) if target else None}, entities=ent)


TOOLS: list[Tool] = [open_application, close_application, list_applications, focus_window, window_state,
                     open_in_vscode]
