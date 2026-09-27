"""Text normalisation helpers shared by the intent router, app matcher and parsers."""

from __future__ import annotations

import difflib
import re
import unicodedata

_UNITS = {
    "zero": 0, "um": 1, "uma": 1, "dois": 2, "duas": 2, "tres": 3, "quatro": 4, "cinco": 5, "seis": 6,
    "sete": 7, "oito": 8, "nove": 9, "dez": 10, "onze": 11, "doze": 12, "treze": 13, "catorze": 14,
    "quatorze": 14, "quinze": 15, "dezesseis": 16, "dezessete": 17, "dezoito": 18, "dezenove": 19,
    "vinte": 20, "trinta": 30, "quarenta": 40, "cinquenta": 50, "sessenta": 60, "setenta": 70,
    "oitenta": 80, "noventa": 90, "cem": 100, "cento": 100,
    # english
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
    "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16,
    "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
    "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90, "hundred": 100, "a": 1, "an": 1,
}


def strip_accents(text: str) -> str:
    norm = unicodedata.normalize("NFKD", text)
    return "".join(c for c in norm if not unicodedata.combining(c))


def normalize(text: str) -> str:
    """Lowercase, remove accents and punctuation (keeps digits, ':' and '.' inside numbers)."""
    t = strip_accents(text.lower())
    t = re.sub(r"(?<!\d)[.,!?;](?!\d)", " ", t)
    t = re.sub(r"[\"'`´“”‘’()\[\]{}]", " ", t)
    t = re.sub(r"\s+", " ", t)
    return t.strip()


def words_to_numbers(text: str) -> str:
    """Replace spelled-out numbers ("vinte e cinco") with digits ("25")."""
    tokens = text.split()
    out: list[str] = []
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        if tok in _UNITS and not (tok in ("a", "an", "um", "uma") and not _next_is_unit(tokens, i)):
            total = _UNITS[tok]
            j = i + 1
            while j + 1 < len(tokens) and tokens[j] in ("e", "and") and tokens[j + 1] in _UNITS \
                    and tokens[j + 1] not in ("a", "an", "um", "uma"):
                total += _UNITS[tokens[j + 1]]
                j += 2
            out.append(str(total))
            i = j
        else:
            out.append(tok)
            i += 1
    return " ".join(out)


_TIME_UNIT_WORDS = {"minuto", "minutos", "hora", "horas", "segundo", "segundos", "dia", "dias", "semana", "semanas",
                    "minute", "minutes", "hour", "hours", "second", "seconds", "day", "days", "week", "weeks", "min"}


def _next_is_unit(tokens: list[str], i: int) -> bool:
    return i + 1 < len(tokens) and tokens[i + 1] in _TIME_UNIT_WORDS


_STOP_ARTICLES = {"o", "a", "os", "as", "um", "uma", "the", "meu", "minha", "meus", "minhas", "my", "de", "do", "da",
                  "app", "aplicativo", "programa", "application"}


def clean_entity(text: str) -> str:
    """Strip leading articles/possessives and trailing politeness from an entity phrase."""
    t = normalize(text)
    t = re.sub(r"\b(por favor|pra mim|para mim|please|agora|now)\b", " ", t)
    tokens = t.split()
    while tokens and tokens[0] in _STOP_ARTICLES:
        tokens.pop(0)
    return " ".join(tokens).strip()


def similarity(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, a, b).ratio()


def best_match(query: str, candidates: list[str], cutoff: float = 0.6) -> tuple[str, float] | None:
    q = normalize(query)
    best: tuple[str, float] | None = None
    for c in candidates:
        score = similarity(q, normalize(c))
        if best is None or score > best[1]:
            best = (c, score)
    if best and best[1] >= cutoff:
        return best
    return None
