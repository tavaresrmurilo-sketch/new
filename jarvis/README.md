# J.A.R.V.I.S. — assistente operacional para Windows 11

Assistente de desktop com voz, um agente que executa ferramentas de verdade no seu computador e uma interface HUD futurista. Tudo roda localmente por padrão: Ollama para IA, faster-whisper para reconhecimento, Piper ou a voz do Windows para a fala. Nenhum provedor pago é necessário.

```
Você: "Jarvis, abra meu projeto BETA e coloque ele para rodar."
Jarvis: localiza o projeto → abre no VS Code → lê o package.json → escolhe o gerenciador
        → instala dependências se faltar → npm run dev → detecta a porta → verifica por HTTP
        → abre http://localhost:5173 → "Projeto BETA rodando em http://localhost:5173."
```

## Instalação (Windows 10/11)

Pré-requisitos: **Python 3.10+** e **Node.js 20+** no PATH. Opcional: [Ollama](https://ollama.com) para IA local.

```bat
setup.cmd     :: cria o ambiente Python, instala dependências (incl. voz local), npm install e build
start.cmd     :: inicia o Jarvis (fica na bandeja do sistema)
```

Na primeira execução aparece o **onboarding**: idioma, microfone, alto-falante, IA, palavra de ativação, permissões, memória e iniciar com o Windows (desligado até você escolher). Depois vem a **inicialização do sistema**, com verificações reais. Um item que falhou nunca aparece como ONLINE.

Para IA local: instale o Ollama e baixe um modelo com suporte a ferramentas, por exemplo `ollama pull qwen2.5:7b`. O Jarvis detecta o Ollama em `localhost:11434` e lista os modelos instalados. Ele **não baixa modelos sozinho**. Sem IA, os comandos diretos (abrir apps, arquivos, sistema, notas, lembretes, memória, projetos…) continuam funcionando pelo roteador local de intenções.

Chaves de provedores na nuvem (OpenAI, Anthropic, Gemini) são opcionais. Elas ficam só em `.env.local` (copie de `.env.example`) e só são usadas depois que você autoriza provedores externos em Configurações › Privacidade.

Outros scripts: `dev.cmd` (desenvolvimento com recarga), `build.cmd` (instalador `.exe` + versão portátil), `test.cmd` (todas as suítes de teste).

## O que ele faz

| Área | Exemplos |
|---|---|
| Aplicativos | “abra o Spotify”, “abra o navegador do Google”, “feche o Chrome”, “foque no VS Code”, “minimize essa janela” |
| Arquivos | “procure minha apresentação da escola”, “abra o mais recente”, “qual PDF eu baixei ontem?”, “renomeie ele para relatório-final”, “mova para Documentos”, “apague esses arquivos” (vão para a Lixeira, com confirmação), “organize a pasta Downloads”, “resuma esse documento” |
| Sistema | “como está o sistema?”, “o que está consumindo mais memória?”, “quais portas estão em uso?”, volume, mídia, bloquear, configurações do Windows |
| Desenvolvimento | “rode os testes do projeto X”, “git status”, “abra no VS Code”, terminal seguro com saída ao vivo e botão Parar |
| Produtividade | notas, lembretes em linguagem natural (“amanhã às 15h ligar para o João”) com notificação, agenda do dia, modo foco |
| Memória | “lembre que meu projeto BETA usa Node 22”, “o que você sabe sobre o projeto BETA?”, “esqueça isso”; tela MEMÓRIA para ver, editar e apagar |
| Visão | “leia essa tela”, “explique o erro na tela” (captura única, com autorização e indicador visível) |
| Contexto | “abra ele”, “o mais recente”, “nessa pasta”, “e depois abra o YouTube” |
| Interrupção | “pare”, “cancelar”, “esquece”, `Esc`, falar por cima da resposta |

Veja a lista completa de ferramentas, com nível de permissão, em [TOOLS.md](TOOLS.md).

## Voz

Microfone (com cancelamento de eco) → VAD → palavra de ativação “Jarvis” → transcrição local → agente → fala sintetizada frase a frase. É possível interromper enquanto ele fala, escolher dispositivos, calibrar o ruído do ambiente e usar openWakeWord (“Hey Jarvis”). Os detalhes estão em [VOICE.md](VOICE.md).

## Interface

- **Núcleo JARVIS** no centro, procedural em canvas. Cada estado tem movimento próprio: IDLE, LISTENING, THINKING, SPEAKING, EXECUTING, ERROR.
- **SYSTEM** à esquerda: CPU, RAM, GPU, disco, rede, bateria e processos, com valores reais (N/A quando o dado não existe) e alertas.
- **CONTEXT** à direita: tarefa atual com etapas e progresso, linha do tempo das ações, contexto ativo.
- **Transcrição ao vivo** embaixo, e barra de comando (`/` foca).
- Módulos (`Alt+1…8`): Memória, Notas, Lembretes, Tarefas, Terminal, Atividade, Privacidade, Configurações.
- Modos: HUD completo, Mini (widget sempre no topo), Segundo plano (bandeja) e Somente voz.
- Atalhos globais: `Ctrl+Espaço` (paleta de comandos), `Ctrl+Shift+J` (mostrar/ocultar), `Ctrl+Shift+Espaço` (ouvir agora).
- Movimento reduzido respeitado (sistema ou configuração), navegação por teclado e rótulos acessíveis.

## Segurança e privacidade

O modelo de IA **nunca executa linhas de comando**. Ele escolhe ferramentas registradas, que validam parâmetros e passam por níveis de permissão (0 leitura, 1 reversível, 2 importante, 3 destrutivo). Níveis 2 e 3 pedem confirmação explícita, e o nível 3 nunca pode ser automático. O engine só escuta em `127.0.0.1`, com token novo a cada execução. Captura de tela, microfone e envio a provedores externos têm indicadores permanentes na barra superior. Detalhes em [SECURITY.md](SECURITY.md).

## Documentação

| Documento | Conteúdo |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | componentes, fluxo de um comando, protocolo, banco, desempenho, Jarvis Remote futuro |
| [SECURITY.md](SECURITY.md) | modelo de ameaça, permissões, listas de bloqueio, privacidade, revisão de segurança |
| [TOOLS.md](TOOLS.md) | catálogo das ferramentas (gerado a partir do registro) |
| [VOICE.md](VOICE.md) | pipeline de voz, wake word, STT/TTS, barge-in, latência |
| [DEVELOPMENT.md](DEVELOPMENT.md) | estrutura, execução isolada, testes, como adicionar ferramentas, build |
| [PLUGIN_USAGE.md](PLUGIN_USAGE.md) | skills/plugins usados na construção e o que não estava disponível |

## Estado desta versão (honesto)

**Verificado** neste repositório, em Linux (container de desenvolvimento):

- 188 testes do engine (pytest), 15 unitários (vitest) e 13 E2E (Playwright contra o engine real, em sandbox).
- Electron real: sandbox e isolamento de contexto ativos, engine conectado em menos de 1 s, verificações honestas de inicialização.
- App empacotado com o engine em PyInstaller: inicia e conecta.
- Sequência de demonstração pelo core: saudação, status, processos, notas, projetos, “PDF de ontem”, lembretes, memória, agenda, rodar projeto com porta e verificação HTTP.
- Desempenho: ~1 ms por quadro no núcleo; engine ocioso em ~0,5% de um núcleo e ~98 MB.

**Precisa ser validado no seu Windows** (não havia Windows, microfone nem acesso aos modelos neste ambiente):

- Integrações específicas do Windows: Core Audio (pycaw), varredura do Menu Iniciar/UWP, janelas via Win32/UIA, `os.startfile`, notificações nativas, login item, build NSIS.
- Reconhecimento de voz real (faster-whisper) e vozes Piper: os downloads do HuggingFace estavam bloqueados aqui. A lógica foi testada com áudio sintetizado.
- Respostas com Ollama: o agent loop foi testado contra um servidor compatível falso, com HTTP real e streaming.

Se algo falhar, abra o painel **Atividade** (`Alt+6`). Todo erro tem uma mensagem amigável e os detalhes técnicos.
