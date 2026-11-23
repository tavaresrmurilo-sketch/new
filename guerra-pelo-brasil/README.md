# GUERRA PELO BRASIL — CONQUISTA TOTAL

Jogo de estratégia militar em tempo real (RTS 2D) para navegador. Num universo fictício e
**satírico**, o Exército Lula (vermelho) e o Exército Bolsonaro (azul) disputam os
**26 estados e o Distrito Federal** num mapa com as fronteiras estaduais reais do Brasil.

> **Aviso.** Obra de ficção satírica que ridiculariza a polarização política, em que cada lado
> acusa o outro de “nazista” ou “comunista”. Hitler e Stalin aparecem como caricaturas ridículas.
> Na vida real, foram ditadores responsáveis por crimes contra a humanidade. O jogo não glorifica
> o nazismo, o stalinismo nem qualquer político, e não usa símbolos reais desses regimes: as
> bandeiras e os emblemas das facções são fictícios.

## Como jogar no Windows 11 (sem instalar nada)

Abra `jogar/GuerraPeloBrasil.html` com duplo clique. O arquivo é único (cerca de 1,7 MB, com
código, arte e áudio embutidos) e funciona no Edge ou no Chrome, sem servidor e sem internet. O
progresso fica salvo no próprio navegador (localStorage).

## Desenvolvimento

Requisitos: Node.js 20 ou mais recente.

```bash
npm install
npm run dev        # servidor de desenvolvimento (http://localhost:5173)
npm test           # 36 testes automatizados, incluindo partidas completas simuladas
npm run build      # typecheck + build de produção em dist/index.html (arquivo único)
npm run release    # build + copia para jogar/GuerraPeloBrasil.html
npm run map        # regenera src/data/brazil-map.json a partir da malha estadual
```

## O que existe no jogo

- **Mapa real.** Polígonos dos 27 estados (malha do IBGE) projetados e simplificados com a
  topologia preservada: as fronteiras compartilhadas são idênticas e a adjacência é exata (51 fronteiras).
  As capitais ficam nas coordenadas reais, e os países vizinhos aparecem para dar contexto. Tem
  zoom pela roda do mouse e por pinça, câmera livre, minimapa e frentes de combate animadas.
- **Unidades com comportamento real.** Infantaria, tanques, artilharia (projéteis em arco com dano
  em área), helicópteros, caças-bombardeiros (surtidas com munição e combustível limitados, com
  retorno à base aérea para rearmar) e apoio logístico (repara, cura, reabastece). Cada unidade
  tem vida, velocidade, dano, alcance, recarga, custo, tempo de produção e efetivo. As unidades
  terrestres usam A* por terra.
- **Conquista por combate.** Cada capital tem uma guarnição que atira e se regenera. Para tomar um
  estado, é preciso destruir a guarnição, eliminar os defensores e manter infantaria ou tanques na
  capital até completar a ocupação.
- **Economia e logística.** Dinheiro, combustível, aço, suprimentos e capacidade industrial.
  Estados desconectados da sede rendem metade. Tropas fora da linha de suprimento perdem dano e
  sofrem desgaste, e há manutenção contínua de combustível e suprimentos. Há limite de tropas e um
  mercado de troca de recursos. Também há quartéis, fábricas, bases aéreas, depósitos e três
  níveis de fortificação.
- **Comandantes.** Hitler (Ofensiva Relâmpago, Ataque Coordenado e Mobilização Blindada) e Stalin
  (Esforço Industrial, Mobilização em Massa e Resistência Férrea), com custo, duração e recarga,
  além de passivas por facção.
- **IA estratégica** com quatro dificuldades. Ela avalia ameaças a cada estado, defende a sede e
  forma grupos de ataque dimensionados pela defesa do alvo (incluindo reforços prováveis). Também
  reagrupa, recua, contra-ataca estados perdidos, adapta a produção aos recursos e ao limite de
  tropas, constrói, usa o mercado e ativa as habilidades dos comandantes. Ela usa exatamente os
  mesmos comandos que o jogador.
- **Modos:** Campanha (objetivos com recompensa e salvamento automático), Batalha rápida
  (dificuldade, distribuição territorial, recursos e ritmo), Dois jogadores locais (turnos
  simultâneos: planejamento alternado e execução de 15 s) e Sandbox (recursos ilimitados, IA
  opcional e troca de lado).
- **Vitória:** dominar os 27 territórios ou eliminar o inimigo. Uma facção **se rende** quando
  controla 2 estados ou menos enquanto o adversário controla 15 ou mais. Também é possível se
  render pelo menu.
- **Apresentação:** menu cinematográfico animado, retratos caricaturais em SVG, trilha militar
  original e efeitos sonoros sintetizados em tempo real (WebAudio), partículas, rastros de tiro,
  explosões e destroços.

## Controles

| Ação | Mouse/teclado | Toque |
|---|---|---|
| Selecionar | clique; arrastar = área; `Shift` adiciona; duplo clique = mesmo tipo | tocar; botão **Área** |
| Ordem (mover/atacar/tomar capital) | botão direito | tocar no mapa com tropas selecionadas |
| Ataque-movimento / parar / manter | `Q` / `X` / `H` | botões de ação |
| Câmera | arrastar com o botão direito ou do meio, `WASD`/setas, roda = zoom | arrastar e pinça |
| Grupos | `Ctrl`+`1-9` cria, `1-9` seleciona | — |
| Habilidades do comandante | `Z` `C` `V` | painel Comando |
| Pausa / velocidade | `Espaço`, `+`/`-` | barra superior |

## Arquitetura

```
src/
  sim/          simulação determinística e independente do Phaser (roda no navegador e nos testes)
    game.ts       laço, movimento, combate, captura, economia, suprimento, habilidades, vitória
    ai/ai.ts      IA estratégica
    map.ts nav.ts geometria real, raster de estados, A* por terra
    setup.ts      cenários iniciais; objectives.ts; types.ts (estado 100% serializável)
  scenes/       Phaser 3: MenuScene (fundo animado) e GameScene (mapa, unidades, efeitos, entrada)
  render/       texturas procedurais
  ui/           HUD e menus em DOM, arte SVG, ajuda
  audio/        música e efeitos via WebAudio
  persist/      localStorage (configurações e saves)
scripts/build-map.mjs   converte data/raw/brazil-states.geojson em src/data/brazil-map.json
tests/                  mapa, combate, captura, economia, IA, save e partidas completas
```

O desempenho foi medido no Chromium: a simulação custa cerca de 0,2 ms por passo, e a lógica
somada à interface fica abaixo de 1 ms por quadro com cerca de 100 unidades em campo. O heap fica
em torno de 30 MB.

## Fontes de dados

- Malha estadual: IBGE, via `click_that_hood/brazil-states.geojson`.
- Países vizinhos: Natural Earth (`world-atlas`, domínio público).
