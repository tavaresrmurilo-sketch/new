# PLUGIN_USAGE — skills e plugins usados na construção

O pedido listava vários plugins e skills. Antes de construir, verifiquei o que estava **realmente disponível** neste ambiente. Nada abaixo foi fingido: o que não estava instalado ou acessível está marcado assim, com o que foi feito no lugar.

## Usados

| Plugin / skill | Onde foi usado | Como | Resultado |
|---|---|---|---|
| **frontend-design** (skill) | Fases 3–4: design system e HUD (`app/src/styles/tokens.css`, `hud.css`, componentes) | Direção visual antes do código: HUD tático original (sem assets dos filmes), tipografia Saira variável (eixo de largura + números tabulares), paleta ciano/âmbar sobre preto azulado, hierarquia por brilho e não por caixas, núcleo procedural em canvas | Interface fora do padrão "SaaS genérico", tokens únicos para cor/espaço/tipo/duração, validada em 1366×768, 1920×1080 e 2560×1440 |
| **security-review** (skill) | Fase 16: revisão de segurança do branch | Um agente identificou vulnerabilidades; agentes separados, em paralelo, filtraram falsos positivos com as regras da skill; corte de confiança ≥ 8 | Nenhum achado acima do corte. Dois pontos reforçados mesmo assim (`open_path`, scripts do `package.json`) e IPC do Electron restrito. Detalhes em [SECURITY.md](SECURITY.md#revisão-de-segurança-desta-versão) |
| **code-review** (skill) | Fase 17: revisão de correção do branch | Revisão de todo o engine e do app com cenários concretos de falha | 15 achados, todos verificados e corrigidos, com 18 testes de regressão (`engine/tests/test_review_fixes.py`). Ex.: confirmação por voz aceitando fala ambiente, timeout de 120 s cortando `npm install`, "esqueça" apagando memórias sem relação, cancelamento de tarefas sem efeito |
| **simplify** (skill; é o "Code Simplifier" disponível aqui) | Fase 17/47: limpeza | Os 4 agentes paralelos (reuso, simplificação, eficiência, altitude) pararam no limite de uso da API antes de devolver achados; a passada foi então feita diretamente, sem agentes | Aplicado sem mudar comportamento: um único `is_loopback()` para o engine e o Ollama (antes eram duas checagens), imports locais movidos para o topo (`planner`, `system_tools`, `desktop_tools`), guarda de metacaracteres do `cmd.exe` centralizada em `spawn_detached`, `kill_tree` corrigido na origem, `TaskManager.start` sem uso removido, rótulos do diálogo vindos da definição da ferramenta |
| **Playwright** (pacote npm `@playwright/test` + Chromium pré-instalado) | Fase 15: E2E e verificação visual | O plugin do catálogo não estava ativo. Usei o pacote diretamente: 13 testes E2E contra o engine real em sandbox, auditoria de "zero botões mortos" em tempo de execução, capturas em 3 resoluções, testes do app Electron real (`_electron.launch`) e medição de desempenho via CDP | Inicialização honesta, comandos, permissões, tarefa composta real, reconexão do WebSocket e outros cenários cobertos |

## Não disponíveis (e o que foi feito no lugar)

| Pedido | Situação | Alternativa aplicada |
|---|---|---|
| Feature Dev (plugin) | No catálogo, mas não ativado nesta sessão | Fluxo equivalente feito à mão: discovery → arquitetura (ARCHITECTURE.md) → implementação por fases → testes → revisão |
| Code Simplifier (plugin) | Não ativado | Skill embutida **simplify** (acima) |
| Security Guidance (plugin) | Não ativado | Skill embutida **security-review** + regras de segurança no código (SECURITY.md) |
| Context7 (documentação de bibliotecas) | Não ativado; acesso à rede para docs bloqueado | Li o código-fonte e os tipos das versões **instaladas** (Electron 44, React 19, Vite 8, FastAPI, faster-whisper 1.2, piper-tts 1.8, openWakeWord 0.6) em `node_modules` e no `.venv` |
| Emil Kowalski Design Engineering | Não encontrado | Princípios aplicados manualmente: animar só `transform`/`opacity`, molas em vez de easings lineares, durações curtas para feedback, movimento que comunica estado, respeito a `prefers-reduced-motion` |
| Figma / Design | No catálogo, sem conexão configurada | Design direto em código com tokens; nenhum arquivo Figma foi criado ou lido |
| Headroom, OmniRoute, Task Observer, find-skills | Não encontrados | — |
| Supabase | Plugin no catálogo, conector não conectado | Não usado. O Jarvis **não** depende de Supabase: dados locais em SQLite |
| Vercel | Sem plugin | Nada foi publicado. O renderer é uma SPA estática (`vite build`, `base: "./"`) compatível com hospedagem estática para um futuro painel web; o engine nunca é exposto |
| claude-memory, claude-code-setup | No catálogo, não ativados | Não necessários para o produto |

## Ferramentas do ambiente usadas diretamente

- **pytest, vitest, tsc, esbuild, electron-builder, PyInstaller**: build e testes (ver DEVELOPMENT.md).
- **espeak-ng + numpy**: geração de áudio sintético para validar o openWakeWord ("hey jarvis"), já que não havia microfone.
- **xvfb**: execução do Electron real sem monitor, para os testes de fumaça do app e do pacote.
