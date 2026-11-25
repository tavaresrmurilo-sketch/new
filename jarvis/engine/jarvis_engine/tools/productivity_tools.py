"""Notes, reminders, memory and daily agenda tools."""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Any

from ..core import fmt
from ..core.timeparse import describe_due, parse_when
from .base import PermissionLevel as L
from .base import Tool, ToolContext, ToolParam, ToolResult, fail, ok, tool


_PERSON = [(r"\bmeu\b", "seu"), (r"\bminha\b", "sua"), (r"\bmeus\b", "seus"), (r"\bminhas\b", "suas"),
           (r"\bMeu\b", "Seu"), (r"\bMinha\b", "Sua"), (r"\beu\b", "você"), (r"\bEu\b", "Você"),
           (r"\bcomigo\b", "com você")]


def second_person(text: str) -> str:
    """Memories are stored in the user's words ("meu projeto"); Jarvis replies in second person."""
    for pattern, repl in _PERSON:
        text = re.sub(pattern, repl, text)
    return text


# ------------------------------------------------------------------ notes --
@tool("create_note", "Criar nota", "Cria uma nota (título opcional).", L.REVERSIBLE, "notes",
      [ToolParam("content", "string", "Conteúdo da nota", max_length=20000),
       ToolParam("title", "string", "Título", required=False, max_length=200)],
      describe=lambda a: f"Criar nota '{a.get('title') or a.get('content', '')[:40]}'")
async def create_note(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    note = ctx.services.notes.create(args["content"], args.get("title", ""))
    return ok(f"Nota '{note['title']}' salva.", {"note": note}, entities={"note": note}, verified=True)


@tool("list_notes", "Mostrar notas", "Lista as notas mais recentes.", L.READ, "notes",
      [ToolParam("limit", "integer", "Quantidade", required=False, default=10, minimum=1, maximum=100)],
      describe=lambda a: "Listar notas")
async def list_notes(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    notes = ctx.services.notes.list(args.get("limit", 10))
    if not notes:
        return ok("Você ainda não tem notas.", {"notes": []})
    titles = [n["title"] for n in notes[:5]]
    total = ctx.services.notes.count()
    msg = f"Você tem {total} nota{'s' if total > 1 else ''}. As mais recentes: {fmt.join_pt(titles)}."
    return ok(msg, {"notes": notes}, entities={"notes": notes, "note": notes[0]})


@tool("search_notes", "Pesquisar notas", "Pesquisa notas por texto.", L.READ, "notes",
      [ToolParam("query", "string", "Termos", max_length=200)],
      describe=lambda a: f"Pesquisar notas sobre {a.get('query')}")
async def search_notes(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    notes = ctx.services.notes.search(args["query"])
    if not notes:
        return ok(f"Nenhuma nota sobre {args['query']}.", {"notes": []})
    msg = f"Encontrei {len(notes)} nota{'s' if len(notes) > 1 else ''} sobre {args['query']}: " + \
          fmt.join_pt([n["title"] for n in notes[:4]]) + "."
    return ok(msg, {"notes": notes}, entities={"notes": notes, "note": notes[0]})


def _resolve_note(ctx: ToolContext, note_id: int | None, title: str | None) -> dict[str, Any] | None:
    store = ctx.services.notes
    if note_id:
        return store.get(note_id)
    if title:
        return store.find_by_title(title)
    return ctx.services.context.get("note")


@tool("delete_note", "Apagar nota", "Apaga uma nota pelo id, pelo título ou a última mencionada.", L.IMPORTANT,
      "notes",
      [ToolParam("note_id", "integer", "Id da nota", required=False, minimum=1),
       ToolParam("title", "string", "Título da nota", required=False, max_length=200)],
      describe=lambda a: f"Apagar a nota {a.get('title') or a.get('note_id') or 'atual'}")
async def delete_note(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    note = _resolve_note(ctx, args.get("note_id"), args.get("title"))
    if not note:
        return fail("Não sei qual nota apagar.")
    ctx.services.notes.delete(note["id"])
    ctx.services.context.entities.pop("note", None)
    return ok(f"Nota '{note['title']}' apagada.", {"note": note}, verified=True)


@tool("append_note", "Adicionar à nota", "Acrescenta texto a uma nota existente.", L.REVERSIBLE, "notes",
      [ToolParam("text", "string", "Texto a acrescentar", max_length=5000),
       ToolParam("note_id", "integer", "Id da nota", required=False, minimum=1),
       ToolParam("title", "string", "Título da nota", required=False, max_length=200)],
      describe=lambda a: "Acrescentar texto à nota")
async def append_note(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    note = _resolve_note(ctx, args.get("note_id"), args.get("title"))
    if not note:
        return fail("Não sei em qual nota escrever.")
    updated = ctx.services.notes.update(note["id"], content=(note["content"] + "\n" + args["text"]).strip())
    return ok(f"Adicionei à nota '{note['title']}'.", {"note": updated}, entities={"note": updated})


# -------------------------------------------------------------- reminders --
@tool("create_reminder", "Criar lembrete",
      "Cria um lembrete a partir de uma expressão natural ('amanhã às 15h', 'daqui a 20 minutos', 'todo sábado').",
      L.REVERSIBLE, "reminders",
      [ToolParam("text", "string", "Frase completa com o que lembrar e quando", max_length=500),
       ToolParam("when", "string", "Quando (se separado do texto)", required=False, max_length=200)],
      describe=lambda a: f"Criar lembrete: {a.get('text')}")
async def create_reminder(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    phrase = f"{args['text']} {args.get('when', '')}".strip()
    when = parse_when(phrase)
    if when is None:
        return fail("Não entendi quando devo lembrar. Tente 'amanhã às 15h' ou 'daqui a 20 minutos'.")
    message = when.message or args["text"]
    rem = ctx.services.reminders.create(message, when.due, when.recurrence)
    return ok(f"Combinado. Vou lembrar você {describe_due(when.due, when.recurrence)}: {message}.",
              {"reminder": rem}, entities={"reminder": rem}, verified=True)


@tool("list_reminders", "Listar lembretes", "Lista os lembretes pendentes.", L.READ, "reminders",
      describe=lambda a: "Listar lembretes")
async def list_reminders(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    rems = ctx.services.reminders.list("pending")
    if not rems:
        return ok("Você não tem lembretes pendentes.", {"reminders": []})
    items = [f"{r['text']} ({r['when']})" for r in rems[:5]]
    return ok(f"{len(rems)} lembrete{'s' if len(rems) > 1 else ''}: " + fmt.join_pt(items) + ".",
              {"reminders": rems}, entities={"reminder": rems[0]})


@tool("cancel_reminder", "Cancelar lembrete", "Cancela um lembrete pelo id ou pelo texto.", L.IMPORTANT, "reminders",
      [ToolParam("reminder_id", "integer", "Id do lembrete", required=False, minimum=1),
       ToolParam("text", "string", "Parte do texto do lembrete", required=False, max_length=200)],
      describe=lambda a: f"Cancelar o lembrete {a.get('text') or a.get('reminder_id') or 'atual'}")
async def cancel_reminder(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    engine = ctx.services.reminders
    rid = args.get("reminder_id")
    if not rid and args.get("text"):
        q = args["text"].lower()
        hits = [r for r in engine.list("pending") if q in r["text"].lower()]
        rid = hits[0]["id"] if hits else None
    if not rid:
        cur = ctx.services.context.get("reminder")
        rid = cur.get("id") if cur else None
    if not rid or not engine.cancel(int(rid)):
        return fail("Não encontrei esse lembrete pendente.")
    return ok("Lembrete cancelado.", {"id": rid}, verified=True)


@tool("agenda_today", "O que tenho para hoje",
      "Resume os lembretes de hoje, tarefas registradas na memória e notas recentes.", L.READ, "reminders",
      describe=lambda a: "Consultar a agenda de hoje")
async def agenda_today(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    s = ctx.services
    start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    rems = s.reminders.between(datetime.now().timestamp() - 60, end.timestamp())
    tasks = s.memory.list("task", limit=10)
    parts = []
    if rems:
        parts.append(f"{len(rems)} lembrete{'s' if len(rems) > 1 else ''} para hoje: " +
                     fmt.join_pt([f"{r['text']} às {datetime.fromtimestamp(r['dueAt']).strftime('%H:%M')}"
                                  for r in rems[:5]]))
    if tasks:
        parts.append("Tarefas anotadas: " + fmt.join_pt([t["content"] for t in tasks[:4]]))
    if not parts:
        return ok("Nada agendado para hoje. Nenhum lembrete pendente e nenhuma tarefa registrada.",
                  {"reminders": [], "tasks": []})
    return ok(". ".join(parts) + ".", {"reminders": rems, "tasks": tasks})


# ----------------------------------------------------------------- memory --
@tool("remember", "Lembrar informação",
      "Guarda na memória de longo prazo uma informação que o usuário pediu explicitamente para lembrar.",
      L.REVERSIBLE, "memory",
      [ToolParam("content", "string", "O que lembrar", max_length=2000),
       ToolParam("category", "string", "Categoria", required=False,
                 enum=["fact", "preference", "project", "task", "person", "other"])],
      describe=lambda a: f"Memorizar: {a.get('content', '')[:60]}")
async def remember(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    if not ctx.services.settings.privacy.memory_enabled:
        return fail("A memória de longo prazo está desativada nas configurações de privacidade.")
    mem = ctx.services.memory.add(args["content"], args.get("category"), source=ctx.source)
    return ok("Entendido. Vou lembrar disso.", {"memory": mem}, entities={"memory": mem}, verified=True)


@tool("recall", "Consultar memória", "Consulta o que o Jarvis sabe sobre um assunto (memórias salvas).", L.READ,
      "memory",
      [ToolParam("query", "string", "Assunto", required=False, max_length=200)],
      describe=lambda a: f"Consultar memórias sobre {a.get('query') or 'tudo'}")
async def recall(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    q = args.get("query") or ""
    mems = ctx.services.memory.relevant(q, limit=6) if q else ctx.services.memory.list(limit=6)
    if not mems:
        return ok(f"Não tenho nada salvo sobre {q}." if q else "Ainda não tenho memórias salvas.", {"memories": []})
    facts = "; ".join(second_person(m["content"]) for m in mems[:4])
    msg = (f"Sobre {q}, sei que: " if q else "O que sei: ") + facts + "."
    return ok(msg, {"memories": mems}, entities={"memory": mems[0]})


@tool("forget", "Esquecer", "Apaga memórias que correspondem a um assunto (ou a última mencionada).", L.IMPORTANT,
      "memory",
      [ToolParam("query", "string", "Assunto a esquecer", required=False, max_length=200),
       ToolParam("memory_id", "integer", "Id da memória", required=False, minimum=1)],
      describe=lambda a: f"Esquecer {a.get('query') or 'a última memória'}")
async def forget(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    mm = ctx.services.memory
    if args.get("memory_id"):
        targets = [m for m in [mm.get(args["memory_id"])] if m]
    elif args.get("query"):
        targets = mm.forget_matching(args["query"])
    else:
        cur = ctx.services.context.get("memory")
        targets = [cur] if cur else []
    if not targets:
        return fail("Não encontrei memórias correspondentes.")
    for m in targets:
        mm.delete(m["id"])
    n = len(targets)
    return ok(f"Esqueci {n} memória{'s' if n > 1 else ''}.", {"deleted": [m["id"] for m in targets]}, verified=True)


TOOLS: list[Tool] = [create_note, list_notes, search_notes, delete_note, append_note, create_reminder, list_reminders,
                     cancel_reminder, agenda_today, remember, recall, forget]
