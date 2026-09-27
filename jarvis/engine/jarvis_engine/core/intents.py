"""IntentRouter: fast, deterministic understanding of common commands.

This path needs no language model, so the core of Jarvis keeps working offline
(and answers in milliseconds). Anything it does not recognise with confidence
is handed to the LLM agent loop with tool calling.

Matching runs on a *folded* copy of the text (lowercase, no accents) that has
exactly the same length as the original, so captured spans can be sliced from
the original text and keep the user's casing and accents.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from .text import strip_accents, words_to_numbers

if TYPE_CHECKING:  # pragma: no cover
    from ..services.container import Services


@dataclass
class Intent:
    kind: str  # wake | cancel | confirm | reply | tool | plan | sequence | ui | llm
    tool_id: str = ""
    args: dict[str, Any] = field(default_factory=dict)
    reply: str = ""
    plan: str = ""
    confidence: float = 0.0
    parts: list["Intent"] = field(default_factory=list)
    ui_action: str = ""

    def describe(self) -> str:
        if self.kind == "tool":
            return f"tool:{self.tool_id} {self.args}"
        if self.kind == "plan":
            return f"plan:{self.plan} {self.args}"
        return self.kind


def fold(text: str) -> str:
    out = []
    for ch in text:
        f = strip_accents(ch.lower())
        out.append(f[:1] if f else " ")
    return "".join(out)


WAKE_RE = re.compile(r"^\s*(?:(?:ei|hey|ok|oi|ola|e ai|alo)[\s,]+)?(?:jarvis|jarvi|jarves|jarvas|djarvis|jar vis|"
                     r"jervis|javis|jarbas)\b[\s,.!?:;-]*", re.I)

MEDIA_APPS = ("spotify", "vlc", "deezer", "tidal", "music", "musica", "itunes", "winamp", "foobar", "youtube",
              "amazon music", "apple music", "soundcloud", "groove", "media player", "reprodutor")

KNOWN_SITES = {
    "youtube": "https://www.youtube.com", "gmail": "https://mail.google.com", "google": "https://www.google.com",
    "netflix": "https://www.netflix.com", "instagram": "https://www.instagram.com", "facebook": "https://www.facebook.com",
    "twitter": "https://x.com", "x": "https://x.com", "linkedin": "https://www.linkedin.com",
    "github": "https://github.com", "chatgpt": "https://chatgpt.com", "claude": "https://claude.ai",
    "google drive": "https://drive.google.com", "drive": "https://drive.google.com",
    "google docs": "https://docs.google.com", "whatsapp web": "https://web.whatsapp.com",
    "google agenda": "https://calendar.google.com", "agenda": "https://calendar.google.com",
    "google maps": "https://maps.google.com", "maps": "https://maps.google.com", "twitch": "https://www.twitch.tv",
    "reddit": "https://www.reddit.com", "wikipedia": "https://pt.wikipedia.org", "amazon": "https://www.amazon.com.br",
    "mercado livre": "https://www.mercadolivre.com.br", "outlook web": "https://outlook.live.com",
}

SETTINGS_PAGE_WORDS = {
    "som": "sound", "audio": "sound", "bluetooth": "bluetooth", "rede": "network", "internet": "network",
    "wifi": "wifi", "wi-fi": "wifi", "tela": "display", "monitor": "display", "video": "display",
    "notificacoes": "notifications", "notificacao": "notifications", "energia": "power", "bateria": "power",
    "armazenamento": "storage", "disco": "storage", "aplicativos": "apps", "apps": "apps", "privacidade": "privacy",
    "microfone": "microphone", "camera": "camera", "atualizacao": "update", "atualizacoes": "update",
    "windows update": "update", "personalizacao": "personalization", "papel de parede": "background",
    "mouse": "mouse", "teclado": "keyboard", "idioma": "language", "data": "time", "hora": "time",
    "conta": "accounts", "contas": "accounts", "foco": "focus", "nao incomodar": "focus",
    "aplicativos padrao": "default_apps", "navegador padrao": "default_apps",
}

FILE_TYPE_WORDS = {
    "apresentacao": ["pptx", "ppt", "odp", "key", "pdf"], "apresentacoes": ["pptx", "ppt", "odp", "key", "pdf"],
    "slides": ["pptx", "ppt", "odp", "key"], "planilha": ["xlsx", "xls", "csv", "ods"],
    "planilhas": ["xlsx", "xls", "csv", "ods"], "pdf": ["pdf"], "pdfs": ["pdf"],
    "documento": ["docx", "doc", "pdf", "odt", "txt", "md"], "documentos": ["docx", "doc", "pdf", "odt", "txt", "md"],
    "word": ["docx", "doc"], "excel": ["xlsx", "xls"], "imagem": ["png", "jpg", "jpeg", "gif", "webp", "heic"],
    "imagens": ["png", "jpg", "jpeg", "gif", "webp", "heic"], "foto": ["jpg", "jpeg", "png", "heic", "webp"],
    "fotos": ["jpg", "jpeg", "png", "heic", "webp"], "video": ["mp4", "mkv", "mov", "avi", "webm"],
    "videos": ["mp4", "mkv", "mov", "avi", "webm"], "musica": ["mp3", "flac", "wav", "m4a"],
    "musicas": ["mp3", "flac", "wav", "m4a"], "zip": ["zip", "rar", "7z"], "texto": ["txt", "md"],
}
DATE_WORDS = {"hoje": "today", "ontem": "yesterday", "esta semana": "week", "nessa semana": "week",
              "semana passada": "week", "essa semana": "week", "este mes": "month", "esse mes": "month",
              "mes passado": "month", "este ano": "year", "today": "today", "yesterday": "yesterday",
              "this week": "week", "last week": "week", "this month": "month"}
FILE_HINTS = re.compile(r"\b(arquivos?|pastas?|documentos?|pdfs?|planilhas?|apresenta\w*|fotos?|imagens?|videos?|"
                        r"musicas?|projetos?|slides|downloads|files?|folders?|notas?)\b")

HELP_TEXT = ("Posso abrir e fechar aplicativos, pesquisar e organizar arquivos, informar o estado do sistema, "
             "controlar o volume, criar notas, lembretes e memórias, analisar sua tela com autorização, "
             "rodar seus projetos e testes, e conversar com o modelo de IA configurado.")

_PRONOUN = r"(?:ele|ela|isso|isto|esse|essa|este|esta|o mesmo|-o|-a|lo|la)"


class IntentRouter:
    def __init__(self, services: "Services") -> None:
        self.s = services

    # ------------------------------------------------------------ public
    def route(self, text: str) -> Intent:
        original = text.strip().rstrip(".!?…").strip()
        if not original:
            return Intent("reply", reply="", confidence=1.0)
        m = WAKE_RE.match(fold(original))
        body = original[m.end():].strip() if m else original
        if m and not body:
            return Intent("wake", reply="À disposição.", confidence=1.0)
        seq = self._route_sequence(body)
        if seq:
            return seq
        return self._route_one(body)

    def _route_sequence(self, text: str) -> Intent | None:
        f = fold(text)
        # "abra meu projeto BETA e coloque ele para rodar" is a single composite plan.
        if re.search(r"\bprojeto\b", f) and re.search(r"\b(rodar|rode|executar|execute|funcionar|iniciar|inicie|"
                                                       r"subir|suba|run)\b", f):
            return None
        pieces = re.split(r"\s*(?:,\s*)?\b(?:e depois|e entao|e em seguida|depois disso|and then)\b\s*|\s*;\s*|"
                          r"\s+\be\b\s+(?=(?:abra|abre|feche|fecha|aumente|diminua|abaixe|coloque|crie|anote|"
                          r"pesquise|procure|toque|pause|mostre|minimize|maximize|silencie|mute)\b)", f)
        if len(pieces) < 2:
            return None
        intents: list[Intent] = []
        pos = 0
        for piece in pieces:
            piece = piece.strip()
            if not piece:
                continue
            idx = f.find(piece, pos)
            if idx < 0:
                return None
            pos = idx + len(piece)
            sub = self._route_one(text[idx:idx + len(piece)])
            if sub.kind not in ("tool", "plan") or sub.confidence < 0.75:
                return None
            intents.append(sub)
        if len(intents) < 2:
            return None
        return Intent("sequence", parts=intents, confidence=min(i.confidence for i in intents))

    # ------------------------------------------------------------- rules
    def _route_one(self, text: str) -> Intent:
        o = text.strip().rstrip(".!?…").strip()
        f = fold(o)

        def g(m: re.Match[str], name: str) -> str:
            span = m.span(name)
            return o[span[0]:span[1]].strip(" ,.:;") if span[0] >= 0 else ""

        def tool_i(tool_id: str, conf: float = 0.9, **args: Any) -> Intent:
            return Intent("tool", tool_id=tool_id, args={k: v for k, v in args.items() if v not in (None, "")},
                          confidence=conf)

        def plan_i(plan: str, conf: float = 0.9, **args: Any) -> Intent:
            return Intent("plan", plan=plan, args={k: v for k, v in args.items() if v not in (None, "")},
                          confidence=conf)

        # --- cancel / confirm ------------------------------------------------
        if re.fullmatch(r"(pare|para|parar|pare tudo|cancela|cancelar|cancele|esquece|esqueca|esqueca isso|"
                        r"esquece isso|deixa pra la|deixa para la|stop|cancel|never mind|chega|silencio|interrompa|"
                        r"interromper|cala a boca|quieto)", f):
            return Intent("cancel", confidence=1.0)
        if self.s.permissions.has_pending():
            if re.fullmatch(r"(sim|pode|pode sim|confirmo|confirmar|confirma|claro|ok|okay|isso|pode continuar|"
                            r"continue|prossiga|yes|go ahead|do it|afirmativo|autorizo)", f):
                return Intent("confirm", args={"approved": True}, confidence=1.0)
            if re.fullmatch(r"(nao|negativo|nao pode|nao quero|no|nope|negado|recuse|nao autorizo)", f):
                return Intent("confirm", args={"approved": False}, confidence=1.0)

        # --- small talk -------------------------------------------------------
        if re.fullmatch(r"(obrigad[oa]|valeu|muito obrigad[oa]|thanks|thank you|obrigado jarvis)", f):
            return Intent("reply", reply="Às ordens.", confidence=1.0)
        if re.fullmatch(r"(quem e voce|o que e voce|who are you|se apresente)", f):
            return Intent("reply", reply="Sou o Jarvis, seu assistente operacional. " + HELP_TEXT, confidence=1.0)
        if re.fullmatch(r"(o que voce (pode fazer|faz|sabe fazer)|ajuda|help|comandos|what can you do)", f):
            return Intent("reply", reply=HELP_TEXT, confidence=1.0)
        if re.fullmatch(r"(bom dia|boa tarde|boa noite|ola|oi|hello|hi)", f):
            return Intent("plan", plan="greeting", confidence=0.95)

        # --- time -------------------------------------------------------------
        if re.search(r"\b(que horas sao|que hora e|horas agora|que dia e hoje|qual a data|data de hoje|"
                     r"what time is it|what day is it)\b", f):
            return tool_i("current_time", 0.95)

        # --- reminders (before memory: "lembre-me" vs "lembre que") -----------
        if re.match(r"^(lembre-me|lembre me|me lembre|me lembra|lembra-me|me avise|avise-me|me avisa|remind me|"
                    r"crie um lembrete|criar lembrete|novo lembrete|defina um lembrete|coloque um lembrete|"
                    r"agende um lembrete)\b", f) or re.match(r"^(daqui a|daqui|em \d+ (minutos?|horas?))\b.*\b"
                                                           r"(lembr|avis)", f):
            return tool_i("create_reminder", 0.95, text=o)
        if re.search(r"\b(o que (eu )?tenho (pra|para) (fazer )?hoje|minha agenda( de hoje)?|meus compromissos|"
                     r"o que tem (pra|para) hoje|what do i have today|agenda de hoje)\b", f):
            return tool_i("agenda_today", 0.95)
        if re.search(r"\b(quais (sao )?(os )?meus lembretes|liste (os |meus )?lembretes|mostre (os |meus )?lembretes|"
                     r"lembretes pendentes|meus lembretes)\b", f):
            return tool_i("list_reminders", 0.95)
        m = re.match(r"^(cancele|cancela|cancelar|apague|remova) o lembrete( de| do| da| sobre)?\s*(?P<t>.*)$", f)
        if m:
            return tool_i("cancel_reminder", 0.9, text=g(m, "t"))

        # --- memory -----------------------------------------------------------
        m = re.match(r"^(lembre|lembra|memorize|guarde( na memoria)?|grave( na memoria)?|remember|anote na memoria)"
                     r"( (que|isso|disso|de que))?[:,]?\s+(?P<c>.+)$", f)
        if m and not re.match(r"^(lembre|lembra) (de |do |da )?(me |mim )", f):
            return tool_i("remember", 0.92, content=g(m, "c"))
        m = re.match(r"^(esqueca|esquece|esquecer|forget|apague da memoria)( que| sobre| tudo sobre| o que eu disse "
                     r"sobre| about)?\s+(?P<q>.+)$", f)
        if m:
            return tool_i("forget", 0.9, query=g(m, "q"))
        m = re.search(r"\b(o que (voce )?(sabe|lembra) (sobre|de|do|da)|what do you know about|o que voce "
                      r"sabe a respeito d[eoa])\s+(?P<q>.+)$", f)
        if m:
            q = g(m, "q")
            return tool_i("recall", 0.9, query="" if fold(q) in ("mim", "me", "eu") else q)

        # --- notes ------------------------------------------------------------
        m = re.match(r"^cri(e|ar|a) uma nota( nova)? (chamada|com o titulo|intitulada|com titulo|de titulo)\s+"
                     r"(?P<title>.+?)(\s+(com o texto|com o conteudo|dizendo|que diz|com)\s+(?P<c>.+))?$", f)
        if m:
            title = g(m, "title")
            return tool_i("create_note", 0.95, title=title, content=g(m, "c") or title)
        m = re.match(r"^(anote|anota|anotar|tome nota|faca uma nota|registre|note|take a note|crie uma nota)"
                     r"( que| de que| isso| para mim| pra mim)?[:,]?\s+(?P<c>.+)$", f)
        if m:
            return tool_i("create_note", 0.93, content=g(m, "c"))
        if re.search(r"\b(mostre|mostrar|mostra|liste|listar|lista|quais sao|ver|veja|abra|abrir|leia|show)"
                     r"( as| todas as)?( minhas)? notas\b", f):
            return tool_i("list_notes", 0.95)
        m = re.match(r"^(pesquise|procure|busque|encontre|search)( nas| em)?( minhas)? notas( sobre| com| de| do| da)?"
                     r"\s+(?P<q>.+)$", f)
        if m:
            return tool_i("search_notes", 0.95, query=g(m, "q"))
        m = re.match(r"^(apague|apaga|apagar|delete|deletar|exclua|excluir|remova|remover) (essa|esta|a ultima|a) "
                     r"nota(\s+(?P<t>.+))?$", f)
        if m:
            return tool_i("delete_note", 0.92, title=g(m, "t"))

        # --- system status ----------------------------------------------------
        if re.search(r"\b((status|estado|diagnostico|situacao) do (sistema|computador|pc|notebook)|"
                     r"como (esta|anda|vai) o (sistema|computador|pc)|system status|relatorio do sistema)\b", f):
            return tool_i("system_status", 0.95, focus="all")
        m = re.search(r"\b(qual|que|quais) (processo|aplicativo|app|programa)s? (esta |estao |ta )?"
                      r"(usando|consumindo|gastando|ocupando|come|comendo)? ?(mais|a maior parte)"
                      r".*\b(?P<what>memoria|ram|cpu|processador)", f)
        if m:
            return tool_i("list_processes", 0.95, sort="cpu" if m.group("what") in ("cpu", "processador")
                          else "memory")
        if re.search(r"\b(liste|listar|mostre|mostrar|quais) (os )?processos\b", f):
            return tool_i("list_processes", 0.9, sort="memory", limit=8)
        m = re.search(r"\bporta (?P<p>\d{2,5})\b", f)
        if m and re.search(r"\b(processo|usando|ocupad|quem|qual|livre|usa)\b", f):
            return tool_i("port_info", 0.95, port=int(m.group("p")))
        if re.search(r"\b(quais|que) portas\b|\bportas (em uso|ocupadas|abertas)\b", f):
            return tool_i("port_info", 0.9)
        question = re.search(r"\b(qual|quanto|quanta|como|uso|status|esta|mostre|me diga|what|how)\b", f)
        if question:
            for pattern, focus in ((r"\b(cpu|processador)\b", "cpu"), (r"\b(memoria|ram)\b", "memory"),
                                   (r"\b(disco|armazenamento|espaco (livre|em disco))\b", "disk"),
                                   (r"\bbateria\b", "battery"), (r"\b(gpu|placa de video)\b", "gpu"),
                                   (r"\btemperatura\b", "temperature"), (r"\b(internet|rede|conexao)\b", "network"),
                                   (r"\b(ligado ha|uptime|tempo ligado)\b", "uptime")):
                if re.search(pattern, f) and not FILE_HINTS.search(f):
                    return tool_i("system_status", 0.88, focus=focus)
        if re.search(r"\b(informacoes|info|especificacoes|configuracao) do (sistema|computador|pc|hardware)\b", f):
            return tool_i("system_info", 0.9)
        if re.search(r"\b(qual|que) (aplicativo|janela|app) (esta )?(ativ[ao]|aberto agora|em primeiro plano|em foco)\b",
                     f):
            return tool_i("active_window", 0.9)

        # --- volume / media ---------------------------------------------------
        if re.fullmatch(r"(silencie|silenciar|mute|mutar|modo mudo|tire o som|coloque no mudo|mudo|fique mudo|"
                        r"silencia o computador|silencie o computador)", f):
            return tool_i("mute", 0.95, muted=True)
        if re.search(r"\b(desmute|desmutar|tire do mudo|tira do mudo|volte o som|ative o som|unmute|reative o som)\b",
                     f):
            return tool_i("mute", 0.95, muted=False)
        fn = words_to_numbers(f)
        m = re.search(r"\bvolume (para|em|a|no|pra|de)?\s*(?P<n>\d{1,3})\b", fn) or \
            re.search(r"\b(?P<n>\d{1,3})\s*(%|por cento) de volume\b", fn)
        if m and re.search(r"\b(volume|som)\b", f):
            app = self._app_in(f, o)
            return tool_i("set_volume", 0.95, level=min(100, int(m.group("n"))), app=app)
        up = re.search(r"\b(aumente|aumenta|aumentar|suba|sobe|subir|mais alto|turn up|levante)\b", f)
        down = re.search(r"\b(diminua|diminui|diminuir|abaixe|abaixa|abaixar|reduza|reduz|baixe|baixa|mais baixo|"
                         r"turn down)\b", f)
        if up or down:
            sign = 1 if up and not down else -1
            amount = 8 if re.search(r"\bum pouco|pouquinho\b", f) else 30 if re.search(r"\bmuito\b", f) else 15
            pron = re.search(r"\b(d?ele|d?ela|isso)\b", f) or re.search(r"-(o|a|lo|la)\b", f)
            if pron and not re.search(r"\b(volume|som)\b(?! d)", f):
                return plan_i("adjust_referenced", 0.9, direction=sign, amount=amount)
            if re.search(r"\b(volume|som|audio)\b", f):
                app = self._app_in(f, o)
                if pron and not app:
                    return plan_i("adjust_referenced", 0.9, direction=sign, amount=amount, volume_only=True)
                return tool_i("set_volume", 0.93, delta=sign * amount, app=app)
        if re.fullmatch(r"(pause|pausa|pausar|pause a musica|pausa a musica|pause o video|toque|tocar|play|continue|"
                        r"continue a musica|retome|retomar|despause|volte a tocar|solte a musica)", f):
            return tool_i("media_control", 0.9, action="play_pause")
        if re.search(r"\b(proxima|pula|pular|passa|next)( a)? (musica|faixa|cancao|video)\b|^proxima$|^next$", f):
            return tool_i("media_control", 0.9, action="next")
        if re.search(r"\b(musica|faixa) anterior\b|\bvolta (a|uma) musica\b|^anterior$|\bprevious\b", f):
            return tool_i("media_control", 0.9, action="previous")

        # --- screen / clipboard ----------------------------------------------
        if re.search(r"\b(leia|ler|analise|analisar|olhe|olha|veja|ve|descreva|explique|entenda|examine)\b"
                     r"(?: para mim| pra mim)?(?: o que (?:tem|ha|aparece|esta))?\s+(?:n?a |n?essa |n?esta |minha )?"
                     r"(?:minha )?tela\b|"
                     r"\b(olha|olhe|veja|analise) (esse|este|o) erro\b|\bo que (tem|ha|aparece) na (minha )?tela\b|"
                     r"\b(what'?s on|read|look at) (my|the|this) screen\b", f):
            return tool_i("screen_analysis", 0.93, question=o)
        if re.search(r"\b((o que (tem|esta|ha) na|leia a|ler a|mostre a) area de transferencia|"
                     r"what'?s in (my|the) clipboard)\b", f):
            return tool_i("clipboard_read", 0.95)
        m = re.match(r"^copie (o texto )?(?P<t>.+) para a area de transferencia$", f)
        if m:
            return tool_i("clipboard_write", 0.9, text=g(m, "t"))

        # --- focus / power ----------------------------------------------------
        if re.search(r"\b(modo (de )?foco|focus mode|modo concentracao|nao perturbe)\b", f):
            off = re.search(r"\b(desative|desativar|desligue|desligar|saia|sair|tire|encerre|termine|off)\b", f)
            return tool_i("focus_mode", 0.92, enabled=not off)
        if re.search(r"\b(bloqueie|bloquear|bloqueia|trave|travar) (o computador|a tela|o pc|a sessao|o notebook)\b|"
                     r"\block (the )?(computer|screen|pc)\b", f):
            return tool_i("lock_computer", 0.95)
        if re.search(r"\bcancel(e|ar|a) o desligamento\b|\bcancel(e|ar) o reinicio\b", f):
            return tool_i("cancel_shutdown", 0.95)
        if re.search(r"\b(desligue|desligar|desliga) (o computador|o pc|o notebook|tudo)\b|\bshut ?down\b", f):
            return tool_i("shutdown_computer", 0.93, restart=False)
        if re.search(r"\b(reinicie|reiniciar|reinicia) (o computador|o pc|o notebook)\b|\brestart (the )?computer\b", f):
            return tool_i("shutdown_computer", 0.93, restart=True)
        if re.search(r"\b(suspenda|suspender|modo de suspensao|coloque (o computador|o pc) para dormir|"
                     r"hibernar|hiberne)\b", f):
            return tool_i("sleep_computer", 0.9)

        # --- settings ---------------------------------------------------------
        m = re.match(r"^(abra|abre|abrir|mostre|mostra|va para|ir para)( as| a)? (configuracoes|configuracao|ajustes|"
                     r"definicoes|settings)( d[aeo]s?)?\s*(?P<p>.*)$", f)
        if m:
            page_words = m.group("p").strip()
            if page_words in ("jarvis", "assistente", "voce"):
                return Intent("ui", ui_action="open:settings", reply="Abrindo minhas configurações.", confidence=0.95)
            page = SETTINGS_PAGE_WORDS.get(page_words, "home" if not page_words else "")
            if page:
                return tool_i("open_system_settings", 0.93, page=page)

        # --- developer --------------------------------------------------------
        if re.search(r"\b(execute|executar|rode|rodar|roda|rodem|run|faca rodar) (os |todos os )?testes\b|"
                     r"\brun (the )?tests\b", f):
            return tool_i("run_command", 0.93, command="run_tests")
        if re.search(r"\b(mostre|mostra|quais|liste|me mostre) (os )?erros\b|\bquais (foram|sao) os erros\b", f):
            return tool_i("terminal_output", 0.9, errors_only=True)
        if re.search(r"\b(explique|explica|explicar|por ?que|porque) (o |isso |esse )?(build|erro|compilacao|"
                     r"falha|falhou|deu erro|quebrou)|\bpor que (o build |isso |o teste )?falhou\b|"
                     r"\banalise o erro do terminal\b", f):
            return tool_i("explain_error", 0.92)
        if re.search(r"\bgit status\b|\bstatus do git\b", f):
            return tool_i("run_command", 0.95, command="git_status")
        if re.search(r"\b(pare|parar|encerre|encerrar|mate|derrube) (o )?(servidor|projeto|processo do terminal|"
                     r"dev server|ambiente de desenvolvimento)\b", f):
            return tool_i("stop_process", 0.92)
        m = re.search(r"\b(scripts?) (do|de) (projeto|package)\b", f)
        if m:
            return tool_i("list_project_scripts", 0.85)
        m = re.match(r"^(abra|abre|abrir|carregue)( o| meu| o meu)? projeto( d[aeo])?\s+(?P<n>.+?)"
                     r"(\s+(e|,)\s+(?P<run>coloque|ponha|deixe|rode|execute|inicie|suba|rodar|colocar|faca).*)?$", f)
        if m:
            name = g(m, "n")
            if m.group("run"):
                return plan_i("run_project", 0.95, project=name, open_editor=True)
            return plan_i("open_project", 0.95, project=name)
        m = re.match(r"^(rode|roda|rodar|execute|executar|inicie|iniciar|suba|subir|coloque para rodar|"
                     r"ponha para rodar|run|start)( o| meu| o meu)? projeto( d[aeo])?\s*(?P<n>.*)$", f)
        if m:
            return plan_i("run_project", 0.93, project=g(m, "n"))
        m = re.match(r"^(coloque|ponha|deixe) (ele|ela|isso|o projeto) (para|pra) rodar$", f)
        if m:
            return plan_i("run_project", 0.9, project="")
        m = re.match(r"^(abra|abre|abrir|inicie|abra-me)( o)? (vs ?code|vscode|visual studio code|code|editor)"
                     r"(?P<rest>.*)$", f)
        if m:
            rest = m.group("rest").strip()
            path = None
            if re.search(r"\b(nessa|nesta|essa|esta|na) pasta\b|\baqui\b|\bnesse projeto\b|\bneste projeto\b", rest):
                path = self.s.context.latest_file_or_folder()
            else:
                mm = re.search(r"\b(na|no|em) (pasta |projeto )?(?P<p>.+)$", rest)
                if mm:
                    return plan_i("open_project", 0.9, project=o[len(o) - len(rest) + mm.start("p"):].strip())
            return tool_i("open_in_vscode", 0.95, path=path)

        # --- files ------------------------------------------------------------
        m = re.match(r"^(abra|abre|abrir|mostre|mostra)( o| a)? (?P<sel>(mais recente|mais novo|mais antigo|primeiro|"
                     r"primeira|segundo|segunda|terceiro|terceira|ultimo|ultima|1|2|3|4|5)( arquivo| resultado| item| "
                     r"pasta| deles| da lista)?)$", f)
        if m:
            return plan_i("open_from_results", 0.95, selector=m.group("sel"))
        if re.fullmatch(r"(abra|abre|abrir|abra ele|abre ele|abra ela|abra isso|abra esse arquivo|abra essa pasta|"
                        r"abra o arquivo|abri-lo|abra-o|abra-a)", f):
            return plan_i("open_referenced", 0.9)
        m = re.match(r"^(abra|abre|abrir|mostre|va para|entre na|entre em)( a)? pasta( d[aeo]s?)?\s+(?P<n>.+)$", f)
        if m:
            return tool_i("open_folder", 0.95, name=g(m, "n"))
        m = re.match(r"^(abra|abre|abrir)( o| a)? (arquivo|documento|planilha|apresentacao|pdf|foto|imagem|video)"
                     r"( d[aeo])?\s+(?P<n>.+)$", f)
        if m:
            return plan_i("open_by_name", 0.93, name=g(m, "n"), kind=m.group(3))
        m = re.match(r"^cri(e|ar|a)( uma)? (nova )?pasta( nova)?( chamada| com o nome| de nome| nomeada)?\s+(?P<n>.+?)"
                     r"(\s+(em|na|no|dentro de)\s+(?P<p>.+))?$", f)
        if m:
            return tool_i("create_folder", 0.95, name=g(m, "n"), parent=g(m, "p"))
        m = re.match(r"^(renomeie|renomear|renomeia|mude o nome d[aeo])( o arquivo| a pasta| o| a)?\s+(?P<a>.+?)\s+"
                     r"(para|pra)\s+(?P<b>.+)$", f)
        if m:
            return plan_i("rename", 0.9, target=g(m, "a"), new_name=g(m, "b"))
        m = re.match(r"^(mova|mover|move|transfira)( o arquivo| a pasta| o| a)?\s+(?P<a>.+?)\s+(para|pra) (a pasta )?"
                     r"(?P<b>.+)$", f)
        if m:
            return plan_i("move", 0.9, target=g(m, "a"), destination=g(m, "b"))
        m = re.match(r"^(copie|copiar|copia)( o arquivo| a pasta| o| a)?\s+(?P<a>.+?)\s+(para|pra) (a pasta )?"
                     r"(?P<b>.+)$", f)
        if m:
            return plan_i("copy", 0.9, target=g(m, "a"), destination=g(m, "b"))
        m = re.match(r"^(apague|apaga|apagar|delete|deletar|exclua|excluir|remova|remover|jogue na lixeira)"
                     r"( permanentemente)?( o arquivo| a pasta| o| a| os arquivos| esses arquivos)?\s*(?P<a>.*)$", f)
        if m and not re.search(r"\bnota\b|\blembrete\b|\bmemoria\b", f):
            return plan_i("delete", 0.88, target=g(m, "a"), permanent=bool(m.group(2)))
        m = re.match(r"^(organize|organizar|organiza|arrume|arrumar)( a pasta| os arquivos d[aeo]s?| a| o)?\s*(?P<f>.*)$",
                     f)
        if m:
            target = g(m, "f")
            if not target or fold(target) in ("esses arquivos", "estes arquivos", "isso", "aqui", "essa pasta"):
                target = self.s.context.latest_file_or_folder() or ""
            if target:
                return tool_i("organize_folder", 0.9, folder=target)
        m = re.match(r"^(resuma|resumir|resume|faca um resumo d[aeo]|sumarize)( esse| este| o| a| essa| esta)?"
                     r"( documento| arquivo| pdf| texto| planilha)?\s*(?P<n>.*)$", f)
        if m:
            return plan_i("summarize", 0.92, name=g(m, "n"))
        m = re.match(r"^(analise|analisar|analisa|leia|ler)( esse| este| o| a| essa| esta) (arquivo|documento|pdf|texto)"
                     r"\s*(?P<n>.*)$", f)
        if m:
            return plan_i("summarize", 0.9, name=g(m, "n"), focus="análise detalhada: pontos principais, problemas e "
                                                                    "próximos passos")
        m = re.match(r"^(qual|quais) (?P<type>\w+) (eu )?(modifiquei|editei|baixei|salvei|criei|mexi|alterei|usei)"
                     r"(\s+(?P<when>.+))?$", f)
        if m:
            exts = FILE_TYPE_WORDS.get(m.group("type"), [])
            when = DATE_WORDS.get((m.group("when") or "").strip(), None)
            return tool_i("search_files", 0.92, extensions=exts or None, modified=when, sort="recent", limit=5,
                          kind="file")
        m = re.match(r"^(procure|procura|procurar|pesquise|pesquisa|pesquisar|encontre|encontra|encontrar|ache|acha|"
                     r"busque|busca|buscar|localize|localiza|find|search|search for)\b(?P<rest>.*)$", f)
        if m:
            rest = m.group("rest").strip()
            web = re.search(r"\b(na (web|internet)|no google|online|no youtube|no bing)\b", rest)
            is_files = FILE_HINTS.search(rest) or re.match(r"(meu|minha|meus|minhas|o arquivo|a pasta)\b", rest)
            verb_web = m.group(1).startswith(("pesquis", "busc", "search"))
            if web or (verb_web and not is_files):
                return self._web_search(o, f, len(o) - len(rest))
            return self._file_search(o, f, len(o) - len(rest))

        # --- browser / web ----------------------------------------------------
        if re.fullmatch(r"(abra|abre|abrir|inicie|abra-me)( o| um)? (navegador|browser)( por favor)?", f):
            return tool_i("open_browser", 0.95)
        m = re.match(r"^(abra|abre|abrir|acesse|acessar|va para|entre no|entre em)( o site| o endereco| o)?\s+"
                     r"(?P<u>[a-z0-9][\w.-]*\.(com|br|org|net|io|dev|app|gov|edu|ai|me|tv|co)(\.[a-z]{2})?(/\S*)?)$", f)
        if m:
            return tool_i("open_url", 0.95, url=g(m, "u"))

        # --- close / windows ----------------------------------------------------
        m = re.match(r"^(feche|fecha|fechar|encerre|encerra|encerrar|finalize|finaliza|saia do|sai do|close|quit|"
                     r"kill)\s*(?P<n>.*)$", f)
        if m:
            name = g(m, "n")
            if not name or re.fullmatch(_PRONOUN + r"|o app|o aplicativo|o programa|a janela", fold(name)):
                return tool_i("close_application", 0.9)
            name = re.sub(r"^(o|a|os|as)\s+", "", name, flags=re.I)
            return tool_i("close_application", 0.92, name=name)
        m = re.match(r"^(minimize|minimiza|minimizar|maximize|maximiza|maximizar|restaure|restaura)\s*(?P<n>.*)$", f)
        if m:
            verb = m.group(1)
            state = "minimize" if verb.startswith("minim") else "maximize" if verb.startswith("maxim") else "restore"
            name = g(m, "n")
            if re.fullmatch(_PRONOUN + r"?|a janela|tudo", fold(name)):
                name = ""
            name = re.sub(r"^(o|a)\s+", "", name, flags=re.I)
            return tool_i("window_state", 0.9, state=state, name=name)
        m = re.match(r"^(traga|traz|mostre|foque|foca|focar|va para|alterne para|mude para)( o| a| para o| para a)?\s+"
                     r"(?P<n>.+?)( para frente)?$", f)
        if m and not FILE_HINTS.search(f):
            return tool_i("focus_window", 0.8, name=g(m, "n"))

        # --- open (apps, sites, folders) --------------------------------------
        m = re.match(r"^(abra|abre|abrir|abri|inicie|inicia|iniciar|execute|executa|executar|lance|lanca|ligue|liga|"
                     r"open|launch|start|me abra|abra pra mim)( o| a| os| as| meu| minha| o meu| a minha)?\s+(?P<n>.+)$",
                     f)
        if m:
            name = re.sub(r"\s+(para mim|pra mim|por favor|agora)$", "", g(m, "n"), flags=re.I)
            return plan_i("open_target", 0.9, name=name)

        # --- web search fallbacks ----------------------------------------------
        m = re.match(r"^(google|pesquise|pesquisa)\s+(?P<q>.+)$", f)
        if m:
            return self._web_search(o, f, 0)

        return Intent("llm", confidence=0.0)

    # ---------------------------------------------------------- helpers
    def _app_in(self, f: str, o: str) -> str | None:
        m = re.search(r"\b(do|da|no|na|of)\s+(?P<a>[a-z0-9][\w .-]{1,40})$", f)
        if not m:
            return None
        cand = o[m.start("a"):m.end("a")].strip()
        if fold(cand) in ("computador", "pc", "sistema", "windows", "notebook"):
            return None
        return cand

    def _web_search(self, o: str, f: str, offset: int) -> Intent:
        rest_o = o[offset:]
        rest_f = fold(rest_o)
        engine = "youtube" if "youtube" in rest_f else "google"
        q = re.sub(r"\b(na web|na internet|no google|online|no youtube|no bing|para mim|pra mim|por favor|sobre|por)\b",
                   " ", rest_f)
        q = re.sub(r"\s+", " ", q).strip()
        if not q or re.fullmatch(_PRONOUN, q):
            return Intent("plan", plan="search_this", args={"engine": engine}, confidence=0.85)
        # keep the user's original casing/accents for the query where possible
        idx = rest_f.find(q.split(" ")[0]) if q else -1
        query = rest_o[idx:].strip() if idx >= 0 else q
        query = re.sub(r"\s+(na web|na internet|no google|online|no youtube|para mim|pra mim|por favor)$", "", query,
                       flags=re.I)
        return Intent("tool", tool_id="web_search", args={"query": query, "engine": engine}, confidence=0.88)

    def _file_search(self, o: str, f: str, offset: int) -> Intent:
        rest_o = o[offset:].strip()
        rest = fold(rest_o)
        recent_folder = self.s.context.most_recent(("folder",))
        scoped = bool(recent_folder and time.time() - recent_folder.ts < 600 and re.match(r"(pelo|pela|o|a)\b", rest))
        if re.search(r"\bprojetos?\b", rest):
            q = re.sub(r"\b(os|meus|minhas|o|meu|projetos?|d[aeo]s?|pelo|pela|por|todos)\b", " ", rest)
            q = re.sub(r"\s+", " ", q).strip()
            idx = rest.find(q) if q else -1
            query = rest_o[idx:idx + len(q)] if q and idx >= 0 else ""
            if scoped and query:
                # "Abra a pasta Downloads" -> "Procure pelo projeto da BETA": look inside that folder first.
                return Intent("plan", plan="scoped_search", args={"query": query, "fallback": "project"},
                              confidence=0.92)
            return Intent("tool", tool_id="find_projects", args={"query": query} if query else {}, confidence=0.92)
        exts: list[str] = []
        for word, e in FILE_TYPE_WORDS.items():
            if re.search(rf"\b{word}\b", rest):
                exts.extend(e)
        modified = None
        for word, key in DATE_WORDS.items():
            if re.search(rf"\b{word}\b", rest):
                modified = key
        folder = None
        mm = re.search(r"\b(na pasta|em|no|na|dentro de)\s+(?P<fo>downloads|documentos|area de trabalho|desktop|"
                       r"imagens|fotos|musicas|videos|aqui|essa pasta)\b", rest)
        if mm:
            folder = mm.group("fo")
        elif re.search(r"\baqui\b|\bnessa pasta\b|\bnesta pasta\b", rest):
            folder = "aqui"
        elif scoped:
            folder = "aqui"
        noise = (r"\b(meu|minha|meus|minhas|o|a|os|as|pelo|pela|por|um|uma|arquivos?|pastas?|documentos?|"
                 r"apresenta\w*|planilhas?|pdfs?|fotos?|imagens?|videos?|musicas?|slides|d[aeo]s?|que|eu|"
                 r"modifiquei|editei|baixei|salvei|criei|hoje|ontem|esta|essa|nessa|semana|mes|ano|passad[oa]|na|no|"
                 r"em|pasta|downloads|documentos|area de trabalho|desktop|aqui|dentro|de|todos|todas|para mim|"
                 r"pra mim|chamad[oa]|com|nome|sobre)\b")
        terms_f = re.sub(r"\s+", " ", re.sub(noise, " ", rest)).strip()
        terms = ""
        if terms_f:
            words = terms_f.split()
            kept = [w for w in re.findall(r"\S+", rest_o) if fold(w).strip(",.") in words]
            terms = " ".join(kept) or terms_f
        args: dict[str, Any] = {"query": terms}
        if exts:
            args["extensions"] = sorted(set(exts))
        if modified:
            args["modified"] = modified
        if folder:
            args["folder"] = folder
        if not terms:
            args["sort"] = "recent"
        if scoped and folder == "aqui" and terms:
            return Intent("plan", plan="scoped_search", args={"query": terms, "fallback": "files"}, confidence=0.9)
        return Intent("tool", tool_id="search_files", args=args, confidence=0.9)
