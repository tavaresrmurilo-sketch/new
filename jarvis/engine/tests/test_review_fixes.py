"""Regression tests for issues found in code review."""

import asyncio
import sys
from pathlib import Path

import pytest

from jarvis_engine.providers.ollama import OllamaProvider
from jarvis_engine.tools.desktop_tools import normalize_url
from tests.conftest import approve_all
from tests.test_voice import feed


async def _pending_delete(services, target: Path) -> asyncio.Task:
    task = asyncio.create_task(services.executor.execute("delete_paths", {"paths": [str(target)]}))
    for _ in range(100):
        if services.permissions.has_pending():
            break
        await asyncio.sleep(0.01)
    assert services.permissions.has_pending()
    return task


async def test_open_confirmation_ignores_background_speech(services, recorder):
    services.voice.follow_up_until = 0
    target = services.platform.home / "Documents" / "relatorio-q3.txt"
    task = await _pending_delete(services, target)
    await feed(services, "abra o youtube")  # background speech without the wake word
    assert services.platform.opened == [] and services.permissions.has_pending()
    await feed(services, "ok")  # casual yes is not enough for level 3
    assert services.permissions.has_pending() and target.exists()
    assert "confirmo" in recorder.responses()[-1]
    await feed(services, "confirmo")
    res = await task
    assert res.ok and not target.exists()


async def test_voice_answers_the_request_on_screen(services):
    doc = services.platform.home / "Documents"
    first = await _pending_delete(services, doc / "relatorio-q3.txt")
    second = asyncio.create_task(services.executor.execute("delete_paths", {"paths": [str(doc / "apresentacao-escola.md")]}))
    await asyncio.sleep(0.05)
    shown = services.permissions.current()
    assert "relatorio-q3.txt" in shown.summary or "relatorio-q3.txt" in str(shown.args)
    await services.core.submit("não", "voice")
    assert not (await first).ok
    assert services.permissions.has_pending()  # the second request is untouched
    services.permissions.cancel_all()
    await second


async def test_forget_requires_every_keyword(services):
    approve_all(services)
    mm = services.memory
    mm.add("meu carro é azul", "fact")
    mm.add("meu projeto BETA usa Node 22", "project")
    res = await services.executor.execute("forget", {"query": "meu carro é azul"})
    assert res.ok and len(res.data["deleted"]) == 1
    assert [m["content"] for m in mm.list()] == ["meu projeto BETA usa Node 22"]
    res = await services.executor.execute("forget", {"query": "meu"})
    assert not res.ok and mm.count() == 1


async def test_delete_these_files_uses_the_listed_results(services):
    intent = services.core.router.route("apague esses arquivos")
    assert intent.kind == "plan" and intent.args["target"] == "esses arquivos"
    assert services.core.router.route("apague o arquivo").args["target"] == "isso"


async def test_copy_never_overwrites(services, home):
    approve_all(services)
    src = home / "Documents" / "relatorio-q3.txt"
    dest_dir = home / "Desktop"
    dest_dir.mkdir(exist_ok=True)
    (dest_dir / "relatorio-q3.txt").write_text("original")
    (dest_dir / "relatorio-q3 (cópia).txt").write_text("editada")
    res = await services.executor.execute("copy_path", {"path": str(src), "destination": str(dest_dir)})
    assert res.ok and res.data["to"].endswith("relatorio-q3 (cópia 2).txt")
    assert (dest_dir / "relatorio-q3 (cópia).txt").read_text() == "editada"


async def test_index_sweep_keeps_rows_refreshed_during_a_scan(services, home):
    fi = services.files
    new_dir = home / "Documents" / "nova"
    new_dir.mkdir()
    (new_dir / "item.txt").write_text("x")
    gen = fi._next_gen()  # a full scan starts with this generation...
    fi.refresh_dirs([new_dir])  # ...and Jarvis refreshes a folder it just changed
    conn = fi.db.conn
    stale = conn.execute("SELECT COUNT(*) FROM files WHERE seen < ? AND path LIKE ?",
                         (gen, str(new_dir) + "%")).fetchone()[0]
    assert stale == 0


async def test_long_output_lines_do_not_kill_the_pump(services, tmp_path):
    tm = services.terminal
    code = "import sys; sys.stdout.write('x' * 200000 + '\\nport 4321\\n'); sys.stdout.flush()"
    mp = await tm.start([sys.executable, "-c", code], tmp_path, "long line")
    assert await tm.wait(mp, timeout=20)
    assert mp.exit_code == 0 and 4321 in mp.ports


async def test_task_cancel_stops_the_work(services):
    tm = services.tasks
    started = asyncio.Event()

    async def work():
        task = tm.create("Longa")
        step = tm.add_step(task, "Esperar", fn=None)
        await tm.set_status(task, "running")
        await tm.set_step(task, step, "running")
        started.set()
        await asyncio.sleep(30)
        return task

    runner = asyncio.create_task(work())
    await started.wait()
    task_id = next(iter(tm.active))
    assert tm.cancel(task_id)
    with pytest.raises(asyncio.CancelledError):
        await runner


async def test_tool_timeouts(services):
    reg = services.registry
    assert reg.get("run_project").timeout_s >= 900
    assert reg.get("run_command").timeout_s > 600
    assert reg.get("system_status").timeout_s == 120


def test_remote_ollama_is_external():
    assert not OllamaProvider("http://localhost:11434").is_external
    assert not OllamaProvider("http://127.0.0.1:11434").is_external
    assert not OllamaProvider("http://[::1]:11434").is_external
    remote = OllamaProvider("https://gpu.example.com")
    assert remote.is_external and "remoto" in remote.label


@pytest.mark.parametrize("raw,expected", [
    ("localhost:5173", "http://localhost:5173"),
    ("meusite.com:8080/x", "https://meusite.com:8080/x"),
    ("youtube.com", "https://youtube.com"),
])
def test_normalize_url_host_port(raw, expected):
    assert normalize_url(raw) == expected


@pytest.mark.parametrize("raw", ["javascript:alert(1)", "file:///C:/x", "ms-settings:", "abc"])
def test_normalize_url_rejects(raw):
    with pytest.raises(ValueError):
        normalize_url(raw)


def test_spawn_detached_refuses_cmd_metacharacters(monkeypatch):
    from jarvis_engine.platform import base

    monkeypatch.setattr(base.sys, "platform", "win32")
    with pytest.raises(ValueError):
        base.spawn_detached([r"C:\VS Code\bin\code.cmd", r"C:\Users\x\demo&calc"])


async def test_stop_does_not_steal_the_exit_status(services, tmp_path):
    # kill_tree must not waitpid() our own child, or Process.wait() hangs (uvloop / child watchers).
    tm = services.terminal
    code = "import time; print('ready', flush=True); time.sleep(60)"
    mp = await tm.start([sys.executable, "-c", code], tmp_path, "sleeper", long_running=True)
    await asyncio.sleep(0.5)
    assert await tm.stop(mp.id)
    assert await tm.wait(mp, timeout=10)
    assert mp.status == "killed" and mp.exit_code is not None
