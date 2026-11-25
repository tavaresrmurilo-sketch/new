# DEVELOPMENT — como desenvolver o Jarvis

## Estrutura

```
jarvis/
├── setup.cmd  dev.cmd  start.cmd  build.cmd  test.cmd
├── .env.example            → copie para .env.local (chaves opcionais)
├── engine/                 → Python 3.10+ (FastAPI, WebSocket, agente, ferramentas, voz)
│   ├── jarvis_engine/
│   │   ├── core/           → JarvisCore, IntentRouter, Planner, Executor, Permissions, Tasks, Context
│   │   ├── tools/          → uma Tool por capacidade (ver TOOLS.md)
│   │   ├── services/       → monitor, apps, índice de arquivos, terminal, memória, notas, lembretes, hub…
│   │   ├── providers/      → Ollama, OpenAI, Anthropic, Gemini + router
│   │   ├── voice/          → STT, TTS, wake word, VoiceService
│   │   └── platform/       → WindowsAdapter, PosixAdapter, RecordingAdapter (sandbox)
│   └── tests/              → pytest (188 testes)
└── app/                    → Electron + React + TypeScript + Vite
    ├── electron/           → main.ts, preload.ts, backend.ts, prefs.ts
    ├── src/                → runtime, lib/, state/, audio/, core/ (renderer do núcleo), components/, views/
    ├── public/pcm-worklet.js
    └── tests/              → unit (vitest) e e2e (Playwright)
```

## Primeiros passos (Windows)

```bat
setup.cmd     :: venv + dependências Python + voz local + npm install + build
dev.cmd       :: Vite (HMR) + esbuild watch + Electron apontando para o dev server
```

O Electron inicia o engine sozinho (`engine/.venv/Scripts/python.exe -m jarvis_engine`) em uma porta livre de 127.0.0.1, com token novo a cada execução. Logs: `%APPDATA%\jarvis-desktop\logs\engine-process.log` e `%APPDATA%\jarvis-desktop\data\logs\engine.jsonl`.

## Rodando partes isoladas

```bat
:: engine sozinho (imprime um token de desenvolvimento)
cd engine
.venv\Scripts\python -m jarvis_engine

:: renderer no navegador, conectado a esse engine
cd app
npx vite
:: abra http://127.0.0.1:5173/?engine=ws://127.0.0.1:8765/ws&token=<token>#/hud
```

Variáveis úteis: `JARVIS_PORT`, `JARVIS_TOKEN`, `JARVIS_DATA_DIR`, `JARVIS_DEV=1`, `JARVIS_SANDBOX_LOG=<arquivo>` (registra ações em vez de executá-las — usado pelos testes E2E), `JARVIS_ALLOWED_ORIGINS`.

## Testes

```bat
test.cmd        :: pytest + tsc + vitest + auditoria de botões + Playwright E2E
```

| Suíte | Onde | O que cobre |
|---|---|---|
| pytest (188) | `engine/tests` | parser de tempo, roteamento de intenções (45 frases), permissões e segurança de caminhos/comandos, fluxo completo pelo core com plataforma falsa, agent loop contra um Ollama falso por HTTP real, parsers de streaming OpenAI/Anthropic/Gemini, protocolo WebSocket (auth, origem, RPC, reconexão), índice de arquivos, terminal, voz (wake word, continuação, privacidade, confirmação por voz, openWakeWord real com áudio sintetizado), regressões do code review |
| vitest (15) | `app/tests/unit` | VAD, frames binários, store (streaming, ferramentas, histórico limitado, estados) |
| Playwright (13) | `app/tests/e2e` | onboarding + inicialização honesta, comandos, métricas reais, persistência de configurações, confirmação nível 3, tarefa composta real (npm run dev → porta → HTTP → URL), memória/notas/lembretes, app registry, erros, teclado, **zero botões mortos**, reconexão do WebSocket |
| auditoria estática | `app/scripts/audit-buttons.mjs` | todo `<button>` tem handler e nome acessível |

Os E2E sobem um engine real com HOME isolado e `JARVIS_SANDBOX_LOG`, então nada é aberto de verdade no seu computador.

## Adicionando uma ferramenta

```python
# engine/jarvis_engine/tools/minhas_tools.py
from .base import PermissionLevel as L, ToolParam, ok, tool

@tool("contar_palavras", "Contar palavras", "Conta as palavras de um texto.", L.READ, "notes",
      [ToolParam("texto", "string", "Texto a analisar", max_length=20000)],
      describe=lambda a: "Contar palavras")
async def contar_palavras(args, ctx):
    n = len(args["texto"].split())
    return ok(f"{n} palavras.", {"count": n})

TOOLS = [contar_palavras]
```

Registre em `tools/__init__.py`. A ferramenta passa automaticamente a: ser oferecida ao LLM (JSON Schema gerado dos parâmetros), ter validação de tipos/enum/limites, aparecer em Configurações › Permissões, ser registrada na Atividade e emitir `tool.started/completed/failed`. Para comandos de voz frequentes, adicione uma regra em `core/intents.py` e um caso em `tests/test_intents.py`.

Regras: nunca chame `subprocess` com shell; caminhos de escrita passam por `security.check_write`; leituras por `check_read`; ações que alteram o sistema são nível ≥ 2; efeitos colaterais do SO passam pelo `PlatformAdapter`.

## Build

```bat
build.cmd
```

1. PyInstaller empacota o engine em `engine\dist\jarvis-engine\` (onedir, sem Python no destino).
2. `npm run build` (typecheck + Vite + esbuild).
3. electron-builder gera `app\release\Jarvis-1.0.0-win-x64.exe` (NSIS, instalação por usuário) e a versão portátil. O executável não é assinado digitalmente; o SmartScreen pode avisar na primeira execução.

Verificado neste repositório (Linux): o binário PyInstaller do engine sobe e responde `/health`, e o app empacotado pelo electron-builder inicia o engine embutido e conecta em ~1 s. O build Windows precisa ser executado em uma máquina Windows (PyInstaller não faz cross-compile).

## Convenções

- Python: tipagem em tudo, mensagens ao usuário em pt-BR, erros esperados via `ToolExecutionError`/`fail()`.
- TypeScript estrito (`noUnusedLocals`, `noUnusedParameters`); cores/espaços/tipos/durações só via tokens (`src/styles/tokens.css`).
- Animações só em `transform`/`opacity`/`filter`; toda animação respeita movimento reduzido.
