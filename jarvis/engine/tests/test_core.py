"""End-to-end through JarvisCore with the fake platform (real DB, index, planner, executor)."""

import asyncio
from pathlib import Path

from tests.conftest import approve_all


async def say(services, text: str) -> None:
    await services.core.handle(text)


async def test_wake_word(services, recorder):
    await say(services, "Jarvis.")
    assert recorder.responses()[-1] == "À disposição."


async def test_system_status_real_metrics(services, recorder):
    await say(services, "Qual é o status do sistema?")
    text = recorder.responses()[-1]
    assert "CPU em" in text and "memória em" in text
    data = recorder.named("ai.response")[-1]["data"]["snapshot"]
    assert 0 <= data["cpu"]["percent"] <= 100
    assert data["memory"]["totalGb"] > 0


async def test_open_app_uses_registry(services, recorder):
    await say(services, "Abra o Spotify")
    assert services.platform.launched == ["Spotify"]
    assert services.context.get("app")["name"] == "Spotify"


async def test_natural_aliases(services):
    await say(services, "Abra o navegador do Google")
    assert services.platform.launched[-1] == "Google Chrome"
    await say(services, "Abra a calculadora")
    assert services.platform.launched[-1] == "Calculadora"


async def test_follow_up_pronoun_volume(services, recorder):
    await say(services, "Abra o Spotify")
    await say(services, "Agora diminua ele")
    assert services.platform.app_volumes["spotify.exe"] == 60.0
    assert "Spotify" in recorder.responses()[-1]


async def test_folder_search_then_open_most_recent(services, recorder, home):
    await say(services, "Abra a pasta Downloads.")
    assert services.platform.opened[-1] == str(home / "Downloads")
    await say(services, "Procure pelo projeto da BETA.")
    files = services.context.get("files")
    assert files and files[0]["name"] == "contrato-beta.txt"
    await say(services, "Abra o mais recente.")
    assert services.platform.opened[-1] == str(home / "Downloads" / "contrato-beta.txt")


async def test_notes_flow(services, recorder):
    await say(services, "Crie uma nota chamada Teste Jarvis")
    await say(services, "Mostre minhas notas.")
    assert "Teste Jarvis" in recorder.responses()[-1]
    await say(services, "Pesquise minhas notas sobre teste")
    assert "Teste Jarvis" in recorder.responses()[-1]
    approve_all(services)
    await say(services, "Apague essa nota")
    assert services.notes.count() == 0


async def test_reminder_persists(services, recorder):
    await say(services, "Jarvis, lembre-me daqui a vinte minutos de alongar")
    rems = services.reminders.list()
    assert len(rems) == 1 and rems[0]["text"] == "Alongar"
    row = services.db.one("SELECT * FROM reminders")
    assert row["status"] == "pending"


async def test_memory_remember_recall_forget(services, recorder):
    await say(services, "Lembre que meu projeto BETA usa Node 22")
    await say(services, "O que você sabe sobre o projeto BETA?")
    assert "seu projeto BETA usa Node 22" in recorder.responses()[-1]
    approve_all(services)
    await say(services, "Esqueça o projeto BETA")
    assert services.memory.count() == 0


async def test_memory_respects_privacy_toggle(services, recorder):
    await services.settings.update({"privacy": {"memory_enabled": False}})
    await say(services, "Lembre que eu gosto de café")
    assert services.memory.count() == 0
    assert "desativada" in recorder.responses()[-1]


async def test_create_folder_in_context(services, home):
    await say(services, "Abra a pasta Documents")
    await say(services, "Crie uma pasta chamada Projetos")
    assert (home / "Documents" / "Projetos").is_dir()


async def test_destructive_requires_confirmation(services, recorder, home):
    approve_all(services)
    await say(services, "Apague o arquivo relatorio-q3.txt")
    req = recorder.named("permission.request")
    assert req and req[-1]["level"] == 3
    assert not (home / "Documents" / "relatorio-q3.txt").exists()


async def test_cancel_running_task(services, recorder):
    services.permissions.TIMEOUT_S = 30
    task = await services.core.submit("Apague o arquivo relatorio-q3.txt")
    await asyncio.sleep(0.2)
    assert services.permissions.has_pending()
    await services.core.submit("Jarvis, pare")
    await asyncio.sleep(0.1)
    assert task.done()
    assert (services.platform.home / "Documents" / "relatorio-q3.txt").exists()


async def test_sequence_runs_as_task(services, recorder):
    await say(services, "Abra o Spotify e depois aumente o volume")
    tasks = recorder.named("task.updated")
    assert tasks[-1]["status"] == "completed"
    assert services.platform.volume == 65.0


async def test_no_llm_graceful(services, recorder):
    await services.settings.update({"ai": {"ollama_host": "http://127.0.0.1:9"}})
    await say(services, "Qual é o sentido da vida?")
    text = recorder.responses()[-1]
    assert "modelo local não está disponível" in text


async def test_unknown_app_message(services, recorder):
    await say(services, "Abra o Photoshop Ultra 3000")
    assert "Não encontrei" in recorder.responses()[-1]


async def test_run_project_real_process(services, recorder, home, tmp_path):
    import shutil

    if not shutil.which("node") or not shutil.which("npm"):
        return
    proj = home / "Projects" / "projeto-beta"
    port = 43000 + (id(tmp_path) % 1000)
    (proj / "server.js").write_text(
        "require('http').createServer((q,r)=>r.end('ok')).listen(%d,()=>console.log('ready http://localhost:%d'))"
        % (port, port), "utf-8")
    (proj / "node_modules").mkdir()
    approve_all(services)
    await say(services, "Abra meu projeto BETA e coloque ele para rodar")
    task = [t for t in recorder.named("task.updated") if t["title"].startswith("Rodar projeto")][-1]
    assert task["status"] == "completed", task
    assert f"http://localhost:{port}" in services.platform.opened
    await services.terminal.stop_all()


async def test_state_transitions(services, recorder):
    await say(services, "Que horas são?")
    states = [d["state"] for d in recorder.named("jarvis.state")]
    assert states[0] == "THINKING" and states[-1] == "IDLE"


async def test_tool_events_and_activity(services, recorder):
    await say(services, "Qual processo está usando mais memória?")
    assert recorder.named("tool.started") and recorder.named("tool.completed")
    logs = services.activity.list(category="TOOLS")
    assert any("processos" in l["message"].lower() for l in logs)


async def test_history_persisted(services):
    await say(services, "Que horas são?")
    msgs = services.history.messages()
    assert [m["role"] for m in msgs[-2:]] == ["user", "assistant"]


async def test_history_disabled(services):
    await services.settings.update({"privacy": {"history_enabled": False}})
    before = services.history.count()
    await say(services, "Que horas são?")
    assert services.history.count() == before


async def test_organize_and_index_refresh(services, home, recorder):
    approve_all(services)
    await say(services, "Organize a pasta Downloads")
    assert (home / "Downloads" / "Documentos" / "contrato-beta.txt").exists()
    results = services.files.search("contrato")
    assert results and Path(results[0]["path"]).exists()
