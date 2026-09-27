"""System observation tools (level 0) and process control."""

from __future__ import annotations

import asyncio
import os
import platform as pyplatform
import time
from datetime import datetime
from typing import Any

import psutil

from ..core import fmt
from ..security import is_critical_process
from ..services.terminal import kill_tree, listening_ports
from .base import PermissionLevel as L
from .base import Tool, ToolContext, ToolParam, ToolResult, fail, ok, tool


@tool("system_status", "Status do sistema",
      "Mostra métricas reais do computador: CPU, memória, disco, rede, bateria, GPU e temperatura quando disponíveis.",
      L.READ, "system",
      [ToolParam("focus", "string", "Métrica específica", required=False,
                 enum=["all", "cpu", "memory", "disk", "network", "battery", "gpu", "temperature", "uptime"],
                 default="all")],
      describe=lambda a: "Ler métricas do sistema")
async def system_status(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    snap = await asyncio.to_thread(ctx.services.monitor.sample)
    focus = args.get("focus", "all")
    cpu, mem, disk = snap["cpu"], snap["memory"], snap["disk"]
    net, bat, gpu, temps = snap["network"], snap["battery"], snap["gpu"], snap["temperatures"]
    parts: dict[str, str] = {
        "cpu": f"CPU em {fmt.pct(cpu['percent'])}",
        "memory": f"memória em {fmt.pct(mem['percent'])} ({fmt.gb(mem['usedGb'])} de {fmt.gb(mem['totalGb'])})",
        "disk": f"disco {disk['mount']} com {fmt.gb(disk['freeGb'])} livres" if disk.get("freeGb") is not None
        else "disco: N/A",
        "network": ("rede conectada" if net.get("connected") else "rede desconectada" if net.get("connected") is False
                    else "rede: N/A") + (f", ↓ {fmt.rate(net.get('downBps'))} ↑ {fmt.rate(net.get('upBps'))}"
                                         if net.get("downBps") is not None else ""),
        "battery": (f"bateria em {fmt.pct(bat['percent'])}{', carregando' if bat['plugged'] else ''}"
                    if bat else "sem bateria detectada"),
        "gpu": f"GPU em {fmt.pct(gpu['percent'])}" if gpu and gpu.get("percent") is not None else "GPU: N/A",
        "temperature": (f"CPU a {temps['cpuC']:.0f}°C" if temps.get("cpuC") is not None else "temperatura da CPU: N/A"),
        "uptime": f"ligado há {fmt.duration(snap['uptimeS'])}",
    }
    if focus != "all":
        msg = parts[focus][0].upper() + parts[focus][1:] + "."
    else:
        keys = ["cpu", "memory", "disk"] + (["battery"] if bat else []) + (["gpu"] if gpu else []) + ["network"]
        msg = "Sistema operacional estável. " if cpu["percent"] < 85 and mem["percent"] < 90 else "Atenção: carga alta. "
        msg += fmt.join_pt([parts[k] for k in keys]) + "."
        msg = msg[0].upper() + msg[1:]
    return ok(msg, {"snapshot": snap})


@tool("list_processes", "Listar processos",
      "Lista os processos que mais usam memória ou CPU, agrupados por aplicativo.",
      L.READ, "system",
      [ToolParam("sort", "string", "Ordenar por", required=False, enum=["memory", "cpu"], default="memory"),
       ToolParam("limit", "integer", "Quantidade", required=False, default=5, minimum=1, maximum=30)],
      describe=lambda a: f"Listar processos por {'CPU' if a.get('sort') == 'cpu' else 'memória'}")
async def list_processes(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    sort = args.get("sort", "memory")
    mon = ctx.services.monitor
    if sort == "cpu":
        await asyncio.to_thread(mon.top_processes, "cpu", 300)  # prime per-process counters
        await asyncio.sleep(0.8)
    rows = await asyncio.to_thread(mon.top_processes, sort, 300)
    grouped = mon.aggregate_by_name(rows)
    if sort == "cpu":
        grouped.sort(key=lambda g: g["cpu"], reverse=True)
    top = grouped[: args.get("limit", 5)]
    if not top:
        return fail("Não consegui ler a lista de processos.")
    first = top[0]
    metric = f"{fmt.pct(first['cpu'])} de CPU" if sort == "cpu" else f"{fmt.size(first['memoryMb'] * 1024 * 1024)}"
    extra = f" em {first['count']} processos" if first["count"] > 1 else ""
    msg = f"{first['name']} é o que mais usa {'CPU' if sort == 'cpu' else 'memória'}: {metric}{extra}."
    if len(top) > 1:
        msg += " Em seguida: " + fmt.join_pt([g["name"] for g in top[1:4]]) + "."
    return ok(msg, {"processes": top, "sort": sort},
              entities={"process": {"name": first["name"], "pids": first["pids"]}})


@tool("system_info", "Informações do sistema",
      "Informações do sistema operacional, processador, memória total e tempo ligado.", L.READ, "system",
      describe=lambda a: "Ler informações do sistema")
async def system_info(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    uname = pyplatform.uname()
    vm = psutil.virtual_memory()
    info = {
        "os": f"{uname.system} {uname.release}", "version": uname.version, "machine": uname.machine,
        "processor": uname.processor or pyplatform.processor(), "cores": psutil.cpu_count(logical=False),
        "threads": psutil.cpu_count(logical=True), "ramGb": round(vm.total / 1024**3, 1),
        "hostname": uname.node, "uptimeS": int(time.time() - psutil.boot_time()),
        "python": pyplatform.python_version(),
    }
    msg = (f"{info['os']}, {info['threads']} threads, {fmt.gb(info['ramGb'])} de RAM, "
           f"ligado há {fmt.duration(info['uptimeS'])}.")
    return ok(msg, {"info": info})


@tool("active_window", "Janela ativa", "Informa qual aplicativo/janela está em primeiro plano.", L.READ, "system",
      describe=lambda a: "Ler a janela ativa")
async def active_window(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    w = await asyncio.to_thread(ctx.services.platform.active_window)
    if not w:
        return fail("Não consigo identificar a janela ativa neste sistema.")
    return ok(f"A janela ativa é '{w.title}' ({w.process}).", {"window": w.to_dict()},
              entities={"window": w.to_dict(), "app": {"name": w.process, "pid": w.pid}})


_WEEKDAYS = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"]
_MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro",
           "novembro", "dezembro"]


@tool("current_time", "Data e hora", "Informa a data e a hora atuais.", L.READ, "system",
      describe=lambda a: "Ler data e hora")
async def current_time(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    now = datetime.now()
    msg = (f"São {now.strftime('%H:%M')} de {_WEEKDAYS[now.weekday()]}, {now.day} de {_MONTHS[now.month - 1]} "
           f"de {now.year}.")
    return ok(msg, {"iso": now.isoformat()})


@tool("port_info", "Portas em uso",
      "Mostra qual processo está usando uma porta TCP, ou lista as portas abertas para conexão.", L.READ, "dev",
      [ToolParam("port", "integer", "Número da porta (vazio para listar todas)", required=False, minimum=1,
                 maximum=65535)],
      describe=lambda a: f"Verificar a porta {a['port']}" if a.get("port") else "Listar portas em uso")
async def port_info(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    ports = await asyncio.to_thread(listening_ports)
    port = args.get("port")
    if port:
        hits = [p for p in ports if p["port"] == port]
        if not hits:
            return ok(f"A porta {port} está livre.", {"ports": []})
        h = hits[0]
        who = h["process"] or (f"PID {h['pid']}" if h["pid"] else "um processo protegido do sistema")
        return ok(f"A porta {port} está sendo usada por {who}" + (f" (PID {h['pid']})." if h["pid"] else "."),
                  {"ports": hits}, entities={"process": {"name": h["process"], "pids": [h["pid"]] if h["pid"] else []}})
    if not ports:
        return ok("Não encontrei portas em escuta (ou o sistema não permitiu a leitura).", {"ports": []})
    dev = [p for p in ports if 1024 <= p["port"] < 10000][:8]
    listed = fmt.join_pt([f"{p['port']} ({p['process'] or '?'})" for p in (dev or ports[:8])])
    return ok(f"{len(ports)} portas em escuta. Principais: {listed}.", {"ports": ports})


def _kill_level(args: dict[str, Any]) -> L:
    return L.DESTRUCTIVE if args.get("force") else L.IMPORTANT


@tool("kill_process", "Encerrar processo",
      "Encerra um processo pelo PID ou nome. Sem 'force', pede para o programa fechar normalmente.",
      L.IMPORTANT, "system",
      [ToolParam("pid", "integer", "PID do processo", required=False, minimum=1),
       ToolParam("name", "string", "Nome do executável (ex.: node.exe)", required=False, max_length=120),
       ToolParam("force", "boolean", "Forçar encerramento imediato (pode perder dados)", required=False,
                 default=False)],
      dynamic_level=_kill_level,
      describe=lambda a: ("Forçar encerramento" if a.get("force") else "Encerrar") +
                         f" do processo {a.get('name') or a.get('pid')}")
async def kill_process(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    targets: list[psutil.Process] = []
    if args.get("pid"):
        try:
            targets.append(psutil.Process(args["pid"]))
        except psutil.NoSuchProcess:
            return fail(f"Não existe processo com PID {args['pid']}.")
    elif args.get("name"):
        wanted = args["name"].lower()
        for p in psutil.process_iter(["name"]):
            n = (p.info.get("name") or "").lower()
            if n == wanted or n == wanted + ".exe":
                targets.append(p)
    else:
        return fail("Informe o PID ou o nome do processo.")
    if not targets:
        return fail(f"Nenhum processo chamado {args.get('name')} está em execução.")
    names = {t.name() for t in targets if t.is_running()}
    if any(is_critical_process(n) for n in names):
        return fail("Esse é um processo crítico do sistema; não vou encerrá-lo.")
    if any(t.pid == os.getpid() for t in targets):
        return fail("Não vou encerrar o próprio Jarvis por aqui. Use 'Sair' na bandeja.")
    for t in targets:
        if args.get("force"):
            await asyncio.to_thread(kill_tree, t.pid, 2.0)
        else:
            try:
                await asyncio.to_thread(ctx.services.platform.close_process_gracefully, t.pid)
            except Exception:
                pass
    await asyncio.sleep(2.5)
    alive = [t for t in targets if t.is_running()]
    if alive:
        return ToolResult(False, f"{len(alive)} processo(s) ainda aberto(s). Posso forçar o encerramento se quiser.",
                          {"alive": [t.pid for t in alive]}, "still_running", verified=False)
    return ok(f"Processo {', '.join(sorted(names))} encerrado.", {"pids": [t.pid for t in targets]}, verified=True)


TOOLS: list[Tool] = [system_status, list_processes, system_info, active_window, current_time, port_info,
                     kill_process]
