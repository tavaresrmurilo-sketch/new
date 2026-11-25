"""Natural-language time expressions for reminders (pt-BR first, English supported).

parse_when("lembre-me amanhã às 15h de ligar para o João")
  -> When(due=<tomorrow 15:00 local>, recurrence=None, message="ligar para o João")
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from .text import strip_accents, words_to_numbers

WEEKDAYS = {
    "segunda": 0, "segunda-feira": 0, "terca": 1, "terca-feira": 1, "quarta": 2, "quarta-feira": 2,
    "quinta": 3, "quinta-feira": 3, "sexta": 4, "sexta-feira": 4, "sabado": 5, "domingo": 6,
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3, "friday": 4, "saturday": 5, "sunday": 6,
}
MONTHS = {
    "janeiro": 1, "fevereiro": 2, "marco": 3, "abril": 4, "maio": 5, "junho": 6, "julho": 7, "agosto": 8,
    "setembro": 9, "outubro": 10, "novembro": 11, "dezembro": 12,
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
}
PERIOD_HOURS = {"manha": 9, "morning": 9, "tarde": 15, "afternoon": 15, "noite": 20, "evening": 20, "night": 20,
                "madrugada": 6}

_WD = r"(segunda(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sabado|domingo|" \
      r"monday|tuesday|wednesday|thursday|friday|saturday|sunday)"
_TIME = r"(?:(?:as|a|at|@)\s+)?(\d{1,2})(?:(?::|h)(\d{2}))?\s*(?:h(?:oras?)?|hrs?)?\s*(am|pm|da manha|da tarde|da noite)?"
_UNIT = r"(segundos?|minutos?|mins?|horas?|dias?|semanas?|seconds?|minutes?|hours?|days?|weeks?)"

_UNIT_SECONDS = {"seg": 1, "sec": 1, "min": 60, "hor": 3600, "hou": 3600, "dia": 86400, "day": 86400,
                 "sem": 604800, "wee": 604800}


@dataclass
class When:
    due: datetime
    recurrence: dict[str, Any] | None
    message: str

    def describe(self) -> str:
        return describe_due(self.due, self.recurrence)


def _fold(text: str) -> str:
    """Lowercase + strip accents, preserving string length (1:1 char mapping)."""
    out = []
    for ch in text:
        f = strip_accents(ch.lower())
        out.append(f[:1] if f else " ")
    return "".join(out)


def _unit_seconds(unit: str) -> int:
    return _UNIT_SECONDS.get(unit[:3], 60)


def _apply_time(base: datetime, hour: int, minute: int, suffix: str | None) -> datetime:
    if suffix in ("pm", "da tarde", "da noite") and hour < 12:
        hour += 12
    if suffix in ("am", "da manha") and hour == 12:
        hour = 0
    if not 0 <= hour <= 23 or not 0 <= minute <= 59:
        raise ValueError("hora inválida")
    return base.replace(hour=hour, minute=minute, second=0, microsecond=0)


def parse_when(text: str, now: datetime | None = None) -> When | None:
    now = (now or datetime.now().astimezone()).replace(microsecond=0)
    original = text
    # Spell out numbers first; this changes lengths, so work on the converted string from here on.
    converted = words_to_numbers_preserving(original)
    s = _fold(converted)
    spans: list[tuple[int, int]] = []
    due: datetime | None = None
    recurrence: dict[str, Any] | None = None

    def take(m: re.Match[str]) -> None:
        spans.append((m.start(), m.end()))

    # --- recurrence ------------------------------------------------------
    m = re.search(r"\b(?:a cada|every)\s+(\d+)?\s*" + _UNIT, s)
    if m:
        n = int(m.group(1) or 1)
        secs = n * _unit_seconds(m.group(2))
        if secs < 60:
            secs = 60
        recurrence = {"type": "interval", "seconds": secs}
        due = now + timedelta(seconds=secs)
        take(m)

    if recurrence is None:
        m = re.search(r"\b(?:tod[oa]s?\s+(?:os\s+|as\s+)?|every\s+)" + _WD + r"s?\b", s)
        if m:
            wd = WEEKDAYS[m.group(1)]
            recurrence = {"type": "weekly", "weekday": wd}
            take(m)
        else:
            m = re.search(r"\b(?:todos os dias|todo dia|diariamente|every day|daily)\b", s)
            if m:
                recurrence = {"type": "daily"}
                take(m)

    # --- relative offsets ------------------------------------------------
    if due is None:
        m = re.search(r"\b(?:daqui\s+(?:a\s+)?|em\s+|dentro de\s+|in\s+)(\d+)\s*" + _UNIT +
                      r"(?:\s+e\s+(meia|\d+\s*minutos?))?", s)
        if m:
            secs = int(m.group(1)) * _unit_seconds(m.group(2))
            extra = m.group(3)
            if extra == "meia":
                secs += 1800
            elif extra:
                secs += int(re.match(r"\d+", extra).group(0)) * 60  # type: ignore[union-attr]
            due = now + timedelta(seconds=secs)
            take(m)
        else:
            m = re.search(r"\b(?:daqui\s+(?:a\s+)?|em\s+)(meia hora|half an hour)\b", s)
            if m:
                due = now + timedelta(minutes=30)
                take(m)

    # --- explicit day ----------------------------------------------------
    day: datetime | None = None
    if due is None:
        m = re.search(r"\b(depois de amanha|amanha|hoje|tomorrow|today|day after tomorrow)\b", s)
        if m:
            word = m.group(1)
            offset = {"hoje": 0, "today": 0, "amanha": 1, "tomorrow": 1, "depois de amanha": 2,
                      "day after tomorrow": 2}[word]
            day = now + timedelta(days=offset)
            take(m)
        elif recurrence and recurrence["type"] == "weekly":
            ahead = (recurrence["weekday"] - now.weekday()) % 7
            day = now + timedelta(days=ahead)
        else:
            m = re.search(r"\b(?:na |no |nesta |neste |proxima |proximo |on |next )?" + _WD + r"\b", s)
            if m:
                wd = WEEKDAYS[m.group(1)]
                ahead = (wd - now.weekday()) % 7
                day = now + timedelta(days=ahead or 7) if ahead == 0 else now + timedelta(days=ahead)
                take(m)
            else:
                m = re.search(r"\b(?:dia\s+)?(\d{1,2})(?:/(\d{1,2})(?:/(\d{2,4}))?|\s+de\s+([a-z]+))\b", s)
                if m and (m.group(2) or (m.group(4) in MONTHS)):
                    d = int(m.group(1))
                    mo = int(m.group(2)) if m.group(2) else MONTHS[m.group(4)]
                    y = int(m.group(3)) if m.group(3) else now.year
                    if y < 100:
                        y += 2000
                    try:
                        day = now.replace(year=y, month=mo, day=d)
                        if day.date() < now.date() and not m.group(3):
                            day = day.replace(year=y + 1)
                        take(m)
                    except ValueError:
                        day = None

    # --- time of day -----------------------------------------------------
    hour_min: tuple[int, int, str | None] | None = None
    if due is None:
        tm = None
        for cand in re.finditer(r"(?:\b(?:as|a|at)\s+|@\s*|\b)(\d{1,2})(?::(\d{2})|h(\d{2})?|\s*(?:horas?|hrs?)\b)?"
                                r"\s*(am|pm|da manha|da tarde|da noite)?", s):
            has_marker = bool(re.match(r"(?:as|a|at)\s+|@", cand.group(0).strip() + " ")) or \
                bool(cand.group(2) or cand.group(3)) or "h" in cand.group(0)[len(cand.group(1)) - 1:] or \
                bool(cand.group(4))
            if not has_marker:
                continue
            if any(a <= cand.start() < b for a, b in spans):
                continue
            tm = cand
            break
        if tm:
            h = int(tm.group(1))
            mi = int(tm.group(2) or tm.group(3) or 0)
            hour_min = (h, mi, tm.group(4))
            spans.append((tm.start(), tm.end()))
        else:
            pm = re.search(r"\b(?:de |a |pela |a noite|of the |in the |at )?(manha|tarde|noite|madrugada|morning|"
                           r"afternoon|evening|night)\b", s)
            if pm and (day is not None or recurrence):
                hour_min = (PERIOD_HOURS[pm.group(1)], 0, None)
                take(pm)
            elif pm and re.search(r"\b(hoje a noite|hoje de manha|hoje a tarde|esta noite|tonight)\b", s):
                hour_min = (PERIOD_HOURS[pm.group(1)], 0, None)
                take(pm)

        if day is None and hour_min is None and recurrence is None:
            return None
        base = day or now
        if hour_min:
            try:
                due = _apply_time(base, *hour_min)
            except ValueError:
                return None
            if day is None and due <= now:
                due += timedelta(days=1)
            if recurrence and recurrence["type"] in ("daily", "weekly"):
                recurrence["time"] = f"{due.hour:02d}:{due.minute:02d}"
                if recurrence["type"] == "daily" and due <= now:
                    due += timedelta(days=1)
                if recurrence["type"] == "weekly" and due <= now:
                    due += timedelta(days=7)
        else:
            default_hour = 9
            due = base.replace(hour=default_hour, minute=0, second=0)
            if recurrence and recurrence["type"] in ("daily", "weekly"):
                recurrence["time"] = f"{default_hour:02d}:00"
            if due <= now:
                due += timedelta(days=7 if (recurrence or {}).get("type") == "weekly" else 1)

    message = _extract_message(converted, spans)
    return When(due=due, recurrence=recurrence, message=message)


def words_to_numbers_preserving(text: str) -> str:
    """Apply words_to_numbers on a folded copy but keep the original casing for other words."""
    folded_tokens = _fold(text).split()
    original_tokens = text.split()
    if len(folded_tokens) != len(original_tokens):
        return text
    converted = words_to_numbers(" ".join(folded_tokens)).split()
    if converted == folded_tokens:
        return text
    # Re-align: rebuild output using original tokens where the folded token was untouched.
    out: list[str] = []
    i = j = 0
    while i < len(folded_tokens) and j < len(converted):
        if folded_tokens[i] == converted[j]:
            out.append(original_tokens[i])
            i += 1
            j += 1
        else:
            # converted[j] is a number replacing one or more folded tokens
            out.append(converted[j])
            j += 1
            consumed = 0
            while i < len(folded_tokens) and (j >= len(converted) or folded_tokens[i] != converted[j]):
                i += 1
                consumed += 1
                if consumed > 6:
                    break
    out.extend(original_tokens[i:])
    return " ".join(out)


_LEAD = re.compile(
    r"^\s*(?:jarvis[,\s]+)?(?:(?:me\s+)?lembr[ea](?:-me|r)?(?:\s+me)?|me\s+avis[ea]|avis[ea]-me|remind me|"
    r"crie um lembrete|criar lembrete|novo lembrete|lembrete)\b[\s,:]*",
    re.IGNORECASE,
)
_CONNECTORS = re.compile(r"^\s*(?:de|que|para|pra|sobre|do|da|to|about|that|:|,|-)\s+", re.IGNORECASE)


def _extract_message(text: str, spans: list[tuple[int, int]]) -> str:
    chars = list(text)
    for a, b in spans:
        for k in range(a, min(b, len(chars))):
            chars[k] = " "
    msg = re.sub(r"\s+", " ", "".join(chars)).strip()
    msg = _LEAD.sub("", msg)
    for _ in range(3):
        msg = _CONNECTORS.sub("", msg)
    msg = re.sub(r"\s+(?:de|as|a|at|on|no|na|em)\s*$", "", msg, flags=re.IGNORECASE)
    msg = msg.strip(" ,.;:-")
    return msg[:1].upper() + msg[1:] if msg else msg


def next_occurrence(recurrence: dict[str, Any], after: datetime) -> datetime | None:
    kind = recurrence.get("type")
    if kind == "interval":
        return after + timedelta(seconds=max(60, int(recurrence.get("seconds", 3600))))
    hh, mm = (int(x) for x in str(recurrence.get("time", "09:00")).split(":"))
    if kind == "daily":
        cand = after.replace(hour=hh, minute=mm, second=0, microsecond=0)
        if cand <= after:
            cand += timedelta(days=1)
        return cand
    if kind == "weekly":
        wd = int(recurrence.get("weekday", 0))
        cand = after.replace(hour=hh, minute=mm, second=0, microsecond=0)
        ahead = (wd - after.weekday()) % 7
        cand += timedelta(days=ahead)
        if cand <= after:
            cand += timedelta(days=7)
        return cand
    return None


_WEEKDAY_PT = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]


def describe_due(due: datetime, recurrence: dict[str, Any] | None = None, now: datetime | None = None) -> str:
    now = now or datetime.now().astimezone()
    hm = f"{due.hour:02d}:{due.minute:02d}"
    if recurrence:
        kind = recurrence.get("type")
        if kind == "daily":
            return f"todos os dias às {hm}"
        if kind == "weekly":
            return f"toda {_WEEKDAY_PT[int(recurrence.get('weekday', 0))]} às {hm}"
        if kind == "interval":
            secs = int(recurrence.get("seconds", 0))
            if secs % 3600 == 0:
                n = secs // 3600
                return f"a cada {n} hora{'s' if n > 1 else ''}"
            n = max(1, secs // 60)
            return f"a cada {n} minuto{'s' if n > 1 else ''}"
    delta = due - now
    if timedelta(0) < delta < timedelta(hours=2):
        mins = max(1, round(delta.total_seconds() / 60))
        return f"em {mins} minuto{'s' if mins > 1 else ''} ({hm})"
    days = (due.date() - now.date()).days
    if days == 0:
        return f"hoje às {hm}"
    if days == 1:
        return f"amanhã às {hm}"
    if 1 < days < 7:
        return f"{_WEEKDAY_PT[due.weekday()]} às {hm}"
    return f"{due.day:02d}/{due.month:02d} às {hm}"
