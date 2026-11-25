# TOOLS — catálogo de ferramentas do Jarvis

Gerado a partir do `ToolRegistry` (`engine/jarvis_engine/tools/`). Cada capacidade do Jarvis é uma *Tool* com
id, nome, descrição, parâmetros validados, nível de permissão, `execute()`, resultado estruturado e tratamento de erro.
O modelo de IA **nunca** executa shell: ele só escolhe uma destas ferramentas, e toda chamada passa por
`ActionExecutor` → validação → `PermissionManager` → execução → registro na Atividade.

## Níveis de permissão

| Nível | Significado | Política padrão |
|---|---|---|
| 0 | Somente leitura | automático |
| 1 | Ações reversíveis comuns | automático |
| 2 | Alterações importantes | pede confirmação |
| 3 | Destrutivas ou sensíveis | **sempre** pede confirmação (não pode ser automático) |

Algumas ferramentas elevam o nível conforme os argumentos (ex.: `kill_process` com `force=true` vira nível 3; `open_path` de um tipo desconhecido vira nível 2; `run_command` de leitura como `git_status` é nível 0).
Cada ferramenta pode ser ajustada em **Configurações › Permissões** (Padrão / Automático / Perguntar / Bloquear). Ferramentas bloqueadas nem são oferecidas ao modelo.

## Sistema

| id | Nome | Nível | Parâmetros | Plataformas | Descrição |
|---|---|---|---|---|---|
| `system_status` | Status do sistema | 0 · leitura | `focus`? | todas | Mostra métricas reais do computador: CPU, memória, disco, rede, bateria, GPU e temperatura quando disponíveis. |
| `list_processes` | Listar processos | 0 · leitura | `sort`?, `limit`? | todas | Lista os processos que mais usam memória ou CPU, agrupados por aplicativo. |
| `system_info` | Informações do sistema | 0 · leitura | — | todas | Informações do sistema operacional, processador, memória total e tempo ligado. |
| `active_window` | Janela ativa | 0 · leitura | — | todas | Informa qual aplicativo/janela está em primeiro plano. |
| `current_time` | Data e hora | 0 · leitura | — | todas | Informa a data e a hora atuais. |
| `kill_process` | Encerrar processo | 2 · importante ↑ | `pid`?, `name`?, `force`? | todas | Encerra um processo pelo PID ou nome. Sem 'force', pede para o programa fechar normalmente. |
| `open_system_settings` | Abrir configurações do sistema | 1 · reversível | `page`? | todas | Abre uma página das Configurações do Windows (som, bluetooth, rede, tela, notificações...). |
| `focus_mode` | Modo foco | 2 · importante | `enabled`?, `open_windows_settings`? | todas | Ativa/desativa o modo foco do Jarvis: silencia alertas proativos e fecha os apps de distração configurados. |

## Aplicativos e janelas

| id | Nome | Nível | Parâmetros | Plataformas | Descrição |
|---|---|---|---|---|---|
| `open_application` | Abrir aplicativo | 1 · reversível | `name` | todas | Abre um aplicativo instalado pelo nome natural (ex.: 'Spotify', 'Chrome', 'VS Code', 'calculadora'). |
| `close_application` | Fechar aplicativo | 2 · importante | `name`? | todas | Fecha um aplicativo pedindo que ele encerre normalmente (o programa pode pedir para salvar). |
| `list_applications` | Aplicativos instalados | 0 · leitura | `query`? | todas | Pesquisa os aplicativos instalados que o Jarvis conhece. |
| `focus_window` | Focar janela | 1 · reversível | `name`? | Windows | Traz a janela de um aplicativo para frente. |
| `window_state` | Minimizar/maximizar janela | 1 · reversível | `state`, `name`? | Windows | Minimiza, maximiza ou restaura a janela de um aplicativo. |

## Arquivos

| id | Nome | Nível | Parâmetros | Plataformas | Descrição |
|---|---|---|---|---|---|
| `search_files` | Pesquisar arquivos | 0 · leitura | `query`?, `extensions`?, `folder`?, `modified`?, `kind`?, `sort`?, `limit`? | todas | Pesquisa arquivos e pastas no índice local por nome, conteúdo, extensão, pasta e data de modificação. |
| `find_projects` | Encontrar projetos | 0 · leitura | `query`?, `limit`? | todas | Lista projetos de software encontrados (pastas com package.json, pyproject.toml, .git, .sln...). |
| `open_path` | Abrir arquivo ou pasta | 1 · reversível ↑ | `path` | todas | Abre um documento ou mídia com o aplicativo padrão, ou uma pasta no Explorador. Recusa executáveis, scripts e atalhos; tipos desconhecidos sobem para nível 2. |
| `open_folder` | Abrir pasta | 1 · reversível | `name` | todas | Abre uma pasta conhecida (Downloads, Documentos, Área de Trabalho, Imagens...) ou um caminho. |
| `create_folder` | Criar pasta | 1 · reversível | `name`, `parent`? | todas | Cria uma pasta nova (padrão: pasta atual do contexto ou Documentos). |
| `rename_path` | Renomear | 2 · importante | `path`, `new_name` | todas | Renomeia um arquivo ou pasta. |
| `move_path` | Mover | 2 · importante | `path`, `destination` | todas | Move um arquivo ou pasta para outra pasta. |
| `copy_path` | Copiar | 1 · reversível | `path`, `destination` | todas | Copia um arquivo ou pasta para outra pasta. |
| `delete_paths` | Apagar arquivos | 3 · destrutivo/sensível | `paths`, `permanent`? | todas | Envia arquivos/pastas para a Lixeira (padrão) ou apaga permanentemente. Sempre exige confirmação. |
| `read_file` | Ler arquivo | 0 · leitura | `path`? | todas | Lê o texto de um arquivo (txt, md, código, pdf, docx) para análise. |
| `summarize_file` | Resumir documento | 0 · leitura | `path`?, `focus`? | todas | Resume um documento usando o modelo de IA configurado. |
| `organize_folder` | Organizar pasta | 2 · importante | `folder` | todas | Organiza os arquivos soltos de uma pasta em subpastas por tipo (Documentos, Imagens, Instaladores...). |

## Web

| id | Nome | Nível | Parâmetros | Plataformas | Descrição |
|---|---|---|---|---|---|
| `open_url` | Abrir site | 1 · reversível | `url` | todas | Abre um endereço web (http/https) no navegador padrão. |
| `web_search` | Pesquisar na web | 1 · reversível | `query`, `engine`? | todas | Abre uma pesquisa na web no navegador padrão. |
| `open_browser` | Abrir navegador | 1 · reversível | — | todas | Abre o navegador padrão. |

## Áudio e mídia

| id | Nome | Nível | Parâmetros | Plataformas | Descrição |
|---|---|---|---|---|---|
| `set_volume` | Ajustar volume | 1 · reversível | `level`?, `delta`?, `app`? | todas | Ajusta o volume geral ou de um aplicativo específico (nível absoluto 0-100 ou variação +/-). |
| `mute` | Mudo | 1 · reversível | `muted`? | todas | Ativa ou desativa o mudo do som geral. |
| `media_control` | Controle de mídia | 1 · reversível | `action` | todas | Tocar/pausar, próxima ou anterior na mídia em reprodução. |

## Área de transferência

| id | Nome | Nível | Parâmetros | Plataformas | Descrição |
|---|---|---|---|---|---|
| `clipboard_read` | Ler área de transferência | 1 · reversível | — | todas | Lê o texto atual da área de transferência. |
| `clipboard_write` | Copiar texto | 1 · reversível | `text` | todas | Copia um texto para a área de transferência. |

## Notificações

| id | Nome | Nível | Parâmetros | Plataformas | Descrição |
|---|---|---|---|---|---|
| `notify` | Notificação | 1 · reversível | `title`, `body`? | todas | Mostra uma notificação na área de trabalho. |

## Energia

| id | Nome | Nível | Parâmetros | Plataformas | Descrição |
|---|---|---|---|---|---|
| `lock_computer` | Bloquear computador | 1 · reversível | — | todas | Bloqueia a sessão (tela de bloqueio). |
| `sleep_computer` | Suspender computador | 2 · importante | — | todas | Coloca o computador em suspensão. |
| `shutdown_computer` | Desligar/reiniciar | 3 · destrutivo/sensível | `restart`?, `delay_seconds`? | todas | Agenda o desligamento ou reinício do computador (com atraso cancelável). |
| `cancel_shutdown` | Cancelar desligamento | 1 · reversível | — | todas | Cancela um desligamento/reinício agendado. |

## Notas

| id | Nome | Nível | Parâmetros | Plataformas | Descrição |
|---|---|---|---|---|---|
| `create_note` | Criar nota | 1 · reversível | `content`, `title`? | todas | Cria uma nota (título opcional). |
| `list_notes` | Mostrar notas | 0 · leitura | `limit`? | todas | Lista as notas mais recentes. |
| `search_notes` | Pesquisar notas | 0 · leitura | `query` | todas | Pesquisa notas por texto. |
| `delete_note` | Apagar nota | 2 · importante | `note_id`?, `title`? | todas | Apaga uma nota pelo id, pelo título ou a última mencionada. |
| `append_note` | Adicionar à nota | 1 · reversível | `text`, `note_id`?, `title`? | todas | Acrescenta texto a uma nota existente. |

## Lembretes e agenda

| id | Nome | Nível | Parâmetros | Plataformas | Descrição |
|---|---|---|---|---|---|
| `create_reminder` | Criar lembrete | 1 · reversível | `text`, `when`? | todas | Cria um lembrete a partir de uma expressão natural ('amanhã às 15h', 'daqui a 20 minutos', 'todo sábado'). |
| `list_reminders` | Listar lembretes | 0 · leitura | — | todas | Lista os lembretes pendentes. |
| `cancel_reminder` | Cancelar lembrete | 2 · importante | `reminder_id`?, `text`? | todas | Cancela um lembrete pelo id ou pelo texto. |
| `agenda_today` | O que tenho para hoje | 0 · leitura | — | todas | Resume os lembretes de hoje, tarefas registradas na memória e notas recentes. |

## Memória

| id | Nome | Nível | Parâmetros | Plataformas | Descrição |
|---|---|---|---|---|---|
| `remember` | Lembrar informação | 1 · reversível | `content`, `category`? | todas | Guarda na memória de longo prazo uma informação que o usuário pediu explicitamente para lembrar. |
| `recall` | Consultar memória | 0 · leitura | `query`? | todas | Consulta o que o Jarvis sabe sobre um assunto (memórias salvas). |
| `forget` | Esquecer | 2 · importante | `query`?, `memory_id`? | todas | Apaga memórias que correspondem a um assunto (ou a última mencionada). |

## Desenvolvedor

| id | Nome | Nível | Parâmetros | Plataformas | Descrição |
|---|---|---|---|---|---|
| `port_info` | Portas em uso | 0 · leitura | `port`? | todas | Mostra qual processo está usando uma porta TCP, ou lista as portas abertas para conexão. |
| `open_in_vscode` | Abrir no VS Code | 1 · reversível | `path`? | todas | Abre uma pasta ou arquivo no Visual Studio Code (vazio = pasta/projeto do contexto atual). |
| `run_command` | Executar comando classificado | 0 · leitura ↑ | `command`, `project`?, `script`?, `tool`?, `wait_seconds`? | todas | Executa um comando de desenvolvimento pré-aprovado num projeto (scripts do package.json, testes, git). Nunca executa linhas de comando livres. |
| `list_project_scripts` | Scripts do projeto | 0 · leitura | `project`? | todas | Lista os scripts do package.json de um projeto. |
| `run_project` | Rodar projeto | 2 · importante | `project`?, `open_editor`? | todas | Localiza um projeto, detecta o gerenciador de pacotes, inicia o ambiente de desenvolvimento, detecta a porta e abre a URL local. Mostra o progresso em etapas. |
| `stop_process` | Parar processo do terminal | 1 · reversível | `process_id`? | todas | Encerra um processo iniciado pelo Jarvis (e seus filhos). |
| `terminal_output` | Mostrar saída/erros | 0 · leitura | `errors_only`? | todas | Mostra a saída (ou só os erros) do último processo executado. |
| `explain_error` | Explicar erro | 0 · leitura | — | todas | Explica por que o último comando/build falhou, usando a IA configurada. |

## Visão

| id | Nome | Nível | Parâmetros | Plataformas | Descrição |
|---|---|---|---|---|---|
| `screen_analysis` | Analisar tela | 2 · importante | `question`? | todas | Captura a tela (com autorização explícita) e pede ao modelo de visão para descrever, ler textos ou explicar um erro visível. |

## Controle de interface (experimental)

| id | Nome | Nível | Parâmetros | Plataformas | Descrição |
|---|---|---|---|---|---|
| `ui_inspect` | Inspecionar janela (UIA) | 0 · leitura | `window` | Windows | OBSERVE: lista os elementos interativos de uma janela via UI Automation. (requer ativar em Configurações › Sistema) |
| `ui_click` | Acionar elemento (UIA) | 2 · importante | `window`, `element`, `control_type`? | Windows | ACT + VERIFY: aciona um botão/elemento pelo nome usando UI Automation e verifica o resultado. (requer ativar em Configurações › Sistema) |
| `ui_type` | Digitar em campo (UIA) | 2 · importante | `window`, `text`, `element`? | Windows | ACT + VERIFY: escreve texto em um campo de edição e confere o valor resultante. (requer ativar em Configurações › Sistema) |

Total: **62 ferramentas**. `?` = parâmetro opcional; `↑` = nível pode subir conforme os argumentos.

## Comandos de terminal classificados (`run_command`)

| command | O que executa | Nível |
|---|---|---|
| `run_script` | `<npm|pnpm|yarn|bun> run <script>` — apenas scripts existentes no `package.json` (nome validado) | 2 |
| `install_deps` | `<pm> install` | 2 |
| `run_tests` | `<pm> test`, `python -m pytest -q` ou `cargo test`, conforme o projeto | 2 |
| `git_status` / `git_log` / `git_diff_stat` | leitura do repositório | 0 |
| `versions` | `node/npm/python/git/pnpm/yarn --version` | 0 |

Todo argv passa pelo denylist de `security.check_command` (format, diskpart, bcdedit, vssadmin, `reg delete`, `Set-MpPreference`, `-EncodedCommand`, `iex`, `curl | sh`, `sudo`, ...) e é executado sem shell. Processos podem ser cancelados (árvore inteira) pelo painel Terminal ou por voz (“pare o servidor”).
