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

## Desenvolvimento

Requisitos: Node.js 20 ou mais recente.

```bash
npm install
npm run dev            # cliente com recarga automática (http://localhost:5173)
npm run dev:server     # servidor multiplayer em modo desenvolvimento (http://localhost:8787)
npm run build:all      # typecheck + cliente (dist/index.html) + servidor (dist-server/server.mjs)
npm start              # servidor de produção: serve o jogo e o WebSocket na mesma porta
npm test               # 55 testes: regras, IA, equilíbrio, save, multiplayer com 10 clientes reais
npm run test:e2e       # 10 navegadores reais jogando a mesma partida (requer: npx playwright install chromium)
npm run release        # gera jogar/GuerraPeloBrasil.html (arquivo único offline)
npm run map            # regenera o mapa e o terreno a partir de data/raw/
```

Com `npm run dev` + `npm run dev:server`, o cliente conecta em `http://localhost:8787` (ou no valor de
`VITE_SERVER_URL`).

## Publicação

### Servidor (Railway, recomendado)
1. Crie um serviço a partir do repositório, com **Root Directory** `guerra-pelo-brasil`. O `railway.json`
   usa o `Dockerfile`, que gera o cliente e o servidor numa única imagem.
2. Adicione um **volume** montado em `/data` (partidas em andamento, histórico e replays sobrevivem a
   reinícios).
3. Variáveis de ambiente (veja `.env.example`): `ALLOWED_ORIGINS` (origens autorizadas; inclua o domínio da
   Vercel e `null` para o arquivo local) e `LOG_LEVEL`. O Railway define a `PORT`.
4. Health check: `GET /health` responde `{"status":"ok", ...}`. Outros endpoints: `GET /api/rooms` e
   `GET /api/history`.

O próprio servidor já serve o jogo, então só o Railway basta.

### Front-end separado (Vercel, opcional)
Crie um projeto com **Root Directory** `guerra-pelo-brasil` (o `vercel.json` desta pasta define o build) e a
variável `VITE_SERVER_URL=https://seu-servidor.up.railway.app`. Autorize o domínio da Vercel em
`ALLOWED_ORIGINS` no servidor.

### Docker em qualquer host
```bash
docker build -t gpb . && docker run -p 8787:8787 -v gpb-data:/data -e ALLOWED_ORIGINS="*" gpb
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
  limite de conexões por IP, apelidos e chat sanitizados, verificação de origem, salas isoladas, logs
  estruturados, persistência atômica e recuperação após reinício.
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
backup/   cópia do GuerraPeloBrasil.html da versão 1.0 (também na tag git gpb-v1.0)
```

## Limitações conhecidas
- Comunicação por voz não foi implementada. A arquitetura de salas e equipes está pronta para integrá-la
  (por exemplo, WebRTC com o servidor atual fazendo a sinalização).
- Histórico e salas são persistidos em arquivos (`DATA_DIR`). PostgreSQL/Neon não foi integrado.
- O replay é registrado, mas ainda não há reprodutor.
- O teste com 10 navegadores usa o renderizador Canvas (`?renderer=canvas`), porque esta máquina de testes
  não tem GPU. Os jogadores usam WebGL normalmente.

## Fontes de dados
- Malha estadual: IBGE, via `click_that_hood/brazil-states.geojson`.
- Países vizinhos, rios e regiões geográficas: Natural Earth (domínio público).
