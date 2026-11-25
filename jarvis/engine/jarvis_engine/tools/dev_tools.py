"""Developer copilot tools built on the classified TerminalManager."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ..security import check_read
from ..services.terminal import project_scripts
from .base import PermissionLevel as L
from .base import Tool, ToolContext, ToolExecutionError, ToolParam, ToolResult, fail, ok, tool

COMMANDS = ["run_script", "install_deps", "run_tests", "git_status", "git_log", "git_diff_stat", "versions"]
_READ_ONLY = {"git_status", "git_log", "git_diff_stat", "versions"}


def resolve_project(ctx: ToolContext, project: str | None) -> Path:
    s = ctx.services
    if project:
        p = Path(project)
        if p.is_absolute():
            p = check_read(p)
            if p.is_dir():
                return p
        hits = s.files.projects(project, limit=1)
        if hits:
            return Path(hits[0]["path"])
        raise ToolExecutionError(f"Não encontrei o projeto '{project}'.")
    cur = s.context.most_recent(("project", "folder"))
    if cur and isinstance(cur.value, dict) and Path(cur.value.get("path", "")).is_dir():
        return Path(cur.value["path"])
    raise ToolExecutionError("Qual projeto? Não há nenhum projeto no contexto.")


def _level(args: dict[str, Any]) -> L:
    return L.READ if args.get("command") in _READ_ONLY else L.IMPORTANT


def _script_body(project: str | None, script: str) -> str:
    # Shown in the confirmation so the user sees what the package manager will actually run.
    try:
        p = check_read(project) if project and Path(project).is_absolute() else None
        body = project_scripts(p).get(script, "") if p and p.is_dir() else ""
    except (OSError, ValueError):
        return ""
    return body if len(body) <= 160 else body[:157] + "…"


def _describe(a: dict[str, Any]) -> str:
    cmd = a.get("command")
    target = f" em {Path(a['project']).name}" if a.get("project") else ""
    if cmd == "run_script":
        body = _script_body(a.get("project"), str(a.get("script", "")))
        return f"Executar o script '{a.get('script')}'{target}" + (f": {body}" if body else "")
    return {"install_deps": "Instalar dependências", "run_tests": "Executar os testes", "git_status": "Ver git status",
            "git_log": "Ver histórico git", "git_diff_stat": "Ver alterações git",
            "versions": f"Ver versão de {a.get('tool', 'node')}"}.get(str(cmd), str(cmd)) + target


@tool("run_command", "Executar comando classificado",
      "Executa um comando de desenvolvimento pré-aprovado num projeto (scripts do package.json, testes, git). "
      "Nunca executa linhas de comando livres.",
      L.READ, "dev",
      [ToolParam("command", "string", "Comando classificado", enum=COMMANDS),
       ToolParam("project", "string", "Caminho ou nome do projeto (vazio = projeto do contexto)", required=False,
                 max_length=1000),
       ToolParam("script", "string", "Nome do script (para run_script)", required=False, max_length=64),
       ToolParam("tool", "string", "Ferramenta (para versions)", required=False,
                 enum=["node", "npm", "python", "git", "pnpm", "yarn"]),
       ToolParam("wait_seconds", "integer", "Quanto esperar pela saída", required=False, default=90, minimum=1,
                 maximum=600)],
      dynamic_level=_level, describe=_describe, timeout_s=660)
async def run_command(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    s = ctx.services
    project = resolve_project(ctx, args.get("project")) if args["command"] != "versions" or args.get("project") \
        else Path.home()
    try:
        argv, label, long_running = s.terminal.build(args["command"], project, args)
    except (ValueError, FileNotFoundError) as exc:
        return fail(str(exc))
    await ctx.progress(f"Executando {label}")
    mp = await s.terminal.start(argv, project, label, long_running)
    ent = {"terminal": {"id": mp.id, "label": label}, "project": {"path": str(project), "name": project.name}}
    if long_running:
        finished = await s.terminal.wait(mp, timeout=8)
        if not finished:
            ports = f" na porta {mp.ports[0]}" if mp.ports else ""
            return ok(f"{label} está rodando{ports}.", mp.public(with_output=True, tail=30), entities=ent)
    else:
        finished = await s.terminal.wait(mp, timeout=args.get("wait_seconds", 90))
        if not finished:
            return ok(f"{label} ainda está em execução; acompanhe no painel Terminal.", mp.public(True, 30),
                      entities=ent)
    out = mp.public(with_output=True, tail=60)
    if mp.exit_code == 0:
        tail = [line for line in list(mp.output)[-6:] if line.strip()]
        summary = f" {tail[-1]}" if tail else ""
        return ok(f"{label} concluído com sucesso.{summary}", out, entities=ent, verified=True)
    errors = mp.error_lines(8)
    return ToolResult(False, f"{label} falhou (código {mp.exit_code}). " + (errors[0][:200] if errors else ""),
                      out, f"exit {mp.exit_code}", ent, verified=True)


@tool("list_project_scripts", "Scripts do projeto", "Lista os scripts do package.json de um projeto.", L.READ, "dev",
      [ToolParam("project", "string", "Caminho ou nome do projeto", required=False, max_length=1000)],
      describe=lambda a: "Listar scripts do projeto")
async def list_project_scripts(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    project = resolve_project(ctx, args.get("project"))
    scripts = project_scripts(project)
    if not scripts:
        return ok(f"{project.name} não tem scripts no package.json.", {"scripts": {}},
                  entities={"project": {"path": str(project), "name": project.name}})
    return ok(f"Scripts de {project.name}: {', '.join(scripts)}.", {"scripts": scripts},
              entities={"project": {"path": str(project), "name": project.name}})


@tool("run_project", "Rodar projeto",
      "Localiza um projeto, detecta o gerenciador de pacotes, inicia o ambiente de desenvolvimento, detecta a porta "
      "e abre a URL local. Mostra o progresso em etapas.", L.IMPORTANT, "dev",
      [ToolParam("project", "string", "Nome ou caminho do projeto (vazio = contexto)", required=False, max_length=1000),
       ToolParam("open_editor", "boolean", "Abrir também no VS Code", required=False, default=False)],
      describe=lambda a: f"Rodar o projeto {a.get('project') or 'atual'} (iniciar servidor de desenvolvimento)", timeout_s=900)
async def run_project(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    from ..core.planner import run_project_plan

    return await run_project_plan(ctx, args.get("project"), bool(args.get("open_editor")))


@tool("stop_process", "Parar processo do terminal", "Encerra um processo iniciado pelo Jarvis (e seus filhos).",
      L.REVERSIBLE, "dev",
      [ToolParam("process_id", "string", "Id do processo (vazio = o último)", required=False, max_length=20)],
      describe=lambda a: "Parar o processo do terminal")
async def stop_process(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    term = ctx.services.terminal
    mp = term.get(args["process_id"]) if args.get("process_id") else next(
        (p for p in sorted(term.processes.values(), key=lambda p: p.started_at, reverse=True)
         if p.status == "running"), None)
    if not mp or mp.status != "running":
        return fail("Nenhum processo do Jarvis está em execução.")
    await term.stop(mp.id)
    return ok(f"{mp.label} encerrado.", mp.public(), verified=True)


@tool("terminal_output", "Mostrar saída/erros", "Mostra a saída (ou só os erros) do último processo executado.",
      L.READ, "dev",
      [ToolParam("errors_only", "boolean", "Somente linhas de erro", required=False, default=False)],
      describe=lambda a: "Ler a saída do terminal")
async def terminal_output(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    mp = ctx.services.terminal.last()
    if not mp:
        return fail("Nenhum comando foi executado ainda.")
    lines = mp.error_lines(30) if args.get("errors_only") else list(mp.output)[-40:]
    if not lines:
        return ok(f"{mp.label} não produziu saída.", mp.public())
    head = lines[0][:220]
    return ok(f"{mp.label} ({mp.status}). {'Primeiro erro' if args.get('errors_only') else 'Saída'}: {head}",
              mp.public() | {"lines": lines})


@tool("explain_error", "Explicar erro", "Explica por que o último comando/build falhou, usando a IA configurada.",
      L.READ, "dev", describe=lambda a: "Analisar o erro do último comando")
async def explain_error(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    mp = ctx.services.terminal.last()
    if not mp:
        return fail("Não há saída de terminal para analisar.")
    if mp.status == "running":
        return fail(f"{mp.label} ainda está rodando.")
    lines = mp.error_lines(60)
    if mp.exit_code == 0:
        return ok(f"O último comando ({mp.label}) terminou com sucesso; não há erro.")
    provider = await ctx.services.providers.active_or_none()
    if provider is None:
        return ok(f"{mp.label} falhou (código {mp.exit_code}). Sem modelo de IA para explicar. "
                  f"Primeira linha de erro: {lines[0][:250] if lines else '—'}", {"lines": lines})
    await ctx.progress("Analisando o erro com IA")
    prompt = ("Você é um engenheiro sênior. Explique em português do Brasil, em até 5 frases, a causa mais provável "
              "do erro abaixo e a correção recomendada.\n\n"
              f"Comando: {mp.label}\nCódigo de saída: {mp.exit_code}\nSaída:\n" + "\n".join(lines)[-6000:])
    answer = await ctx.services.providers.complete(prompt, max_tokens=500)
    return ok(answer.strip(), {"lines": lines})


TOOLS: list[Tool] = [run_command, list_project_scripts, run_project, stop_process, terminal_output, explain_error]
