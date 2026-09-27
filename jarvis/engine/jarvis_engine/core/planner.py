"""ActionPlanner: turns routed intents into verified multi-step executions.

Every step that touches the computer goes through the ActionExecutor (and thus
the PermissionManager), except inside an already-authorised composite tool
(e.g. `run_project`), whose confirmation text covers all of its steps.
"""

from __future__ import annotations

import asyncio
import shutil
import time
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

import httpx
import psutil

from ..activity import Category
from ..platform.base import spawn_detached
from ..security import check_read
from ..services.terminal import detect_package_manager, listening_ports, project_scripts
from ..tools.base import ToolContext, ToolResult, fail, ok
from .intents import KNOWN_SITES, MEDIA_APPS, Intent, fold
from .tasks import Step, StepOutcome, TaskRun

if TYPE_CHECKING:  # pragma: no cover
    from ..services.container import Services

FOLDER_WORDS = {"downloads", "download", "documentos", "area de trabalho", "desktop", "imagens", "fotos", "musicas",
                "videos", "pasta pessoal", "meus documentos"}
PRONOUNS = {"ele", "ela", "isso", "isto", "esse", "essa", "este", "esta", "esse arquivo", "este arquivo",
            "essa pasta", "esta pasta", "esses arquivos", "estes arquivos", "eles", "elas", "o arquivo", "a pasta", ""}


class ActionPlanner:
    def __init__(self, services: "Services") -> None:
        self.s = services

    async def run(self, intent: Intent, source: str) -> ToolResult:
        handler = getattr(self, f"plan_{intent.plan}", None)
        if handler is None:
            return fail(f"Plano desconhecido: {intent.plan}")
        return await handler(source=source, **intent.args)

    async def _exec(self, tool_id: str, args: dict[str, Any], source: str, task_id: str | None = None) -> ToolResult:
        return await self.s.executor.execute(tool_id, args, source=source, task_id=task_id)

    # ------------------------------------------------------------- simple
    async def plan_greeting(self, source: str) -> ToolResult:
        hour = datetime.now().hour
        salute = "Bom dia" if 5 <= hour < 12 else "Boa tarde" if 12 <= hour < 18 else "Boa noite"
        name = self.s.settings.general.user_name
        snap = self.s.monitor.last or await asyncio.to_thread(self.s.monitor.sample)
        start = datetime.now()
        end = start.replace(hour=23, minute=59, second=59)
        rems = self.s.reminders.between(start.timestamp(), end.timestamp())
        parts = [f"{salute}{', ' + name if name else ''}."]
        cpu, mem = snap["cpu"]["percent"], snap["memory"]["percent"]
        parts.append(f"Sistemas operacionais: CPU em {cpu:.0f}% e memória em {mem:.0f}%.")
        if rems:
            parts.append(f"Você tem {len(rems)} lembrete{'s' if len(rems) > 1 else ''} para hoje.")
        return ok(" ".join(parts))

    async def plan_adjust_referenced(self, source: str, direction: int, amount: int,
                                     volume_only: bool = False) -> ToolResult:
        app = self.s.context.get("app")
        if not app:
            return await self._exec("set_volume", {"delta": direction * amount}, source)
        name = app.get("name", "")
        is_media = any(w in fold(name) for w in MEDIA_APPS)
        if volume_only or is_media:
            res = await self._exec("set_volume", {"delta": direction * max(amount, 20), "app": name}, source)
            if res.ok or volume_only:
                return res
        return await self._exec("window_state", {"state": "minimize" if direction < 0 else "maximize",
                                                 "name": name}, source)

    async def plan_open_target(self, source: str, name: str) -> ToolResult:
        f = fold(name).strip()
        if f in FOLDER_WORDS or f.startswith("pasta "):
            return await self._exec("open_folder", {"name": name}, source)
        if f in ("navegador", "browser", "o navegador", "internet"):
            return await self._exec("open_browser", {}, source)
        if f in ("configuracoes", "configuracoes do windows", "ajustes"):
            return await self._exec("open_system_settings", {"page": "home"}, source)
        if f in PRONOUNS - {""}:
            return await self.plan_open_referenced(source)
        apps = self.s.apps
        match = apps.best(name)
        site = KNOWN_SITES.get(f)
        if match and (match.score >= 0.8 or (site is None and match.score >= 0.6)):
            return await self._exec("open_application", {"name": match.entry.name}, source)
        if site:
            return await self._exec("open_url", {"url": site}, source)
        if "." in f and " " not in f:
            return await self._exec("open_url", {"url": name}, source)
        hits = await asyncio.to_thread(self.s.files.search, name, limit=3)
        exact = [h for h in hits if fold(Path(h["name"]).stem) == f or fold(h["name"]) == f]
        if exact:
            return await self._exec("open_path", {"path": exact[0]["path"]}, source)
        if apps.refreshing:
            return fail(f"Ainda estou indexando os aplicativos; tente '{name}' novamente em instantes.")
        return fail(f"Não encontrei um aplicativo, site ou pasta chamado '{name}'.")

    async def plan_scoped_search(self, source: str, query: str, fallback: str = "files") -> ToolResult:
        folder = self.s.context.most_recent(("folder",))
        folder_name = folder.label if folder else "pasta atual"
        res = await self._exec("search_files", {"query": query, "folder": "aqui", "limit": 10}, source)
        if res.ok and res.data.get("results"):
            return res
        tool_id, args = ("find_projects", {"query": query}) if fallback == "project" else \
            ("search_files", {"query": query, "limit": 10})
        res = await self._exec(tool_id, args, source)
        if res.ok and (res.data.get("results") or []):
            res.message = f"Não encontrei em {folder_name}. " + res.message
        return res

    async def plan_search_this(self, source: str, engine: str = "google") -> ToolResult:
        topic = self.s.context.get("topic")
        if not topic:
            clip = await self._exec("clipboard_read", {}, source)
            topic = (clip.data.get("text") or "").strip() if clip.ok else ""
        if not topic:
            return fail("Pesquisar o quê? Diga o assunto ou copie o texto antes.")
        return await self._exec("web_search", {"query": str(topic)[:300], "engine": engine}, source)

    async def plan_open_referenced(self, source: str) -> ToolResult:
        e = self.s.context.most_recent(("file", "folder", "project", "url"))
        if e is None:
            files = self.s.context.get("files") or []
            if len(files) == 1:
                return await self._exec("open_path", {"path": files[0]["path"]}, source)
            return fail("Não sei a que você se refere. Diga o nome do arquivo, pasta ou aplicativo.")
        if e.kind == "url":
            return await self._exec("open_url", {"url": str(e.value)}, source)
        return await self._exec("open_path", {"path": e.value["path"]}, source)

    async def plan_open_from_results(self, source: str, selector: str) -> ToolResult:
        pick = self.s.context.pick_from_results(selector)
        if pick is None:
            return fail("Não há resultados recentes para escolher. Peça uma busca primeiro.")
        return await self._exec("open_path", {"path": pick["path"]}, source)

    async def _resolve_paths(self, text: str, kinds: tuple[str, ...] = ("file", "folder", "project")) -> list[str]:
        t = fold(text).strip()
        if t in PRONOUNS or t in ("os resultados", "eles todos", "todos eles"):
            if t in ("esses arquivos", "estes arquivos", "eles", "elas", "os resultados", "eles todos", "todos eles"):
                files = self.s.context.get("files") or []
                if files:
                    return [f["path"] for f in files]
            e = self.s.context.most_recent(kinds)
            if e and isinstance(e.value, dict):
                return [e.value["path"]]
            files = self.s.context.get("files") or []
            return [files[0]["path"]] if len(files) == 1 else []
        p = Path(text.strip('"'))
        if p.is_absolute() and p.exists():
            return [str(p)]
        cur = self.s.context.latest_file_or_folder()
        if cur:
            base = Path(cur) if Path(cur).is_dir() else Path(cur).parent
            cand = base / text
            if cand.exists():
                return [str(cand)]
        hits = await asyncio.to_thread(self.s.files.search, text, limit=8)
        hits = [h for h in hits if Path(h["path"]).exists()]
        if not hits:
            hits = await asyncio.to_thread(self.s.files.live_search, text, self.s.files.roots(), 2.5, 8)
        exact = [h for h in hits if fold(h["name"]) == t or fold(Path(h["name"]).stem) == t]
        chosen = exact[:1] or hits[:1]
        if chosen:
            self.s.context.remember({"files": [{"path": h["path"], "name": h["name"], "mtime": h["mtime"],
                                                "isDir": h["isDir"]} for h in hits]})
        return [c["path"] for c in chosen]

    async def plan_open_by_name(self, source: str, name: str, kind: str = "arquivo") -> ToolResult:
        exts = {"planilha": ["planilha"], "apresentacao": ["apresentacao"], "pdf": ["pdf"], "foto": ["foto"],
                "imagem": ["imagem"], "video": ["video"], "documento": ["documento"]}.get(kind)
        args: dict[str, Any] = {"query": name, "limit": 5}
        if exts:
            args["extensions"] = exts
        res = await self._exec("search_files", args, source)
        results = res.data.get("results") or []
        if not res.ok or not results:
            return fail(f"Não encontrei {kind} '{name}'.")
        return await self._exec("open_path", {"path": results[0]["path"]}, source)

    async def plan_rename(self, source: str, target: str = "", new_name: str = "") -> ToolResult:
        paths = await self._resolve_paths(target)
        if not paths:
            return fail(f"Não encontrei '{target}'.")
        return await self._exec("rename_path", {"path": paths[0], "new_name": new_name}, source)

    async def plan_move(self, source: str, destination: str, target: str = "") -> ToolResult:
        paths = await self._resolve_paths(target)
        if not paths:
            return fail(f"Não encontrei '{target}'.")
        last: ToolResult = fail("Nada movido.")
        for p in paths[:50]:
            last = await self._exec("move_path", {"path": p, "destination": destination}, source)
            if not last.ok:
                return last
        if len(paths) > 1:
            return ok(f"{len(paths)} itens movidos para {destination}.")
        return last

    async def plan_copy(self, source: str, destination: str, target: str = "") -> ToolResult:
        paths = await self._resolve_paths(target)
        if not paths:
            return fail(f"Não encontrei '{target}'.")
        last: ToolResult = fail("Nada copiado.")
        for p in paths[:50]:
            last = await self._exec("copy_path", {"path": p, "destination": destination}, source)
            if not last.ok:
                return last
        if len(paths) > 1:
            return ok(f"{len(paths)} itens copiados para {destination}.")
        return last

    async def plan_delete(self, source: str, permanent: bool = False, target: str = "") -> ToolResult:
        paths = await self._resolve_paths(target)
        if not paths:
            return fail("Não sei o que apagar. Diga o nome do arquivo ou faça uma busca antes.")
        return await self._exec("delete_paths", {"paths": paths, "permanent": permanent}, source)

    async def plan_summarize(self, source: str, name: str = "", focus: str = "") -> ToolResult:
        args: dict[str, Any] = {}
        if name and fold(name) not in PRONOUNS:
            paths = await self._resolve_paths(name, ("file",))
            if not paths:
                return fail(f"Não encontrei o documento '{name}'.")
            args["path"] = paths[0]
        if focus:
            args["focus"] = focus
        return await self._exec("summarize_file", args, source)

    async def plan_open_project(self, source: str, project: str) -> ToolResult:
        res = await self._exec("find_projects", {"query": project, "limit": 5}, source)
        results = res.data.get("results") or []
        if not results:
            return fail(f"Não encontrei o projeto '{project}'.") if res.ok else res
        best = results[0]
        count = len(results)
        if self.s.platform.vscode_command():
            opened = await self._exec("open_in_vscode", {"path": best["path"]}, source)
        else:
            opened = await self._exec("open_path", {"path": best["path"]}, source)
        if not opened.ok:
            return opened
        lead = (f"Localizei {count} projetos. Abrindo o mais relevante, {best['name']}." if count > 1
                else f"Abrindo o projeto {best['name']}.")
        return ok(lead, {"project": best}, entities={"project": {"path": best["path"], "name": best["name"]}})

    async def plan_run_project(self, source: str, project: str = "", open_editor: bool = False) -> ToolResult:
        return await self._exec("run_project", {"project": project, "open_editor": open_editor}, source)


# ============================================================== run_project
async def run_project_plan(ctx: ToolContext, project_query: str | None, open_editor: bool) -> ToolResult:
    s = ctx.services
    tm = s.tasks
    title = f"Rodar projeto {project_query}" if project_query else "Rodar projeto"
    task = tm.create(title, source=ctx.source)
    st = task.state

    async def locate(t: TaskRun, step: Step) -> StepOutcome:
        if project_query:
            hits = await asyncio.to_thread(s.files.projects, project_query, 5)
            if not hits:
                hits = await asyncio.to_thread(s.files.search, project_query, kind="dir", limit=3)
            if not hits:
                return StepOutcome(False, f"Projeto '{project_query}' não encontrado")
            path = Path(hits[0]["path"])
        else:
            cur = s.context.most_recent(("project", "folder"))
            if not cur or not isinstance(cur.value, dict):
                return StepOutcome(False, "Nenhum projeto no contexto")
            path = Path(cur.value["path"])
        st["path"] = check_read(path)
        s.context.remember({"project": {"path": str(path), "name": path.name}})
        return StepOutcome(True, str(path))

    async def open_dir(t: TaskRun, step: Step) -> StepOutcome:
        path: Path = st["path"]
        cmd = s.platform.vscode_command() if open_editor else None
        if cmd:
            await asyncio.to_thread(spawn_detached, cmd + [str(path)])
            return StepOutcome(True, "Aberto no VS Code")
        if open_editor:
            await asyncio.to_thread(s.platform.open_path, path)
            return StepOutcome(True, "VS Code não encontrado; aberto no Explorador")
        return StepOutcome(True, "Diretório pronto")

    async def detect_manifest(t: TaskRun, step: Step) -> StepOutcome:
        path: Path = st["path"]
        if not (path / "package.json").is_file():
            return StepOutcome(False, "Não há package.json (por enquanto rodo projetos Node.js)")
        scripts = project_scripts(path)
        st["scripts"] = scripts
        script = next((n for n in ("dev", "start", "serve", "develop", "preview") if n in scripts), None)
        if not script:
            names = ", ".join(scripts) or "nenhum"
            return StepOutcome(False, f"Nenhum script dev/start/serve no package.json (scripts: {names})")
        st["script"] = script
        return StepOutcome(True, f"{len(scripts)} scripts; usarei '{script}'")

    async def detect_pm(t: TaskRun, step: Step) -> StepOutcome:
        pm = detect_package_manager(st["path"])
        st["pm"] = pm
        if not shutil.which(pm):
            return StepOutcome(False, f"{pm} não está instalado ou não está no PATH")
        return StepOutcome(True, pm)

    async def install(t: TaskRun, step: Step) -> StepOutcome:
        path: Path = st["path"]
        if (path / "node_modules").is_dir():
            return StepOutcome(True, "Dependências já instaladas")
        argv, label, _ = s.terminal.build("install_deps", path, {})
        mp = await s.terminal.start(argv, path, label)
        await tm.set_step(t, step, "running", f"{label} em andamento…")
        done = await s.terminal.wait(mp, timeout=600)
        if not done:
            await s.terminal.stop(mp.id)
            return StepOutcome(False, "Instalação excedeu 10 minutos")
        return StepOutcome(mp.exit_code == 0, f"{label}: código {mp.exit_code}")

    async def start_env(t: TaskRun, step: Step) -> StepOutcome:
        argv, label, _ = s.terminal.build("run_script", st["path"], {"script": st["script"]})
        mp = await s.terminal.start(argv, st["path"], label, long_running=True)
        st["mp"] = mp
        s.context.remember({"terminal": {"id": mp.id, "label": label}})
        return StepOutcome(True, label)

    async def detect_port(t: TaskRun, step: Step) -> StepOutcome:
        mp = st["mp"]
        deadline = time.time() + 90
        while time.time() < deadline:
            if mp.status != "running":
                err = mp.error_lines(3)
                return StepOutcome(False, f"O processo terminou (código {mp.exit_code}). {err[0][:160] if err else ''}")
            if mp.ports:
                st["port"] = mp.ports[0]
                return StepOutcome(True, f"Porta {mp.ports[0]}")
            try:
                tree = {mp.proc.pid} | {c.pid for c in psutil.Process(mp.proc.pid).children(recursive=True)}
            except psutil.Error:
                tree = set()
            ports = [p for p in await asyncio.to_thread(listening_ports) if p["pid"] in tree]
            if ports:
                st["port"] = ports[0]["port"]
                return StepOutcome(True, f"Porta {ports[0]['port']}")
            await asyncio.sleep(1.0)
        return StepOutcome(False, "Nenhuma porta detectada em 90 s")

    async def verify(t: TaskRun, step: Step) -> StepOutcome:
        port = st["port"]
        url = f"http://localhost:{port}"
        for _ in range(20):
            try:
                async with httpx.AsyncClient(timeout=3) as client:
                    r = await client.get(url)
                if r.status_code < 500:
                    st["url"] = url
                    return StepOutcome(True, f"{url} respondeu HTTP {r.status_code}")
            except httpx.HTTPError:
                pass
            await asyncio.sleep(1.0)
        st["url"] = url
        return StepOutcome(True, f"Processo ativo, mas {url} ainda não respondeu")

    async def open_url(t: TaskRun, step: Step) -> StepOutcome:
        url = st["url"]
        await asyncio.to_thread(s.platform.open_uri, url)
        s.context.remember({"url": url})
        return StepOutcome(True, url, message=f"Projeto {st['path'].name} rodando em {url}.")

    for label, fn in (("Localizar projeto", locate), ("Abrir diretório", open_dir),
                      ("Detectar package.json", detect_manifest), ("Identificar gerenciador de pacotes", detect_pm),
                      ("Instalar dependências (se necessário)", install), ("Iniciar ambiente de desenvolvimento", start_env),
                      ("Detectar porta", detect_port), ("Verificar processo", verify), ("Abrir URL local", open_url)):
        tm.add_step(task, label, fn)
    s.context.set_task({"id": task.id, "title": task.title}, [x.title for x in task.steps])
    await tm.run(task)
    s.context.set_task(None)
    if task.status == "completed":
        return ok(task.result or "Projeto em execução.", {"task": task.public()}, verified=True)
    if task.status == "cancelled":
        return fail("Tarefa cancelada.")
    failed = next((x for x in task.steps if x.status == "failed"), None)
    s.activity.log(Category.TASKS, f"Falha ao rodar projeto: {failed.detail if failed else task.error}",
                   level="warning")
    where = f" na etapa '{failed.title}'" if failed else ""
    return fail(f"Não consegui rodar o projeto{where}: {failed.detail if failed else task.error}.",
                data={"task": task.public()})

