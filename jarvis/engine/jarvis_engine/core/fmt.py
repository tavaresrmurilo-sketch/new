"""Human-friendly formatting (pt-BR) for spoken and written responses."""

from __future__ import annotations

from datetime import datetime


def pct(value: float | None) -> str:
    return "N/A" if value is None else f"{value:.0f}%"


def gb(value: float | None) -> str:
    if value is None:
        return "N/A"
    return f"{value:.1f} GB".replace(".", ",")


def size(num_bytes: int | float | None) -> str:
    if num_bytes is None:
        return "N/A"
    n = float(num_bytes)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024 or unit == "TB":
            return (f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}").replace(".", ",")
        n /= 1024
    return f"{n:.1f} TB"


def rate(bps: int | float | None) -> str:
    return "N/A" if bps is None else f"{size(bps)}/s"


def duration(seconds: float | int) -> str:
    s = int(seconds)
    d, s = divmod(s, 86400)
    h, s = divmod(s, 3600)
    m, s = divmod(s, 60)
    parts = []
    if d:
        parts.append(f"{d} dia{'s' if d > 1 else ''}")
    if h:
        parts.append(f"{h} h")
    if m and not d:
        parts.append(f"{m} min")
    if not parts:
        parts.append(f"{s} s")
    return " ".join(parts)


def when(ts: float) -> str:
    dt = datetime.fromtimestamp(ts)
    today = datetime.now().date()
    days = (today - dt.date()).days
    hm = dt.strftime("%H:%M")
    if days == 0:
        return f"hoje às {hm}"
    if days == 1:
        return f"ontem às {hm}"
    if 1 < days < 7:
        return f"há {days} dias"
    return dt.strftime("%d/%m/%Y")


def join_pt(items: list[str]) -> str:
    items = [i for i in items if i]
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    return ", ".join(items[:-1]) + " e " + items[-1]
