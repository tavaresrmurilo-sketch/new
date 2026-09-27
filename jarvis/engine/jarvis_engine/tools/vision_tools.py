"""Vision tools. Screen capture always requires explicit consent and is visibly indicated."""

from __future__ import annotations

from typing import Any

from ..activity import Category
from ..services.hub import BridgeError
from .base import PermissionLevel as L
from .base import Tool, ToolContext, ToolParam, ToolResult, fail, ok, tool


@tool("screen_analysis", "Analisar tela",
      "Captura a tela (com autorização explícita) e pede ao modelo de visão para descrever, ler textos ou explicar "
      "um erro visível.", L.IMPORTANT, "vision",
      [ToolParam("question", "string", "O que analisar (ex.: 'explique o erro na tela')", required=False,
                 max_length=500, default="Descreva o que está na tela e destaque qualquer erro visível.")],
      describe=lambda a: "Capturar sua tela uma vez para análise: " + str(a.get("question", ""))[:80])
async def screen_analysis(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    s = ctx.services
    if not s.settings.privacy.screen_capture_enabled:
        return fail("A captura de tela está desativada nas configurações de privacidade.")
    vision = await s.providers.vision_or_none()
    if vision is None:
        return fail("Nenhum modelo com visão está disponível. Com Ollama, instale por exemplo "
                    "'ollama pull llama3.2-vision' ou 'qwen2.5vl' e selecione-o em Configurações › IA.")
    await ctx.progress("Capturando a tela")
    await s.bus.publish("privacy.capture", {"active": True})
    try:
        shot = await s.hub.request("capture", "screen.capture", {"maxWidth": 1600}, timeout=20)
    except BridgeError as exc:
        return fail(f"Não consegui capturar a tela: {exc}")
    finally:
        await s.bus.publish("privacy.capture", {"active": False})
    data_url = (shot or {}).get("dataUrl", "")
    if not data_url.startswith("data:image/"):
        return fail("A captura de tela não retornou uma imagem.")
    b64 = data_url.split(",", 1)[1]
    s.activity.log(Category.SECURITY, "Tela capturada com autorização para análise",
                   source=shot.get("sourceName"), external=vision.is_external)
    await ctx.progress("Analisando a imagem")
    question = args.get("question") or "Descreva o que está na tela."
    prompt = ("Responda em português do Brasil, de forma objetiva (até 6 frases). " + question +
              " Se houver uma mensagem de erro, transcreva-a e explique a causa provável e como resolver.")
    answer = await s.providers.vision(prompt, b64)
    return ok(answer.strip(), {"source": shot.get("sourceName"), "width": shot.get("width"),
                               "height": shot.get("height")})


TOOLS: list[Tool] = [screen_analysis]
