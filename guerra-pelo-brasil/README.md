# GUERRA PELO BRASIL 2.0 — CONQUISTA TOTAL

Jogo de estratégia militar em tempo real (RTS 2D) para navegador. Num universo fictício e **satírico**, o
Exército Lula (vermelho) e o Exército Bolsonaro (azul) disputam os **26 estados e o Distrito Federal** num
mapa com as fronteiras estaduais reais do Brasil. A versão 2.0 traz **multiplayer online de 1v1 a 5v5**
com servidor autoritativo, funções militares por equipe, terreno real, névoa de guerra e IA mais avançada.

> **Aviso.** Obra de ficção satírica que ridiculariza a polarização política, em que cada lado acusa o outro
> de "nazista" ou "comunista". Hitler e Stalin aparecem como caricaturas ridículas. Na vida real, foram
> ditadores responsáveis por crimes contra a humanidade. O jogo não glorifica o nazismo, o stalinismo nem
> qualquer político, e não usa símbolos reais desses regimes.

## Jogar

- **Offline, sem instalar nada:** abra `jogar/GuerraPeloBrasil.html` (Edge ou Chrome, Windows 11). Campanha,
  batalha rápida, multiplayer local e sandbox funcionam sem internet. Os saves da versão 1.0 são migrados
  automaticamente.
- **Online:** rode ou publique o servidor (abaixo) e abra o endereço dele no navegador. Em **Multiplayer
  online**, crie uma sala e envie o código (ex.: `BR-7KQ42`) ou o link `https://seu-servidor/?sala=BR-7KQ42`.
  O arquivo local também pode jogar online: em **Configurações → Servidor online**, informe o endereço.
- **Celular e tablet:** o mesmo endereço funciona no navegador do aparelho. A interface se adapta ao tamanho
  da tela (retrato e paisagem); para as partidas, a paisagem mostra mais do mapa. Menu, lobby e convites
  funcionam em retrato. Celulares e computadores podem jogar na mesma sala.

### Controles no celular
| Gesto / botão | Ação |
|---|---|
| Toque numa tropa | seleciona (toque duplo: todas do mesmo tipo na tela) |
| Toque no mapa com tropas selecionadas | move; numa capital ou unidade inimiga, ataca |
| Arrastar com um dedo | move a câmera (nunca seleciona nem dá ordens) |
| Pinça com dois dedos | zoom |
| **Área** | o próximo arrasto vira caixa de seleção |
| **Tela** | seleciona todas as tropas visíveis |
| **Atacar / Parar / Manter / Base / Sede** | ataque-movimento, parar, manter posição, voltar à base, ir à sede |
| **Cancelar** | sai do modo de ordem atual e limpa a seleção |
| **Construir** | abre construção e recrutamento do estado na tela (ou da sede) |
| **Comando / Info / Mapa** | gavetas de habilidades, objetivos/relatório/equipe/chat e minimapa |
| Toque no título do painel inferior | recolhe ou expande o painel |

## Desenvolvimento

Requisitos: Node.js 20 ou mais recente.

```bash
npm install
npm run dev            # cliente com recarga automática (http://localhost:5173)
npm run dev:server     # servidor multiplayer em modo desenvolvimento (http://localhost:8787)
npm run lint           # ESLint (TypeScript)
npm run typecheck      # tsc --noEmit
npm run build:all      # typecheck + cliente (dist/index.html) + servidor (dist-server/server.mjs)
npm start              # servidor de produção: serve o jogo e o WebSocket na mesma porta
npm test               # 55 testes: regras, IA, equilíbrio, save, multiplayer com 10 clientes reais
npm run test:e2e       # 10 navegadores reais jogando a mesma partida 5v5 (requer build:all e Playwright/Chromium)
npm run test:mobile    # toque real (CDP) em 360×800, 390×844, 844×390, 768×1024 e 1920×1080; celular × PC
                       # online com queda de internet e reconexão (E2E_SHOTS=pasta salva capturas)
npm run check          # lint + typecheck + build + testes
npm run release        # gera jogar/GuerraPeloBrasil.html (arquivo único offline)
npm run map            # regenera o mapa e o terreno a partir de data/raw/
```

Com `npm run dev` + `npm run dev:server`, o cliente conecta em `http://localhost:8787` (ou no valor de
`VITE_SERVER_URL`).

## Publicação

Nada foi publicado automaticamente. Antes de publicar, rode `npm run check`, `npm run test:e2e` e
`npm run test:mobile` (todos passaram na última verificação).

### Servidor + jogo no Railway (recomendado: um único serviço)
1. Railway → **New Project → Deploy from GitHub repo** → escolha este repositório e o branch desejado.
2. Em **Settings → Source**, defina **Root Directory** = `guerra-pelo-brasil`. O `railway.json` usa o
   `Dockerfile`, que gera cliente e servidor numa única imagem (Node 22, `NODE_ENV=production`).
3. **Volume:** botão direito no serviço → **Attach Volume**, caminho de montagem `/data` (salas em andamento,
   histórico e replays sobrevivem a reinícios). A imagem roda como usuário `node`; se o log mostrar
   `DATA_DIR sem permissão de escrita`, adicione a variável `RAILWAY_RUN_UID=0` (o jogo funciona mesmo sem
   persistência, mas perde as salas ao reiniciar).
4. **Variables:**
   | Variável | Valor em produção |
   |---|---|
   | `ALLOWED_ORIGINS` | `https://SEU-SERVICO.up.railway.app` (mais o domínio da Vercel, se usar, e `null` para permitir o arquivo `.html` local), separados por vírgula |
   | `LOG_LEVEL` | `info` |
   | `MAX_ROOMS` | `100` (opcional) |
   | `PORT` | não defina: o Railway define |
5. **Settings → Networking → Generate Domain.** O Railway fornece HTTPS; o cliente usa `wss://`
   automaticamente quando a página está em HTTPS.
6. Health check já configurado: `GET /health` → `{"status":"ok", ...}`. Endpoints públicos:
   `/api/rooms`, `/api/history`. Rotas desconhecidas sem extensão voltam para o jogo (links `?sala=` e
   recarregar a página funcionam); arquivos inexistentes recebem uma página 404.
7. Teste: abra o domínio no computador e no celular, crie uma sala em um e entre pelo link no outro.

Com `ALLOWED_ORIGINS="*"` em produção o servidor registra um aviso no log: restrinja aos domínios do jogo.

### Front-end separado na Vercel (opcional)
1. Vercel → **Add New → Project** → importe o repositório; **Root Directory** = `guerra-pelo-brasil`
   (o `vercel.json` define `npm ci`, `npm run build` e a saída `dist`).
2. **Environment Variables:** `VITE_SERVER_URL=https://SEU-SERVICO.up.railway.app` (usada no build).
3. Deploy. Depois, inclua o domínio da Vercel (ex.: `https://guerra-pelo-brasil.vercel.app`) em
   `ALLOWED_ORIGINS` no Railway e reinicie o serviço.

### Linha de comando (alternativa)
```bash
# Railway CLI (na pasta guerra-pelo-brasil, após "railway login" e "railway link")
railway up
# Vercel CLI (na pasta guerra-pelo-brasil, após "vercel login")
vercel --prod
```

### Docker em qualquer host
```bash
docker build -t gpb . && docker run -p 8787:8787 -v gpb-data:/data -e ALLOWED_ORIGINS="http://localhost:8787" gpb
```

Nenhum segredo é necessário: as sessões usam tokens aleatórios gerados pelo servidor e as senhas de sala são
guardadas apenas como hash com sal.

## Multiplayer: como funciona

- **Servidor autoritativo** (`server/`): cada sala roda a simulação em ticks fixos de 50 ms. Os clientes só
  enviam intenções (mover, atacar, construir, recrutar, habilidade, objetivo, marcador). O servidor valida a
  forma do comando, a função militar do jogador, a posse das unidades e os recursos, e calcula tudo.
- **Sincronização:** snapshots compactos por equipe a 10 Hz, com deltas, compressão per-message-deflate e
  filtro de **névoa** (cada equipe recebe só o que enxerga). O cliente interpola entre snapshots.
- **Confiabilidade:** comandos com id único e confirmação; duplicados são ignorados; reenvio após queda;
  reconexão automática com recuo exponencial; sessão por token (recarregar a página devolve a mesma equipe e
  função). Se um jogador não voltar dentro do prazo configurado, a IA da equipe assume a função dele.
- **Funções (5 por equipe):** Comandante Supremo, General de Infantaria, General de Blindados, Comandante
  Aéreo e Ministro de Logística e Indústria. Com menos jogadores, as funções são agrupadas automaticamente.
  Os recursos são compartilhados pela equipe.
- **Segurança:** limite de 16 KB por mensagem, limitação de taxa (mensagens, ordens, chat, marcadores, salas),
  bloqueio de mensagens de chat repetidas, limite de conexões por IP, apelidos e chat sanitizados,
  verificação de origem, salas isoladas, logs estruturados, persistência atômica e recuperação após
  reinício. Não há rotas administrativas nem chaves secretas; o token de sessão só é enviado ao próprio
  jogador.
- **Replays:** cada partida encerrada grava as configurações e todos os comandos com o tick em
  `DATA_DIR/replays/`. A simulação é determinística, então isso basta para reproduzir a partida. O player de
  replay ainda não existe.

### Limites documentados
- 10 jogadores por sala (5v5) e até 10 espectadores; até 100 salas por servidor (`MAX_ROOMS`).
- Limite de tropas por equipe: 60, 100 ou 150 (configurável na sala).
- Medido neste projeto: uma partida 5v5 custa cerca de 1 a 3 ms por tick no servidor; o snapshot completo
  inicial tem cerca de 4 KB e as atualizações, de 1 a 3 KB.

## Novidades de jogabilidade 2.0
Terreno real (mata amazônica, serras, Pantanal e rios da Natural Earth, além das cidades), formações (linha,
coluna, dispersa, escolta, cerco e defesa), veterania com limite, moral com recuo, batedores com sensores,
névoa de guerra (também na batalha rápida), eventos fictícios, objetivos regionais, convocação de reservas e
IA que respeita a névoa (memória do que viu, cautela com o desconhecido), assume funções vagas e segue o
objetivo do comandante. O equilíbrio entre facções é verificado por simulação em `tests/balance.test.ts`.

## Estrutura
```
shared/   regras e simulação determinística (roda no navegador e no Node), protocolo, snapshots, comandos
client/   Phaser 3 + interface DOM (menus, lobby, HUD, áudio procedural)
server/   servidor Node (HTTP + WebSocket, salas, persistência)
tests/    Vitest (regras, IA, equilíbrio, save, multiplayer real) e e2e/ (10 navegadores)
backup/   cópia do GuerraPeloBrasil.html da versão 1.0
```

## Limitações conhecidas
- Comunicação por voz não foi implementada. A arquitetura de salas e equipes está pronta para integrá-la
  (por exemplo, WebRTC com o servidor atual fazendo a sinalização).
- Histórico e salas são persistidos em arquivos (`DATA_DIR`). PostgreSQL/Neon não foi integrado.
- O replay é registrado, mas ainda não há reprodutor.
- O teste com 10 navegadores usa o renderizador Canvas (`?renderer=canvas`), porque esta máquina de testes
  não tem GPU. Os jogadores usam WebGL normalmente.
- Testes automatizados rodaram só no Chromium (incluindo emulação de celular com toque real via CDP).
  Firefox, Safari (macOS/iOS) e aparelhos físicos ainda não foram testados; o código evita recursos
  exclusivos do Chromium e inclui prefixos para Safari, mas é preciso conferir antes do lançamento.
- Parâmetros úteis para aparelhos fracos: `?renderer=canvas` e `?fps=30`.

## Fontes de dados
- Malha estadual: IBGE, via `click_that_hood/brazil-states.geojson`.
- Países vizinhos, rios e regiões geográficas: Natural Earth (domínio público).
