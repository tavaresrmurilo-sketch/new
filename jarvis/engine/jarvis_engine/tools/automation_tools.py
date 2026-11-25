"""Computer control (experimental, Windows, opt-in).

Strategy follows OBSERVE -> PLAN -> ACT -> OBSERVE -> VERIFY and prefers the
Windows UI Automation (accessibility) tree over pixel coordinates: elements are
located by name/control type, invoked through UIA patterns, and the result is
re-read afterwards to verify it took effect. Blind coordinate clicking is not
offered at all.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

from .base import PermissionLevel as L
from .base import Tool, ToolContext, ToolExecutionError, ToolParam, ToolResult, fail, ok, tool

SETTING = "system.computer_control_enabled"


def _desktop() -> Any:
    try:
        from pywinauto import Desktop  # type: ignore[import-not-found]
    except ImportError as exc:
        raise ToolExecutionError("Instale 'pywinauto' (setup.cmd) para usar o controle de interface.") from exc
    return Desktop(backend="uia")


def _window(title: str) -> Any:
    desk = _desktop()
    wanted = title.lower()
    for w in desk.windows():
        try:
            text = w.window_text()
        except Exception:
            continue
        if wanted in text.lower():
            return w
    raise ToolExecutionError(f"Nenhuma janela com '{title}' no título.")


def _describe_element(el: Any) -> dict[str, Any]:
    info = el.element_info
    return {"name": info.name, "type": info.control_type, "automationId": info.automation_id,
            "enabled": bool(getattr(info, "enabled", True))}


def _find(window: Any, name: str, control_type: str | None) -> Any:
    wanted = name.lower()
    best = None
    for el in window.descendants():
        info = el.element_info
        if control_type and info.control_type != control_type:
            continue
        nm = (info.name or "").lower()
        if nm == wanted:
            return el
        if best is None and wanted in nm:
            best = el
    if best is None:
        raise ToolExecutionError(f"Não encontrei o elemento '{name}' na janela.")
    return best


@tool("ui_inspect", "Inspecionar janela (UIA)",
      "OBSERVE: lista os elementos interativos de uma janela via UI Automation.", L.READ, "automation",
      [ToolParam("window", "string", "Parte do título da janela", max_length=200)],
      describe=lambda a: f"Inspecionar a janela '{a.get('window')}'", platforms=("win32",), requires_setting=SETTING)
async def ui_inspect(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    def work() -> list[dict[str, Any]]:
        w = _window(args["window"])
        interactive = {"Button", "Edit", "CheckBox", "RadioButton", "ComboBox", "MenuItem", "Hyperlink", "TabItem",
                       "ListItem"}
        out = []
        for el in w.descendants():
            if el.element_info.control_type in interactive and el.element_info.name:
                out.append(_describe_element(el))
            if len(out) >= 80:
                break
        return out

    elements = await asyncio.to_thread(work)
    return ok(f"{len(elements)} elementos interativos encontrados.", {"elements": elements})


@tool("ui_click", "Acionar elemento (UIA)",
      "ACT + VERIFY: aciona um botão/elemento pelo nome usando UI Automation e verifica o resultado.",
      L.IMPORTANT, "automation",
      [ToolParam("window", "string", "Parte do título da janela", max_length=200),
       ToolParam("element", "string", "Nome visível do elemento", max_length=200),
       ToolParam("control_type", "string", "Tipo do controle", required=False,
                 enum=["Button", "CheckBox", "RadioButton", "MenuItem", "Hyperlink", "TabItem", "ListItem"])],
      describe=lambda a: f"Clicar em '{a.get('element')}' na janela '{a.get('window')}'", platforms=("win32",),
      requires_setting=SETTING)
async def ui_click(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    def work() -> dict[str, Any]:
        w = _window(args["window"])
        el = _find(w, args["element"], args.get("control_type"))
        before = _describe_element(el)
        if not before["enabled"]:
            raise ToolExecutionError(f"'{before['name']}' está desativado.")
        try:
            toggle_before = el.get_toggle_state() if before["type"] == "CheckBox" else None
        except Exception:
            toggle_before = None
        try:
            el.invoke()
            method = "invoke"
        except Exception:
            try:
                el.select()
                method = "select"
            except Exception:
                el.click_input()
                method = "click_input"
        time.sleep(0.6)
        verified: bool | None = None
        if toggle_before is not None:
            try:
                verified = el.get_toggle_state() != toggle_before
            except Exception:
                verified = None
        return {"element": before, "method": method, "verified": verified}

    res = await asyncio.to_thread(work)
    return ToolResult(True, f"Acionei '{res['element']['name']}'.", res, verified=res["verified"])


@tool("ui_type", "Digitar em campo (UIA)",
      "ACT + VERIFY: escreve texto em um campo de edição e confere o valor resultante.", L.IMPORTANT, "automation",
      [ToolParam("window", "string", "Parte do título da janela", max_length=200),
       ToolParam("text", "string", "Texto a digitar", max_length=2000),
       ToolParam("element", "string", "Nome do campo (vazio = primeiro campo de edição)", required=False,
                 max_length=200)],
      describe=lambda a: f"Digitar texto na janela '{a.get('window')}'", platforms=("win32",),
      requires_setting=SETTING)
async def ui_type(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    def work() -> bool:
        w = _window(args["window"])
        if args.get("element"):
            el = _find(w, args["element"], "Edit")
        else:
            edits = [e for e in w.descendants() if e.element_info.control_type == "Edit"]
            if not edits:
                raise ToolExecutionError("Não há campo de edição nessa janela.")
            el = edits[0]
        el.set_edit_text(args["text"])
        time.sleep(0.3)
        try:
            return args["text"] in (el.get_value() or el.window_text())
        except Exception:
            return False

    verified = await asyncio.to_thread(work)
    return ToolResult(True, "Texto inserido." if verified else "Texto enviado; não consegui confirmar o valor.",
                      {}, verified=verified)


TOOLS: list[Tool] = [ui_inspect, ui_click, ui_type]

