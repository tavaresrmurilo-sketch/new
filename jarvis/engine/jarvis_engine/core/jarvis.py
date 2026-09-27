"""JarvisCore: the agent loop.

    input (voice/text)
      -> IntentRouter (fast path, offline)      -> ActionPlanner / ActionExecutor
      -> LLM agent loop with tool calling       -> ActionExecutor (per tool call)
    ActionExecutor: validate -> permission -> execute -> observe -> verify
    -> response (text + optional streamed speech) -> memory/history

The core publishes `jarvis.state` transitions (IDLE, THINKING, EXECUTING,
ERROR); LISTENING/SPEAKING are driven by the audio pipeline.
"""

from __future__ import annotations

import asyncio
import json
import platform as pyplatform
import time
from datetime import datetime
from typing import TYPE_CHECKING, Any

from ..activity import Category
from ..providers.base import ChatMessage, ProviderError, ToolsNotSupported
from ..tools.base import ToolResult
from .intents import Intent, IntentRouter
from .planner import ActionPlanner

if TYPE_CHECKING:  # pragma: no cover
    from ..services.container import Services

MAX_TOOL_RESULT_CHARS = 3500

NO_AI_REPLY = ("Não entendi esse pedido e o modelo de IA não está disponível para interpretá-lo. "
               "Posso abrir aplicativos, pesquisar arquivos, mostrar o status do sistema, criar notas e lembretes. "
               "Para conversas livres, instale o Ollama com um modelo, ou configure outro provedor.")


class JarvisCore:
    def __init__(self, services: "Services") -> None:
        self.s = services
        self.router = IntentRouter(services)
        self.planner = ActionPlanner(services)
        self._running: set[asyncio.Task[Any]] = set()
        self.state = "IDLE"
        self._error_reset: asyncio.TimerHandle | None = None

    # -------------------------------------------------------------- state
    async def set_state(self, state: str, detail: str = "") -> None:
        if self._error_reset:
            self._error_reset.cancel()
            self._error_reset = None
        self.state = state
        await self.s.bus.publish("jarvis.state", {"state": state, "detail": detail})
        if state == "ERROR":
            loop = asyncio.get_running_loop()
            self._error_reset = loop.call_later(4.0, self._reset_error)

    def _reset_error(self) -> None:
        self._error_reset = None
        if self.state == "ERROR":
            self.state = "IDLE"
            self.s.bus.emit("jarvis.state", {"state": "IDLE"})

    # ------------------------------------------------------------- inputs
    async def submit(self, text: str, source: str = "text") -> asyncio.Task[Any] | None:
        """Handle a command in the background so 'pare' can interrupt a running one."""
        text = (text or "").strip()
        if not text:
            return None
        intent = self.router.route(text)
        if intent.kind == "cancel":
            await self._record_user(text, source)
            await self.cancel_everything(announce=True)
            return None
        if intent.kind == "confirm":
            await self._record_user(text, source)
            self.s.permissions.respond_latest(bool(intent.args.get("approved")))
            return None
        task = asyncio.create_task(self._handle(text, source, intent), name="command")
        self._running.add(task)
        task.add_done_callback(self._running.discard)
        return task

    async def handle(self, text: str, source: str = "text") -> None:
        """Synchronous variant (used by tests and RPC): waits for completion."""
        task = await self.submit(text, source)
        if task:
            await task

    async def respond_wake(self, source: str = "voice") -> None:
        await self.reply("À disposição.", source=source, kind="wake")

    async def cancel_everything(self, announce: bool = False) -> int:
        n = 0
        for t in list(self._running):
            if not t.done():
                t.cancel()
                n += 1
        n += self.s.tasks.cancel_all()
        n += self.s.permissions.cancel_all()
        await self.s.voice.interrupt()
        self.s.activity.log(Category.TASKS, f"Cancelamento solicitado ({n} itens)")
        await self.set_state("IDLE")
        if announce:
            await self.reply("Cancelado." if n else "Parado.", source="voice", speak=False)
        return n

    # -------------------------------------------------------------- flow
    async def _record_user(self, text: str, source: str) -> None:
        self.s.context.add_turn("user", text)
        self.s.history.add("user", text, {"source": source})
        await self.s.bus.publish("command.received", {"text": text, "source": source, "ts": time.time()})

    async def _handle(self, text: str, source: str, intent: Intent) -> None:
        await self._record_user(text, source)
        await self.set_state("THINKING")
        self.s.activity.log(Category.AI, f"Comando ({source}): {text}", intent=intent.describe())
        try:
            if intent.kind == "wake":
                await self.reply(intent.reply, source=source, kind="wake")
            elif intent.kind == "reply":
                if intent.reply:
                    await self.reply(intent.reply, source=source)
            elif intent.kind == "ui":
                await self.s.bus.publish("ui.action", {"action": intent.ui_action})
                await self.reply(intent.reply, source=source)
            elif intent.kind == "tool":
                result = await self.s.executor.execute(intent.tool_id, intent.args, source=source)
                await self._reply_result(result, source)
            elif intent.kind == "plan":
                result = await self.planner.run(intent, source)
                await self._reply_result(result, source)
            elif intent.kind == "sequence":
                await self._run_sequence(intent, source)
            else:
                await self._agent_loop(text, source)
        except asyncio.CancelledError:
            await self.set_state("IDLE")
            raise
        except Exception as exc:
            self.s.activity.log(Category.ERROR, "Falha ao processar comando", level="error",
                                error=f"{type(exc).__name__}: {exc}")
            await self.set_state("ERROR", str(exc))
            await self.reply("Algo deu errado ao processar esse pedido. Os detalhes estão no painel Atividade.",
                             source=source, kind="error", detail=f"{type(exc).__name__}: {exc}")
            return
        if self.state not in ("ERROR",):
            await self.set_state("IDLE")
        await self.s.bus.publish("context.updated", self.s.context.public())

    async def _reply_result(self, result: ToolResult, source: str) -> None:
        if not result.ok:
            await self.set_state("ERROR", result.error)
        await self.reply(result.message, source=source, kind="answer" if result.ok else "error",
                         detail=result.error if not result.ok else "", data=_public_data(result))

    async def _run_sequence(self, intent: Intent, source: str) -> None:
        tm = self.s.tasks
        titles = [self._part_title(p) for p in intent.parts]
        task = tm.create(" → ".join(titles), source)
        steps = [tm.add_step(task, title, tool_id=part.tool_id) for title, part in zip(titles, intent.parts)]
        await tm.set_status(task, "running")
        messages = []
        for step, part in zip(steps, intent.parts):
            await tm.set_step(task, step, "running")
            if part.kind == "tool":
                res = await self.s.executor.execute(part.tool_id, part.args, source=source, task_id=task.id)
            else:
                res = await self.planner.run(part, source)
            await tm.set_step(task, step, "completed" if res.ok else "failed", res.message)
            messages.append(res.message)
            if not res.ok:
                for rest in steps[step.idx + 1:]:
                    await tm.set_step(task, rest, "cancelled")
                await tm.set_status(task, "failed", error=res.message)
                await self.set_state("ERROR", res.error)
                await self.reply(" ".join(messages), source=source, kind="error")
                return
        await tm.set_status(task, "completed", result=" ".join(messages))
        await self.reply(" ".join(messages), source=source)

    def _part_title(self, part: Intent) -> str:
        if part.kind == "tool":
            tool = self.s.registry.get(part.tool_id)
            return tool.describe_action(part.args) if tool else part.tool_id
        names = {"open_target": "Abrir {name}", "open_project": "Abrir o projeto {project}",
                 "run_project": "Rodar o projeto {project}", "summarize": "Resumir {name}",
                 "adjust_referenced": "Ajustar o aplicativo atual", "open_by_name": "Abrir {name}",
                 "scoped_search": "Pesquisar {query}", "delete": "Apagar {target}", "move": "Mover {target}",
                 "copy": "Copiar {target}", "rename": "Renomear {target}"}
        template = names.get(part.plan, part.plan)
        try:
            return template.format(**{k: v for k, v in part.args.items()}).replace("{", "").replace("}", "")
        except (KeyError, IndexError):
            return part.plan

    # --------------------------------------------------------- LLM agent
    def _system_prompt(self, text: str) -> str:
        g = self.s.settings.general
        now = datetime.now()
        lang = "português do Brasil" if g.language.startswith("pt") else "English"
        memories = []
        if self.s.settings.privacy.memory_enabled:
            memories = [m["content"] for m in self.s.memory.relevant(text, limit=5)]
        mem_block = "\n".join(f"- {m}" for m in memories) if memories else "- (nenhuma relevante)"
        return (
            f"Você é {g.assistant_name}, o assistente operacional deste computador"
            f"{' de ' + g.user_name if g.user_name else ''}. Personalidade: cortês, preciso, sofisticado, "
            "levemente espirituoso, nunca servil.\n"
            f"Agora: {now.strftime('%A, %d/%m/%Y %H:%M')}. Sistema: {pyplatform.system()} {pyplatform.release()}.\n"
            "Regras:\n"
            "- Responda de forma curta e natural para ser falada (1 a 3 frases), sem markdown, sem listas longas.\n"
            "- Para agir no computador use SEMPRE as ferramentas disponíveis; você não tem acesso a shell.\n"
            "- Nunca invente métricas, arquivos, resultados ou ações. Se não souber ou não tiver ferramenta, diga.\n"
            "- A confirmação de ações sensíveis é feita automaticamente pelo sistema; não peça confirmação antes.\n"
            "- Se uma ferramenta falhar, explique brevemente e proponha uma alternativa.\n"
            "- Só salve memórias (ferramenta remember) quando o usuário pedir explicitamente para lembrar algo.\n"
            f"Contexto atual:\n{self.s.context.summary()}\n"
            f"Memórias relevantes:\n{mem_block}\n"
            f"Responda em {lang}."
        )

    def _llm_tools(self) -> list[dict[str, Any]]:
        out = []
        for t in self.s.registry.available():
            if not t.expose_to_llm:
                continue
            if self.s.permissions.policy_for(t) == "deny":
                continue
            if t.requires_setting:
                section, _, key = t.requires_setting.partition(".")
                if not getattr(getattr(self.s.settings, section), key, False):
                    continue
            out.append(t.to_llm_function())
        return out

    async def _agent_loop(self, text: str, source: str) -> None:
        router = self.s.providers
        try:
            provider = router.active()
        except ProviderError as exc:
            await self.reply(f"{exc} {NO_AI_REPLY}" if "Nenhum" in str(exc) else str(exc), source=source,
                             kind="error")
            return
        health = await router.health()
        if not health.ok:
            await self.set_state("ERROR", health.detail)
            await self.reply(f"{health.detail} {NO_AI_REPLY}", source=source, kind="error")
            return
        await router.note_external(provider, "conversa")
        ai = self.s.settings.ai
        history = self.s.context.history(12)[:-1]  # current user turn is appended below
        messages = [ChatMessage("system", self._system_prompt(text))]
        for turn in history[-10:]:
            messages.append(ChatMessage("user" if turn["role"] == "user" else "assistant", turn["content"]))
        messages.append(ChatMessage("user", text))
        tools: list[dict[str, Any]] | None = self._llm_tools()
        speech = self.s.voice.begin_speech() if source == "voice" or self.s.settings.voice.speak_responses else None
        task = None
        final_text = ""
        await self.s.bus.publish("ai.thinking", {"provider": provider.label, "model": provider.model})
        try:
            for step in range(ai.max_agent_steps):
                parts: list[str] = []
                calls = []
                try:
                    async for ev in provider.stream(messages, tools, ai.temperature, 1024):
                        if ev.type == "text" and ev.text:
                            parts.append(ev.text)
                            await self.s.bus.publish("ai.delta", {"text": ev.text})
                            if speech:
                                speech.feed(ev.text)
                        elif ev.type == "tool_call" and ev.tool_call:
                            calls.append(ev.tool_call)
                except ToolsNotSupported:
                    if tools is None:
                        raise
                    self.s.activity.log(Category.AI, f"Modelo {provider.model} sem suporte a ferramentas; "
                                                     "respondendo apenas com texto", level="warning")
                    tools = None
                    continue
                text_out = "".join(parts).strip()
                if not calls:
                    final_text = text_out
                    break
                messages.append(ChatMessage("assistant", text_out, tool_calls=calls))
                if task is None:
                    task = self.s.tasks.create(f"IA: {text[:80]}", source)
                    await self.s.tasks.set_status(task, "running")
                await self.set_state("EXECUTING")
                for call in calls:
                    tool = self.s.registry.get(call.name)
                    title = tool.describe_action(call.arguments) if tool else call.name
                    step_obj = self.s.tasks.add_step(task, title, tool_id=call.name)
                    await self.s.tasks.set_step(task, step_obj, "running")
                    await self.s.bus.publish("ai.tool_call", {"tool": call.name, "arguments": call.arguments})
                    result = await self.s.executor.execute(call.name, call.arguments, source=source, task_id=task.id)
                    await self.s.tasks.set_step(task, step_obj, "completed" if result.ok else "failed", result.message)
                    messages.append(ChatMessage("tool", _tool_payload(result), tool_call_id=call.id, name=call.name))
                await self.set_state("THINKING")
            else:
                final_text = "Atingi o limite de etapas para esse pedido. Veja o progresso no painel de tarefas."
        except ProviderError as exc:
            if speech:
                speech.cancel()
            if task:
                await self.s.tasks.set_status(task, "failed", error=str(exc))
            self.s.activity.log(Category.AI, f"Falha no provedor: {exc}", level="error", detail=exc.detail)
            await self.set_state("ERROR", str(exc))
            await self.reply(str(exc), source=source, kind="error", detail=exc.detail)
            return
        except asyncio.CancelledError:
            if speech:
                speech.cancel()
            if task:
                await self.s.tasks.set_status(task, "cancelled", error="Cancelada")
            raise
        if task:
            await self.s.tasks.set_status(task, "completed", result=final_text)
        if not final_text:
            final_text = "Feito."
            if speech:
                speech.feed(final_text)
        await self.reply(final_text, source=source, speak=False, streamed_speech=speech)

    # ------------------------------------------------------------- output
    async def reply(self, text: str, *, source: str = "text", kind: str = "answer", detail: str = "",
                    data: dict[str, Any] | None = None, speak: bool = True, streamed_speech: Any = None) -> None:
        if not text:
            return
        self.s.context.add_turn("assistant", text)
        self.s.history.add("assistant", text, {"kind": kind})
        await self.s.bus.publish("ai.response", {"text": text, "kind": kind, "detail": detail, "data": data or {},
                                                 "source": source, "ts": time.time()})
        voice = self.s.voice
        if streamed_speech is not None:
            await streamed_speech.close()
        elif speak and (source == "voice" or self.s.settings.voice.speak_responses):
            await voice.speak(text)
        if source == "voice" and not voice.speech_enabled():
            voice.open_follow_up()


def _tool_payload(result: ToolResult) -> str:
    payload = {"ok": result.ok, "message": result.message, "data": result.data}
    if result.error:
        payload["error"] = result.error
    raw = json.dumps(payload, ensure_ascii=False, default=str)
    if len(raw) > MAX_TOOL_RESULT_CHARS:
        payload["data"] = {"truncated": True, "preview": raw[:MAX_TOOL_RESULT_CHARS]}
        raw = json.dumps(payload, ensure_ascii=False, default=str)[:MAX_TOOL_RESULT_CHARS + 500]
    return raw


def _public_data(result: ToolResult) -> dict[str, Any]:
    data = dict(result.data)
    raw = json.dumps(data, default=str)
    if len(raw) > 60_000:
        return {"truncated": True}
    return data
