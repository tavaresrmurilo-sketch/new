# ARCHITECTURE — J.A.R.V.I.S.

## Visão geral

```
┌──────────────────────────── Electron (app/) ─────────────────────────────┐
│ main.ts: supervisor do engine · janelas (HUD, mini, paleta) · bandeja    │
│          atalhos globais · desktopCapturer · IPC validado · login item   │
│ preload.ts: API mínima (window.jarvis) via contextBridge                 │
│ renderer (React, sandbox): runtime → JarvisClient (WS) → store (zustand) │
│   áudio: AudioWorklet 16 kHz → VAD → frames binários │ TTS player        │
│   HUD: JarvisCore (canvas) · rails · transcrição · módulos · diálogos    │
└───────────────┬──────────────────────────────────────────────────────────┘
                │ ws://127.0.0.1:<porta aleatória>/ws  (token por execução)
┌───────────────▼──────────────── Jarvis Engine (engine/) ─────────────────┐
│ server.py   FastAPI + WebSocket · Origin allowlist · RPC tipado           │
│ EventBus ──► ClientHub (broadcast de eventos, ClientBridge RPC reverso)   │
│ JarvisCore  ─► IntentRouter (regras pt-BR/en, offline, contexto)          │
│             ─► ActionPlanner (planos compostos e verificados)             │
│             ─► agent loop LLM (tool calling, streaming) ─► ProviderRouter │
│ ActionExecutor: validar → PermissionManager → executar → observar →      │
│                 verificar → registrar (Activity) → atualizar contexto     │
│ ToolRegistry (62 tools) · TaskManager · ContextManager · MemoryManager    │
│ SystemMonitor · AppRegistry · FileIndex (FTS5) · TerminalManager seguro  │
│ ReminderEngine · Notifier/proativo · HistoryStore · VoiceService          │
│ PlatformAdapter: WindowsAdapter (ctypes, Core Audio, PowerShell, UIA) /  │
│                  PosixAdapter / RecordingAdapter (sandbox de testes)      │
│ SQLite (WAL) em %APPDATA%\Jarvis\data\jarvis.db                           │
└───────────────────────────────────────────────────────────────────────────┘
```

Por que **Electron + Python**: Electron dá bandeja, atalhos globais, captura de tela, notificações nativas e o pipeline de áudio do Chromium (AEC, `setSinkId`, AudioWorklet) sem código nativo; Python dá o ecossistema de IA local (faster-whisper, Piper, openWakeWord, psutil, pycaw, pywinauto). Tauri foi considerado, mas exigiria reimplementar em Rust boa parte do que o Chromium já oferece para voz. Nenhum provider comercial é necessário para abrir ou usar o Jarvis.

## Fluxo de um comando

```
voz/texto ─► command.received ─► IntentRouter.route()
   ├─ wake / cancel / confirm / reply           (instantâneo)
   ├─ tool     ─► ActionExecutor.execute()
   ├─ plan     ─► ActionPlanner (várias chamadas ao executor; tarefas visíveis)
   ├─ sequence ─► TaskManager (uma etapa por parte: “abra X e depois Y”)
   └─ llm      ─► agent loop: stream(messages, tools) → tool_calls → executor → tool results → … → resposta
                  (máx. N etapas; modelos sem tools caem para chat simples)
resposta ─► ai.delta (streaming) / ai.response ─► TTS por frase ─► follow-up
```

`jarvis.state` publica IDLE/THINKING/EXECUTING/ERROR; LISTENING/SPEAKING vêm do pipeline de áudio. O renderer combina os dois (`displayState`).

## Componentes do engine

| Componente | Arquivo | Responsabilidade |
|---|---|---|
| JarvisCore | `core/jarvis.py` | orquestra o fluxo, agent loop LLM, respostas, estados, cancelamento |
| IntentRouter | `core/intents.py` | entendimento determinístico (regras sobre texto “dobrado” sem acentos, preservando spans do original) |
| ContextManager | `core/context.py` | memória de curto prazo, entidades (app, pasta, arquivos, projeto, nota…), resolução de “ele”, “o mais recente”, “nessa pasta” |
| ActionPlanner | `core/planner.py` | planos: abrir alvo (app/site/pasta), busca com escopo, rodar projeto (9 etapas), renomear/mover/copiar/apagar com resolução de referência |
| ActionExecutor | `core/executor.py` | único caminho que executa ferramentas |
| PermissionManager | `core/permissions.py` | políticas por nível/ferramenta, pedidos de confirmação com timeout |
| TaskManager | `core/tasks.py` | tarefas com etapas pending/running/completed/failed/cancelled/skipped, persistidas |
| ToolRegistry | `tools/` | catálogo (ver TOOLS.md) |
| ProviderRouter | `providers/router.py` | Ollama/OpenAI/Anthropic/Gemini, saúde, consentimento externo, visão |
| MemoryManager | `services/memory.py` | memória de longo prazo explícita (FTS5), categorias |
| SystemMonitor | `services/system_monitor.py` | métricas reais (psutil, nvidia-smi / contadores do Windows), cadência adaptativa |
| AppRegistry | `services/app_registry.py` | Menu Iniciar, Get-StartApps (UWP), App Paths, Program Files, aliases naturais |
| FileIndex | `services/file_index.py` | índice incremental (mark-and-sweep por diretório), conteúdo de texto/PDF/DOCX, projetos |
| TerminalManager | `services/terminal.py` | comandos classificados, streaming de saída, portas, cancelamento da árvore |
| VoiceService | `voice/` | STT, wake word, TTS em streaming, interrupção |
| Notifier | `services/notifier.py` | notificações + assistência proativa com sustentação e cooldown |
| EventBus | `eventbus.py` | pub/sub interno (`tool.started`, `task.updated`, `system.metrics`, …) |

## Memória

| Camada | Onde | Conteúdo |
|---|---|---|
| Curto prazo | ContextManager (RAM) | últimas 16 falas, entidades recentes |
| Sessão | ContextManager + `tasks`/`activity_logs` | ações e tarefas desde que o engine iniciou |
| Longo prazo | `memories` (+ FTS5) | só o que o usuário pediu (“lembre que…”) |
| Tarefas | `memories` categoria `task`/`project`, `tasks`, `task_steps` | projetos e tarefas |
| Preferências | `memories` categoria `preference` + `settings` | preferências explícitas |

## Banco de dados (SQLite, WAL, migrações versionadas)

`users, settings, memories(+fts), conversations, messages, tasks, task_steps, notes(+fts), reminders, permissions, tools (estatísticas de uso), activity_logs, app_registry, files(+fts)`.

## Protocolo WebSocket

- Cliente → engine: `auth` (primeira mensagem, ≤ 5 s), `command`, `rpc {id, method, params}`, `permission.respond`, `client.response`, `voice.interrupt`, `voice.speech_ended`, `ping`; frames binários `[u32 len][JSON header][PCM16]` com `kind: utterance|frame`.
- Engine → cliente: `hello {snapshot}`, `event {event, data}`, `rpc.result`, `client.request {op}` (notificação, clipboard, captura), `voice.say`, `voice.say_end`, `voice.capture`; frames binários `kind: tts` (WAV).
- Reconexão com backoff exponencial + jitter (0,4 s → 8 s); cada reconexão recebe um snapshot completo. Nada é consultado por polling.

## Janelas e modos

| Modo | Janelas | Voz |
|---|---|---|
| HUD completo | principal visível | ativa |
| Mini | principal oculta (continua ouvindo) + widget flutuante sempre no topo | ativa |
| Segundo plano | todas ocultas, bandeja | conforme configurações |
| Somente voz | todas ocultas; força microfone e respostas faladas | ativa |

Paleta de comandos: janela própria (`Ctrl+Espaço`), some ao perder o foco.

## Performance

- Núcleo em Canvas 2D com sprites pré-renderizados e blending aditivo; ~0,7–1,1 ms por quadro medidos em 1080p/1440p (`window.__jarvisCore.frameMs`); ~30 fps em IDLE, 60 fps ativo, pausa com a janela oculta; movimento reduzido cai para 4 fps sem rotação.
- React não re-renderiza por quadro: o núcleo assina o store imperativamente.
- Métricas a cada 2 s com interface conectada, 15 s sem interface; lista de processos a cada 6 s; GPU (contadores do Windows) no máximo a cada 10 s.
- Índice de arquivos em thread, incremental, a cada 30 min; STT só quando há fala.

## Futuro: painel web (Jarvis Remote)

O renderer é uma SPA estática (`vite build`, `base: "./"`) que já funciona fora do Electron (`lib/bridge.ts` tem fallback web) — compatível com hospedagem estática (ex.: Vercel). **O engine nunca deve ser exposto à internet** (ele recusa bind fora de loopback). Um Remote seguro deve usar um relay com saída apenas do PC (ex.: canal realtime autenticado, somente leitura de snapshots: tarefas, status, notificações, notas), com pareamento explícito e criptografia ponta a ponta. Nada disso está ativo nesta versão; não há botão para isso na interface.
