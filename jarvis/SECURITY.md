# SECURITY — J.A.R.V.I.S.

O Jarvis age no seu computador com os seus privilégios. Por isso ele foi construído com uma regra central: **o modelo de IA nunca executa nada diretamente**. Ele só pede ferramentas registradas, e toda chamada passa pelo mesmo caminho:

```
pedido → IntentRouter / LLM escolhe ferramenta → validação de parâmetros → pré-checagem
       → PermissionManager (nível + política + confirmação) → execução com timeout
       → verificação → registro na Atividade
```

`ActionExecutor.execute()` (`engine/jarvis_engine/core/executor.py`) é o único ponto que executa ferramentas. Isso vale para o LLM, para os comandos locais, para os planos compostos e para os botões da interface.

## Modelo de ameaça

| Ameaça | Mitigação |
|---|---|
| Outro programa ou site acessando o engine | bind somente em `127.0.0.1`/`::1` (outro host é recusado na inicialização); token aleatório de 256 bits por execução, exigido na primeira mensagem (≤ 5 s); allowlist de `Origin` no WebSocket |
| Injeção de prompt (texto de arquivo, página, tela ou área de transferência que manipula o LLM) | ferramentas com efeito relevante pedem confirmação; o LLM não recebe ferramentas com política “negar”; `open_path` recusa tipos executáveis e pede confirmação para tipos desconhecidos; terminal só com comandos classificados |
| Comando destrutivo | nível 3 sempre confirmado (não pode virar automático); Lixeira por padrão; lista de bloqueio de comandos; raízes protegidas do sistema |
| Vazamento de credenciais | caminhos de credenciais bloqueados para leitura e escrita; chaves só em `.env.local`, nunca no banco, na interface nem nos logs |
| Monitoramento oculto | captura de tela só sob pedido explícito, uma vez, com indicador; microfone com indicador e botão de mudo; fala sem palavra de ativação é descartada |
| Renderer comprometido | Electron com `sandbox`, `contextIsolation`, sem Node no renderer, CSP estrita, IPC validado pelo remetente, navegação bloqueada |

## Níveis de permissão

| Nível | Exemplos | Padrão |
|---|---|---|
| 0 — leitura | status do sistema, buscar arquivos, listar notas | automático |
| 1 — reversível | abrir app/pasta/site, criar nota, volume, copiar | automático |
| 2 — importante | fechar app, mover/renomear, rodar projeto, capturar a tela, terminal | **pede confirmação** |
| 3 — destrutivo/sensível | apagar arquivos, encerrar processo à força, desligar | **sempre pede confirmação** |

- As políticas podem ser mudadas por nível ou por ferramenta (Configurações › Permissões), mas **nível 3 nunca aceita “automático”**.
- Algumas ferramentas elevam o nível conforme os argumentos. `kill_process` com `force` vai para o nível 3. `open_path` sobe para o nível 2 quando o arquivo não é um documento, mídia ou pasta conhecidos.
- A confirmação expira em 120 s. Sem interface conectada, o pedido é negado.
- **Confirmação por voz:** “sim”/“não” respondem ao pedido **que está na tela** (o mais antigo). Com um pedido aberto, fala sem a palavra de ativação só é aceita se for uma resposta (sim/não/pare); o resto é descartado. Para o nível 3, a voz precisa dizer “confirmo”: um “ok” solto não basta.
- O diálogo foca **Cancelar** por padrão e mostra os argumentos reais (caminhos, script e o comando que ele executa).

## Sistema de arquivos (`engine/jarvis_engine/security.py`)

- **Leitura** (`check_read`): resolve o caminho (symlinks, `..`, variáveis) e bloqueia credenciais: bancos de senhas e cookies do Chrome/Edge/Brave/Firefox, `.ssh`, `.gnupg`, `.aws`, `.azure`, `.kube`, `Microsoft/Credentials|Protect|Vault`, KeePass, carteiras, chaves privadas.
- **Escrita** (`check_write`): só dentro da pasta do usuário ou de pastas autorizadas em Configurações; nunca na raiz dessas pastas; nunca em `Windows`, `Program Files`, `ProgramData`, `$Recycle.Bin`, `System Volume Information`, `Recovery`, `Boot` (e `/etc`, `/usr`… fora do Windows).
- **Apagar** usa a Lixeira (`send2trash`). A exclusão permanente é uma opção explícita, de nível 3.
- **Abrir arquivos** (`open_risk`): executáveis, scripts, atalhos e formatos que o shell executa são recusados. A lista inclui `.exe .cmd .bat .ps1 .vbs .js .wsf .hta .msi .cpl .msc .scr .pif .lnk .url .reg .appref-ms .settingcontent-ms .library-ms .search-ms`, as extensões do `PATHEXT` e outros. Pontos e espaços no fim do nome são ignorados, como faz o Windows. Tipos fora da lista de documentos e mídias conhecidos (por exemplo `.docm`, `.iso`) pedem confirmação.

## Comandos e processos

- O terminal só aceita **comandos classificados** (`run_script`, `install_deps`, `run_tests`, `git_status`, `git_log`, `git_diff_stat`, `versions`). O argv é montado pelo engine e o processo roda **sem shell** (`create_subprocess_exec`).
- `run_script` só aceita scripts que existem no `package.json`, com nome validado por `^[A-Za-z0-9:_.\-]{1,64}$`.
- **Lista de bloqueio** (`check_command`), aplicada a todo argv: `format`, `diskpart`, `bcdedit`, `vssadmin`, `wbadmin`, `cipher /w`, `reg add/delete`, `del /s`, `rd /s`, `rm -rf`, `mkfs`, `dd if=`, alterações no Defender (`Set-MpPreference`, `sc stop windefend`), firewall (`netsh advfirewall set`), `Invoke-Expression`/`iex`, `-EncodedCommand`, `certutil -urlcache`, `bitsadmin`, `mshta`, `regsvr32`, `schtasks /create`, `net user`, `takeown`, `icacls /grant`, `shutdown`, `curl | sh`, `sudo`, `runas`.
- A mesma lista também se aplica ao **conteúdo dos scripts do `package.json`** que o gerenciador vai rodar: o script pedido, seus `pre`/`post`, os scripts que ele chama e os hooks de instalação (`preinstall`, `install`, `postinstall`, `prepare`). A única exceção é a limpeza relativa (`rm -rf dist`).
- Launchers `.cmd`/`.bat` (como o `code.cmd` do VS Code) nunca recebem argumentos com metacaracteres do `cmd.exe` (`& | < > ^ % " !`).
- Processos críticos do sistema (`csrss`, `lsass`, `winlogon`, `svchost`, `explorer`, Defender…) e o próprio Jarvis não podem ser encerrados.
- URLs: só `http`, `https` e `mailto`. `file:`, `javascript:`, `ms-*:` e outros esquemas são recusados. As páginas de Configurações do Windows abrem por uma lista fixa de URIs `ms-settings:`.

**O que o Jarvis nunca faz:** obter senhas, ler credenciais do navegador, desativar antivírus ou firewall, executar instaladores ou scripts baixados, apagar arquivos sem confirmação, alterar configurações críticas do sistema, iniciar com o Windows sem você escolher, expor o computador à internet.

## Electron (`app/electron/main.ts`)

- `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`; o preload expõe uma API mínima via `contextBridge`.
- **IPC, navegação e permissões só para a página do próprio app**: o arquivo `dist/index.html` exato, ou a origem do servidor de desenvolvimento. Não vale qualquer `file://`.
- `window.open` é negado e navegações para fora do app são bloqueadas.
- Permissões do Chromium: só microfone (áudio, sem vídeo), notificações e escrita sanitizada na área de transferência.
- CSP: `default-src 'self'`, scripts só do próprio app, `connect-src` só para `127.0.0.1`/`localhost`, `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`.
- A captura de tela usa `desktopCapturer` no processo principal, só a pedido do engine após a confirmação, e oculta a janela do Jarvis durante a captura.
- O token do engine vive só na memória do processo principal e do renderer. No log do processo do engine ele é substituído por `***`.

## Privacidade

- **IA local por padrão** (Ollama em loopback). Provedores externos (OpenAI, Anthropic, Gemini **e um Ollama em outra máquina**) exigem consentimento explícito em Privacidade. Cada envio gera um aviso (“Enviando a …”) e um registro na Atividade.
- **Palavra de ativação:** o áudio só vira texto localmente. Fala sem “Jarvis” (fora da janela de continuação) é descartada: não aparece, não vai para o histórico nem para a Atividade.
- **Tela:** nenhuma captura contínua. Cada análise é uma captura única, com confirmação (nível 2) e indicador visível. Dá para desativar a captura por completo.
- **Memória de longo prazo** só guarda o que você pediu explicitamente (“lembre que…”). A tela MEMÓRIA mostra, edita e apaga tudo.
- **Histórico** com retenção configurável (padrão 30 dias) e opção de desligar. A Central de Privacidade exporta em JSON (memórias, notas, lembretes, configurações) e apaga histórico, atividade, memórias, tarefas ou o índice de arquivos.
- **Segredos:** chaves só em `.env.local` (ignorado pelo git). A interface só vê “configurada / não configurada”.

## Revisão de segurança desta versão

Foi feita uma revisão focada em vulnerabilidades exploráveis, com filtragem de falsos positivos. Nenhum achado atingiu o corte de alta confiança (≥ 8/10). Dois pontos foram analisados e reforçados mesmo assim:

1. `open_path` bloqueava só 12 extensões executáveis. Tipos como `.cpl`, `.wsf` ou `.url` poderiam ser abertos sem confirmação se uma injeção de prompt convencesse o LLM. Confiança 6/10. **Corrigido** com a lista ampla, o `PATHEXT`, a normalização do nome e a confirmação para tipos desconhecidos.
2. A lista de bloqueio não via o conteúdo dos scripts do `package.json`. Isso foi classificado como falso positivo (2/10): rodar os scripts do próprio projeto é a função da ferramenta, e ela sempre pede confirmação. Mesmo assim, **reforçado**: a lista agora inspeciona esse conteúdo, e a confirmação mostra o comando.

Também foram restringidos o IPC e a navegação do Electron à página do app, e o code review corrigiu a confirmação por voz (fala ambiente, pedido exibido × pedido respondido, nível 3).

## Limites conhecidos

- Scripts de ciclo de vida **das dependências** (`npm install` de pacotes de terceiros) não são inspecionados. Instalar dependências de um projeto é confiar nesse projeto, como no terminal.
- Injeção de prompt não se elimina por completo com um LLM. A defesa é limitar o que roda sem confirmação e mostrar com clareza o que vai acontecer.
- Os binários não são assinados digitalmente; o SmartScreen pode avisar.

## Jarvis Remote (futuro)

O engine **nunca** deve ser exposto à internet. Um painel remoto deve usar um relay com conexão **de saída** a partir do PC, pareamento explícito, criptografia ponta a ponta e, inicialmente, só leitura (status, tarefas, notificações). Nada disso está ativo nesta versão.

## Reportar um problema

Abra uma issue privada no repositório descrevendo o cenário, sem incluir dados pessoais ou chaves.
