import os
import time
from pathlib import Path

from jarvis_engine.services.terminal import TerminalManager, detect_package_manager, project_scripts


async def test_index_finds_by_name_content_and_project(services, home):
    fi = services.files
    assert fi.status.files > 0
    names = [r["name"] for r in fi.search("escola")]
    assert "apresentacao-escola.md" in names
    content_hits = fi.search("fotossíntese")
    assert content_hits and content_hits[0]["name"] == "apresentacao-escola.md"
    projects = [r["name"] for r in fi.projects()]
    assert {"projeto-beta", "site-alpha"} <= set(projects)


async def test_substring_name_match(services, home):
    (home / "Documents" / "ProjetoBETAFinal.pptx").write_bytes(b"x")
    services.files.refresh_dirs([home / "Documents"], depth=0)
    assert services.files.search("beta", exts=["pptx"])[0]["name"] == "ProjetoBETAFinal.pptx"


async def test_incremental_sweep(services, home):
    target = home / "Documents" / "relatorio-q3.txt"
    target.unlink()
    new = home / "Documents" / "novo.md"
    new.write_text("conteúdo novo", "utf-8")
    services.files.scan()
    names = {r["name"] for r in services.files.search("", limit=200)}
    assert "relatorio-q3.txt" not in names and "novo.md" in names


async def test_date_filter(services, home):
    old = home / "Downloads" / "contrato-beta.txt"
    yesterday = time.time() - 86400
    os.utime(old, (yesterday, yesterday))
    services.files.scan()
    from jarvis_engine.tools.file_tools import date_range

    after, before = date_range("ontem")
    hits = services.files.search("", modified_after=after, modified_before=before)
    assert [h["name"] for h in hits] == ["contrato-beta.txt"]


async def test_excluded_dirs(services, home):
    nm = home / "Projects" / "projeto-beta" / "node_modules" / "lib"
    nm.mkdir(parents=True)
    (nm / "secret-lib.js").write_text("x")
    services.files.scan()
    assert services.files.search("secret") == []


def test_terminal_classification(home, tmp_path):
    from jarvis_engine.activity import ActivityLog
    from jarvis_engine.db import Database
    from jarvis_engine.eventbus import EventBus

    bus = EventBus()
    tm = TerminalManager(bus, ActivityLog(Database(":memory:"), bus))
    proj = home / "Projects" / "projeto-beta"
    assert project_scripts(proj) == {"dev": "node server.js", "test": "node test.js"}
    assert detect_package_manager(proj) == "npm"
    (proj / "pnpm-lock.yaml").write_text("")
    assert detect_package_manager(proj) == "pnpm"
    import pytest

    with pytest.raises(ValueError):
        tm.build("run_script", proj, {"script": "deploy"})  # not in package.json
    with pytest.raises(ValueError):
        tm.build("rm_everything", proj, {})
    with pytest.raises(ValueError):
        tm.build("run_script", Path("/definitely/missing"), {"script": "dev"})


async def test_terminal_runs_and_cancels(services, home):
    import shutil
    import sys

    tm = services.terminal
    mp = await tm.start([sys.executable, "-c", "print('hello'); import time; time.sleep(30)"], home, "py sleep",
                        long_running=True)
    for _ in range(50):
        if mp.output:
            break
        import asyncio

        await asyncio.sleep(0.05)
    assert "hello" in list(mp.output)
    assert await tm.stop(mp.id)
    assert await tm.wait(mp, timeout=5)
    assert mp.status == "killed"
    assert shutil.which("python3") or True
