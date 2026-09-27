"""Desktop tools: browser/URLs, volume and media, clipboard, notifications, OS settings, power, focus mode."""

from __future__ import annotations

import asyncio
import re
import urllib.parse
from typing import Any

import psutil

from ..platform.base import MEDIA_ACTIONS, SETTINGS_PAGES
from ..services.hub import BridgeError
from .base import PermissionLevel as L
from .base import Tool, ToolContext, ToolParam, ToolResult, fail, ok, tool

_ALLOWED_SCHEMES = ("http", "https", "mailto")
_DOMAIN = re.compile(r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d+)?(/.*)?$", re.I)


def normalize_url(raw: str) -> str:
    url = raw.strip()
    parsed = urllib.parse.urlparse(url)
    if not parsed.scheme:
        if _DOMAIN.match(url) or url.startswith(("localhost", "127.0.0.1")):
            url = ("http://" if url.startswith(("localhost", "127.0.0.1")) else "https://") + url
            parsed = urllib.parse.urlparse(url)
        else:
            raise ValueError("Isso não parece um endereço web válido.")
    if parsed.scheme.lower() not in _ALLOWED_SCHEMES:
        raise ValueError(f"Esquema de URL não permitido: {parsed.scheme}")
    if parsed.scheme in ("http", "https") and not parsed.netloc:
        raise ValueError("URL sem domínio.")
    return url


@tool("open_url", "Abrir site", "Abre um endereço web (http/https) no navegador padrão.", L.REVERSIBLE, "web",
      [ToolParam("url", "string", "Endereço (ex.: youtube.com)", max_length=2000)],
      describe=lambda a: f"Abrir {a.get('url')}")
async def open_url(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    try:
        url = normalize_url(args["url"])
    except ValueError as exc:
        return fail(str(exc))
    await asyncio.to_thread(ctx.services.platform.open_uri, url)
    host = urllib.parse.urlparse(url).netloc or url
    return ok(f"Abrindo {host}.", {"url": url}, entities={"url": url})


_ENGINES = {
    "google": "https://www.google.com/search?q={q}",
    "bing": "https://www.bing.com/search?q={q}",
    "duckduckgo": "https://duckduckgo.com/?q={q}",
    "youtube": "https://www.youtube.com/results?search_query={q}",
    "maps": "https://www.google.com/maps/search/{q}",
}


@tool("web_search", "Pesquisar na web", "Abre uma pesquisa na web no navegador padrão.", L.REVERSIBLE, "web",
      [ToolParam("query", "string", "O que pesquisar", max_length=500),
       ToolParam("engine", "string", "Buscador", required=False, enum=list(_ENGINES), default="google")],
      describe=lambda a: f"Pesquisar '{a.get('query')}' no {a.get('engine', 'google')}")
async def web_search(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    url = _ENGINES[args.get("engine", "google")].format(q=urllib.parse.quote_plus(args["query"]))
    await asyncio.to_thread(ctx.services.platform.open_uri, url)
    return ok(f"Pesquisando {args['query']}.", {"url": url}, entities={"url": url, "topic": args["query"]})


@tool("open_browser", "Abrir navegador", "Abre o navegador padrão.", L.REVERSIBLE, "web",
      describe=lambda a: "Abrir o navegador")
async def open_browser(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    apps = ctx.services.apps
    for name in ("Google Chrome", "Microsoft Edge", "Firefox", "Brave", "Opera"):
        m = apps.best(name)
        if m and m.score >= 0.95 and _is_default_browser_hint(m.entry.name, ctx):
            await asyncio.to_thread(ctx.services.platform.launch_app, m.entry)
            return ok(f"Abrindo o {m.entry.name}.", entities={"app": {"name": m.entry.name, "exe": m.entry.exe_name,
                                                                      "processNames": apps.process_names_for(m.entry)}})
    await asyncio.to_thread(ctx.services.platform.open_uri, "https://www.google.com")
    return ok("Abrindo o navegador padrão.", {"url": "https://www.google.com"})


def _is_default_browser_hint(name: str, ctx: ToolContext) -> bool:
    """Best-effort: on Windows read the http UserChoice ProgId; elsewhere don't guess."""
    import sys

    if sys.platform != "win32":
        return False
    try:
        import winreg  # type: ignore[import-not-found]

        key = r"Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice"
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key) as k:
            prog_id, _ = winreg.QueryValueEx(k, "ProgId")
    except OSError:
        return False
    prog = str(prog_id).lower()
    n = name.lower()
    return ("chrome" in prog and "chrome" in n) or ("msedge" in prog and "edge" in n) or \
        ("firefox" in prog and "firefox" in n) or ("brave" in prog and "brave" in n) or ("opera" in prog and "opera" in n)


# ------------------------------------------------------------------ audio --
def _app_process_names(ctx: ToolContext, app: str | None) -> tuple[str, list[str]] | None:
    if not app:
        return None
    m = ctx.services.apps.best(app)
    if m:
        return m.entry.name, ctx.services.apps.process_names_for(m.entry)
    return app, [app.lower().replace(" ", "") + ".exe", app.lower().replace(" ", "")]


@tool("set_volume", "Ajustar volume",
      "Ajusta o volume geral ou de um aplicativo específico (nível absoluto 0-100 ou variação +/-).",
      L.REVERSIBLE, "media",
      [ToolParam("level", "integer", "Volume absoluto 0-100", required=False, minimum=0, maximum=100),
       ToolParam("delta", "integer", "Variação relativa (ex.: -20, +10)", required=False, minimum=-100, maximum=100),
       ToolParam("app", "string", "Aplicativo (vazio = volume geral)", required=False, max_length=120)],
      describe=lambda a: ("Ajustar volume" + (f" do {a['app']}" if a.get("app") else "") +
                          (f" para {a['level']}%" if a.get("level") is not None else
                           f" em {a['delta']:+d}%" if a.get("delta") is not None else "")))
async def set_volume(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    plat = ctx.services.platform
    level, delta = args.get("level"), args.get("delta")
    if level is None and delta is None:
        current = await asyncio.to_thread(plat.get_master_volume)
        return ok(f"O volume está em {current:.0f}%." if current is not None else "Não consigo ler o volume.",
                  {"volume": current})
    target_app = _app_process_names(ctx, args.get("app"))
    if target_app:
        label, names = target_app
        changed = await asyncio.to_thread(plat.set_app_volume, names, level, delta)
        if not changed:
            return fail(f"{label} não está reproduzindo áudio agora, então não há volume dele para ajustar.")
        to = changed[0]["to"]
        return ok(f"Volume do {label} em {to}%.", {"sessions": changed}, verified=True)
    current = await asyncio.to_thread(plat.get_master_volume)
    if level is None:
        if current is None:
            return fail("Não consigo ler o volume atual.")
        level = int(max(0, min(100, current + (delta or 0))))
    await asyncio.to_thread(plat.set_master_volume, float(level))
    after = await asyncio.to_thread(plat.get_master_volume)
    verified = after is not None and abs(after - level) <= 2
    return ok(f"Volume em {level}%.", {"volume": after}, verified=verified)


@tool("mute", "Mudo", "Ativa ou desativa o mudo do som geral.", L.REVERSIBLE, "media",
      [ToolParam("muted", "boolean", "true para mudo, false para voltar o som", required=False)],
      describe=lambda a: "Alternar mudo" if a.get("muted") is None else ("Silenciar" if a["muted"] else "Ativar som"))
async def mute(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    plat = ctx.services.platform
    muted = args.get("muted")
    if muted is None:
        current = await asyncio.to_thread(plat.get_mute)
        muted = not current if current is not None else True
    await asyncio.to_thread(plat.set_mute, bool(muted))
    state = await asyncio.to_thread(plat.get_mute)
    return ok("Som silenciado." if muted else "Som reativado.", {"muted": state},
              verified=state is not None and state == muted)


@tool("media_control", "Controle de mídia", "Tocar/pausar, próxima ou anterior na mídia em reprodução.",
      L.REVERSIBLE, "media",
      [ToolParam("action", "string", "Ação", enum=list(MEDIA_ACTIONS))],
      describe=lambda a: {"play_pause": "Tocar/pausar", "next": "Próxima faixa", "previous": "Faixa anterior",
                          "stop": "Parar mídia"}[a["action"]])
async def media_control(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    await asyncio.to_thread(ctx.services.platform.media_key, args["action"])
    msg = {"play_pause": "Feito.", "next": "Próxima faixa.", "previous": "Faixa anterior.", "stop": "Mídia parada."}
    return ok(msg[args["action"]])


# ------------------------------------------------------------- clipboard --
@tool("clipboard_read", "Ler área de transferência", "Lê o texto atual da área de transferência.",
      L.REVERSIBLE, "clipboard", describe=lambda a: "Ler a área de transferência")
async def clipboard_read(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    text: str | None = None
    try:
        res = await ctx.services.hub.request("clipboard", "clipboard.read", timeout=5)
        text = (res or {}).get("text")
    except BridgeError:
        text = await asyncio.to_thread(ctx.services.platform.clipboard_get)
    if text is None:
        return fail("Não consegui acessar a área de transferência.")
    if not text.strip():
        return ok("A área de transferência está vazia.", {"text": ""})
    preview = text.strip().replace("\n", " ")[:280]
    return ok(f"Na área de transferência: {preview}", {"text": text[:10000]}, entities={"topic": text[:500]})


@tool("clipboard_write", "Copiar texto", "Copia um texto para a área de transferência.", L.REVERSIBLE, "clipboard",
      [ToolParam("text", "string", "Texto a copiar", max_length=20000)],
      describe=lambda a: "Copiar texto para a área de transferência")
async def clipboard_write(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    try:
        await ctx.services.hub.request("clipboard", "clipboard.write", {"text": args["text"]}, timeout=5)
        done = True
    except BridgeError:
        done = await asyncio.to_thread(ctx.services.platform.clipboard_set, args["text"])
    return ok("Copiado para a área de transferência.") if done else fail("Não consegui copiar o texto.")


# --------------------------------------------------------- notifications --
@tool("notify", "Notificação", "Mostra uma notificação na área de trabalho.", L.REVERSIBLE, "notifications",
      [ToolParam("title", "string", "Título", max_length=120),
       ToolParam("body", "string", "Mensagem", required=False, max_length=500)],
      describe=lambda a: f"Mostrar notificação '{a.get('title')}'")
async def notify(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    await ctx.services.notifier.notify(args["title"], args.get("body", ""), kind="info", desktop=True)
    return ok("Notificação exibida.")


@tool("open_system_settings", "Abrir configurações do sistema",
      "Abre uma página das Configurações do Windows (som, bluetooth, rede, tela, notificações...).",
      L.REVERSIBLE, "system",
      [ToolParam("page", "string", "Página", required=False, enum=list(SETTINGS_PAGES), default="home")],
      describe=lambda a: f"Abrir Configurações: {a.get('page', 'home')}")
async def open_system_settings(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    uri = ctx.services.platform.settings_uri(args.get("page", "home"))
    if not uri:
        return fail("Abrir páginas de configurações só é suportado no Windows.")
    await asyncio.to_thread(ctx.services.platform.open_uri, uri)
    return ok("Abrindo as configurações.", {"uri": uri})


# ------------------------------------------------------------------ power --
@tool("lock_computer", "Bloquear computador", "Bloqueia a sessão (tela de bloqueio).", L.REVERSIBLE, "power",
      describe=lambda a: "Bloquear o computador")
async def lock_computer(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    await asyncio.to_thread(ctx.services.platform.lock)
    return ok("Computador bloqueado.")


@tool("sleep_computer", "Suspender computador", "Coloca o computador em suspensão.", L.IMPORTANT, "power",
      describe=lambda a: "Suspender o computador agora")
async def sleep_computer(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    await asyncio.to_thread(ctx.services.platform.sleep)
    return ok("Suspendendo.")


@tool("shutdown_computer", "Desligar/reiniciar",
      "Agenda o desligamento ou reinício do computador (com atraso cancelável).", L.DESTRUCTIVE, "power",
      [ToolParam("restart", "boolean", "Reiniciar em vez de desligar", required=False, default=False),
       ToolParam("delay_seconds", "integer", "Atraso antes de executar", required=False, default=60, minimum=10,
                 maximum=3600)],
      describe=lambda a: f"{'Reiniciar' if a.get('restart') else 'Desligar'} o computador em "
                         f"{a.get('delay_seconds', 60)} segundos. Aplicativos abertos podem perder dados.")
async def shutdown_computer(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    delay = args.get("delay_seconds", 60)
    await asyncio.to_thread(ctx.services.platform.shutdown, bool(args.get("restart")), delay)
    verb = "Reinício" if args.get("restart") else "Desligamento"
    return ok(f"{verb} agendado para daqui a {delay} segundos. Diga 'cancelar desligamento' para abortar.")


@tool("cancel_shutdown", "Cancelar desligamento", "Cancela um desligamento/reinício agendado.", L.REVERSIBLE, "power",
      describe=lambda a: "Cancelar desligamento agendado")
async def cancel_shutdown(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    await asyncio.to_thread(ctx.services.platform.cancel_shutdown)
    return ok("Desligamento cancelado.")


# ------------------------------------------------------------- focus mode --
@tool("focus_mode", "Modo foco",
      "Ativa/desativa o modo foco do Jarvis: silencia alertas proativos e fecha os apps de distração configurados.",
      L.IMPORTANT, "system",
      [ToolParam("enabled", "boolean", "Ativar (true) ou desativar (false)", required=False, default=True),
       ToolParam("open_windows_settings", "boolean", "Abrir também o 'Não incomodar' do Windows", required=False,
                 default=False)],
      describe=lambda a: ("Ativar" if a.get("enabled", True) else "Desativar") + " o modo foco" +
                         (" e fechar os apps de distração configurados" if a.get("enabled", True) else ""))
async def focus_mode(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    enabled = bool(args.get("enabled", True))
    s = ctx.services
    s.notifier.focus_mode = enabled
    done: list[str] = []
    if enabled:
        done.append("alertas proativos silenciados")
        closing = [a for a in s.settings.system.focus_close_apps if a.strip()]
        closed = []
        for app in closing:
            names = s.apps.process_names_for(s.apps.best(app).entry) if s.apps.best(app) else [app.lower() + ".exe"]
            wanted = {n.lower() for n in names}
            for p in psutil.process_iter(["name"]):
                if (p.info.get("name") or "").lower() in wanted:
                    try:
                        await asyncio.to_thread(s.platform.close_process_gracefully, p.pid)
                        closed.append(app)
                    except Exception:
                        pass
                    break
        if closed:
            done.append("fechei " + ", ".join(sorted(set(closed))))
        elif closing:
            done.append("nenhum app de distração estava aberto")
        if args.get("open_windows_settings"):
            uri = s.platform.settings_uri("focus")
            if uri:
                await asyncio.to_thread(s.platform.open_uri, uri)
                done.append("abri o 'Não incomodar' do Windows")
    await s.bus.publish("focus.changed", {"enabled": enabled})
    if enabled:
        return ok("Modo foco ativado: " + "; ".join(done) + ".", {"enabled": True})
    return ok("Modo foco desativado. Alertas voltaram ao normal.", {"enabled": False})


TOOLS: list[Tool] = [open_url, web_search, open_browser, set_volume, mute, media_control, clipboard_read,
                     clipboard_write, notify, open_system_settings, lock_computer, sleep_computer, shutdown_computer,
                     cancel_shutdown, focus_mode]
