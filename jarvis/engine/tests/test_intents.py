import pytest


@pytest.mark.parametrize("text,kind,target,args", [
    ("Jarvis.", "wake", "", {}),
    ("Jarvis, qual é o status do sistema?", "tool", "system_status", {"focus": "all"}),
    ("Qual o uso da CPU?", "tool", "system_status", {"focus": "cpu"}),
    ("Qual aplicativo está usando mais memória?", "tool", "list_processes", {"sort": "memory"}),
    ("Qual processo está usando a porta 3000?", "tool", "port_info", {"port": 3000}),
    ("Abra o Spotify.", "plan", "open_target", {"name": "Spotify"}),
    ("Abra o navegador", "tool", "open_browser", {}),
    ("Abra a pasta Downloads", "tool", "open_folder", {"name": "Downloads"}),
    ("Crie uma pasta chamada Projetos", "tool", "create_folder", {"name": "Projetos"}),
    ("Crie uma nota chamada Teste Jarvis", "tool", "create_note", {"title": "Teste Jarvis"}),
    ("Anote que preciso terminar o projeto amanhã", "tool", "create_note",
     {"content": "preciso terminar o projeto amanhã"}),
    ("Mostre minhas notas.", "tool", "list_notes", {}),
    ("Pesquise minhas notas sobre BETA", "tool", "search_notes", {"query": "BETA"}),
    ("Lembre-me amanhã às 15h de ligar", "tool", "create_reminder", {}),
    ("Lembre que meu aniversário é em maio", "tool", "remember", {"content": "meu aniversário é em maio"}),
    ("Esqueça meu aniversário", "tool", "forget", {"query": "meu aniversário"}),
    ("O que você sabe sobre meu projeto X?", "tool", "recall", {"query": "meu projeto X"}),
    ("Jarvis, o que tenho para fazer hoje?", "tool", "agenda_today", {}),
    ("Leia essa tela", "tool", "screen_analysis", {}),
    ("Jarvis, olha esse erro", "tool", "screen_analysis", {}),
    ("Feche o Spotify", "tool", "close_application", {"name": "Spotify"}),
    ("Coloque o computador no modo foco", "tool", "focus_mode", {"enabled": True}),
    ("Aumente o volume", "tool", "set_volume", {"delta": 15}),
    ("Volume em cinquenta", "tool", "set_volume", {"level": 50}),
    ("Agora diminua ele", "plan", "adjust_referenced", {"direction": -1}),
    ("Execute os testes", "tool", "run_command", {"command": "run_tests"}),
    ("Explique por que o build falhou", "tool", "explain_error", {}),
    ("Mostre os erros", "tool", "terminal_output", {"errors_only": True}),
    ("Abra meu projeto BETA e coloque ele para rodar", "plan", "run_project", {"project": "BETA"}),
    ("Abra meu projeto da BETA", "plan", "open_project", {"project": "BETA"}),
    ("Procure meus projetos", "tool", "find_projects", {}),
    ("Procure minha apresentação da escola", "tool", "search_files", {"query": "escola"}),
    ("Qual PDF modifiquei ontem?", "tool", "search_files", {"extensions": ["pdf"], "modified": "yesterday"}),
    ("Abra o mais recente", "plan", "open_from_results", {}),
    ("Organize a pasta Downloads", "tool", "organize_folder", {"folder": "Downloads"}),
    ("Resuma esse documento", "plan", "summarize", {}),
    ("Pesquise receitas de bolo no google", "tool", "web_search", {"query": "receitas de bolo"}),
    ("Abra youtube.com", "tool", "open_url", {"url": "youtube.com"}),
    ("Jarvis, pare.", "cancel", "", {}),
    ("Cancelar", "cancel", "", {}),
    ("Esquece", "cancel", "", {}),
    ("Abra as configurações de bluetooth", "tool", "open_system_settings", {"page": "bluetooth"}),
    ("Bloqueie o computador", "tool", "lock_computer", {}),
    ("Pause a música", "tool", "media_control", {"action": "play_pause"}),
    ("Qual é o sentido da vida?", "llm", "", {}),
])
async def test_route(services, text, kind, target, args):
    intent = services.core.router.route(text)
    assert intent.kind == kind, intent.describe()
    if kind == "tool":
        assert intent.tool_id == target
    elif kind == "plan":
        assert intent.plan == target
    for k, v in args.items():
        assert intent.args.get(k) == v, (k, intent.args)


async def test_reminder_keeps_original_text(services):
    intent = services.core.router.route("Jarvis, lembre-me amanhã às 15h de ligar para o João")
    assert intent.tool_id == "create_reminder"
    assert "João" in intent.args["text"]


async def test_sequence_split(services):
    intent = services.core.router.route("Abra o Spotify e depois aumente o volume")
    assert intent.kind == "sequence"
    assert [p.plan or p.tool_id for p in intent.parts] == ["open_target", "set_volume"]


async def test_confirmation_only_when_pending(services):
    assert services.core.router.route("sim").kind != "confirm"


async def test_vscode_here_uses_context(services, home):
    services.context.remember({"folder": {"path": str(home / "Projects"), "name": "Projects"}})
    intent = services.core.router.route("Abra o VS Code nessa pasta")
    assert intent.tool_id == "open_in_vscode"
    assert intent.args["path"] == str(home / "Projects")
