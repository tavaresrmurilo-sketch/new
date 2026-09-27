"""Real system metrics. Anything the OS cannot report is returned as None (UI shows N/A).

Sampling cadence adapts to demand: every 2 s while a UI is connected, every 15 s
otherwise (only to feed proactive alerts). Nothing here is ever simulated.
"""

from __future__ import annotations

import asyncio
import os
import sys
import time
from typing import Any, Callable

import psutil

from ..eventbus import EventBus
from ..platform.base import PlatformAdapter

GB = 1024**3
MB = 1024**2


def _system_mount() -> str:
    if sys.platform == "win32":
        return os.environ.get("SystemDrive", "C:") + "\\"
    return "/"


class SystemMonitor:
    ACTIVE_INTERVAL = 2.0
    IDLE_INTERVAL = 15.0

    def __init__(self, bus: EventBus, platform: PlatformAdapter,
                 has_clients: Callable[[], bool] = lambda: False) -> None:
        self.bus = bus
        self.platform = platform
        self.has_clients = has_clients
        self._last_net: tuple[float, int, int] | None = None
        self._last_disk: tuple[float, int, int] | None = None
        self._proc_cache: dict[int, psutil.Process] = {}
        self._task: asyncio.Task[None] | None = None
        self._tick = 0
        self.last: dict[str, Any] = {}
        self.last_processes: list[dict[str, Any]] = []
        self._gpu: dict[str, Any] | None = None
        self._gpu_ts = 0.0
        psutil.cpu_percent(interval=None)  # prime the counters

    # ------------------------------------------------------------ sampling
    def sample(self) -> dict[str, Any]:
        now = time.time()
        vm = psutil.virtual_memory()
        sw = psutil.swap_memory()
        mount = _system_mount()
        try:
            du = psutil.disk_usage(mount)
            disk: dict[str, Any] = {
                "mount": mount,
                "percent": du.percent,
                "usedGb": round(du.used / GB, 1),
                "totalGb": round(du.total / GB, 1),
                "freeGb": round(du.free / GB, 1),
            }
        except OSError:
            disk = {"mount": mount, "percent": None, "usedGb": None, "totalGb": None, "freeGb": None}

        io = None
        try:
            io = psutil.disk_io_counters()
        except (OSError, RuntimeError):
            io = None
        if io is not None:
            if self._last_disk:
                dt = max(0.001, now - self._last_disk[0])
                disk["readBps"] = max(0, int((io.read_bytes - self._last_disk[1]) / dt))
                disk["writeBps"] = max(0, int((io.write_bytes - self._last_disk[2]) / dt))
            else:
                disk["readBps"] = disk["writeBps"] = None
            self._last_disk = (now, io.read_bytes, io.write_bytes)
        else:
            disk["readBps"] = disk["writeBps"] = None

        net_io = psutil.net_io_counters()
        net: dict[str, Any] = {"totalSent": net_io.bytes_sent, "totalRecv": net_io.bytes_recv}
        if self._last_net:
            dt = max(0.001, now - self._last_net[0])
            net["upBps"] = max(0, int((net_io.bytes_sent - self._last_net[1]) / dt))
            net["downBps"] = max(0, int((net_io.bytes_recv - self._last_net[2]) / dt))
        else:
            net["upBps"] = net["downBps"] = None
        self._last_net = (now, net_io.bytes_sent, net_io.bytes_recv)
        try:
            stats = psutil.net_if_stats()
            up = [n for n, s in stats.items() if s.isup and not n.lower().startswith(("lo", "loopback"))]
            net["connected"] = bool(up)
            net["interfaces"] = len(up)
        except OSError:
            net["connected"] = None
            net["interfaces"] = None

        battery = None
        try:
            b = psutil.sensors_battery()
        except (AttributeError, RuntimeError, OSError):
            b = None
        if b is not None:
            secs = b.secsleft if isinstance(b.secsleft, int) and b.secsleft >= 0 else None
            battery = {"percent": round(b.percent, 1), "plugged": b.power_plugged, "secsLeft": secs}

        cpu_freq = None
        try:
            f = psutil.cpu_freq()
            cpu_freq = round(f.current) if f and f.current else None
        except (OSError, NotImplementedError, AttributeError):
            cpu_freq = None

        now_gpu = time.time()
        if now_gpu - self._gpu_ts > 10:
            self._gpu_ts = now_gpu
            try:
                self._gpu = self.platform.gpu_metrics()
            except Exception:
                self._gpu = None

        temps = self._temperatures()
        if self._gpu and self._gpu.get("temperatureC") is not None:
            temps["gpuC"] = self._gpu["temperatureC"]

        active = None
        try:
            w = self.platform.active_window()
            if w:
                active = {"title": w.title[:200], "process": w.process, "pid": w.pid}
        except Exception:
            active = None

        snapshot = {
            "ts": now,
            "cpu": {
                "percent": psutil.cpu_percent(interval=None),
                "perCore": psutil.cpu_percent(interval=None, percpu=True),
                "count": psutil.cpu_count(logical=True),
                "freqMhz": cpu_freq,
            },
            "memory": {
                "percent": vm.percent,
                "usedGb": round((vm.total - vm.available) / GB, 1),
                "totalGb": round(vm.total / GB, 1),
                "availableGb": round(vm.available / GB, 1),
            },
            "swap": {"percent": sw.percent, "usedGb": round(sw.used / GB, 1), "totalGb": round(sw.total / GB, 1)},
            "disk": disk,
            "network": net,
            "battery": battery,
            "gpu": self._gpu,
            "temperatures": temps,
            "uptimeS": int(now - psutil.boot_time()),
            "processCount": len(psutil.pids()),
            "activeWindow": active,
        }
        self.last = snapshot
        return snapshot

    def _temperatures(self) -> dict[str, Any]:
        out: dict[str, Any] = {"cpuC": None, "gpuC": None}
        reader = getattr(psutil, "sensors_temperatures", None)
        if reader is None:
            return out
        try:
            temps = reader()
        except (OSError, RuntimeError):
            return out
        for key in ("coretemp", "k10temp", "zenpower", "cpu_thermal", "acpitz"):
            entries = temps.get(key)
            if entries:
                vals = [e.current for e in entries if e.current]
                if vals:
                    out["cpuC"] = round(max(vals), 1)
                    break
        return out

    def top_processes(self, sort: str = "memory", limit: int = 10) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        seen: set[int] = set()
        total_mem = psutil.virtual_memory().total
        ncpu = psutil.cpu_count(logical=True) or 1
        for proc in psutil.process_iter(["pid", "name", "memory_info", "username"]):
            pid = proc.info["pid"]
            seen.add(pid)
            cached = self._proc_cache.get(pid)
            if cached is None:
                self._proc_cache[pid] = proc
                cached = proc
            try:
                cpu = cached.cpu_percent(interval=None) / ncpu
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue
            mem = proc.info.get("memory_info")
            if mem is None or pid == 0:
                continue
            name = proc.info.get("name") or f"pid {pid}"
            if name.lower() in ("system idle process", "idle"):
                continue
            rows.append({
                "pid": pid,
                "name": name,
                "cpu": round(cpu, 1),
                "memoryMb": round(mem.rss / MB, 1),
                "memoryPercent": round(mem.rss / total_mem * 100, 2),
            })
        for pid in list(self._proc_cache):
            if pid not in seen:
                self._proc_cache.pop(pid, None)
        key = "cpu" if sort == "cpu" else "memoryMb"
        rows.sort(key=lambda r: r[key], reverse=True)
        return rows[: max(1, min(limit, 200))]

    @staticmethod
    def aggregate_by_name(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Group processes by executable name (Chrome spawns dozens of processes)."""
        groups: dict[str, dict[str, Any]] = {}
        for r in rows:
            g = groups.setdefault(r["name"].lower(), {"name": r["name"], "count": 0, "cpu": 0.0, "memoryMb": 0.0,
                                                      "pids": []})
            g["count"] += 1
            g["cpu"] = round(g["cpu"] + r["cpu"], 1)
            g["memoryMb"] = round(g["memoryMb"] + r["memoryMb"], 1)
            g["pids"].append(r["pid"])
        return sorted(groups.values(), key=lambda g: g["memoryMb"], reverse=True)

    # ---------------------------------------------------------------- loop
    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run(), name="system-monitor")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    async def _run(self) -> None:
        while True:
            active = self.has_clients()
            try:
                snap = await asyncio.to_thread(self.sample)
                await self.bus.publish("system.metrics", snap)
                if active and self._tick % 3 == 0:
                    procs = await asyncio.to_thread(self.top_processes, "memory", 200)
                    self.last_processes = procs
                    grouped = self.aggregate_by_name(procs)[:8]
                    await self.bus.publish("system.processes", {"top": grouped, "ts": time.time()})
            except Exception:  # never let the monitor die
                pass
            self._tick += 1
            await asyncio.sleep(self.ACTIVE_INTERVAL if active else self.IDLE_INTERVAL)
