# Frente B — Tela Explorar (progresso)

Legenda: [x] feito · [ ] pendente · [~] em andamento

1. [x] Estado na URL (src/lib/explore-params.ts) + testes unit
2. [x] API de pontos /api/events/map
3. [x] API de lista /api/events (busca textual, ranking, cursor, distância)
4. [x] Sugestões /api/search/suggest (geocode 503 tratado na UI)
5. [x] Mapa: explore-map.tsx, markers.ts, user-location.ts
6. [x] Posição inicial (URL > localStorage > home do usuário > Brasil) + geolocalização (verificado: home RJ, "Perto de mim", permissão negada → toast)
7. [x] Layout celular (bottom sheet, chips, flutuantes)
8. [x] Layout desktop (painel lateral, popup, hover)
9. [x] Busca (overlay/dropdown, recentes, sugestões)
10. [x] Filtros (dialog) + Escolher data
11. [x] Estados (skeleton, vazio, erro, degraded verificado)
12. [x] SSR/SEO (page.tsx, generateMetadata)
13. [x] Testes integration (search-explore.test.ts) — 26 testes passando
14. [x] Dados de QA no banco dev b (scratchpad qa-b/seed-qa.mjs, nomes "[QA] ...") + screenshots revisados (celular 390 e desktop 1440, escuro e claro) + verificação final (typegen, tsc, eslint, vitest)

## Correções da retomada (2026-10-18)
- Pinos vazavam por cima do topo/sheet/busca: mapa agora é contexto de empilhamento isolado (isolate).
- Popup do desktop ficava atrás dos pinos: z-index do popup acima do selecionado.
- Sheet: alça com alvo de 44 px; conteúdo some quando recolhido; ordenação compacta no cabeçalho.
- Lista do mesmo local: compacta e rolável no celular, mapa reposiciona o local acima do sheet.
- Filtros: rodapé fixo (Limpar/Aplicar) não deixa conteúdo vazar abaixo.
- Estado vazio compacto no sheet; botão "Mapa" só com a lista em tela cheia.
- Busca enviada no celular recolhe o sheet para mostrar os resultados no mapa.
- Desktop: margens do mapa consideram os controles à direita (fitBounds/flyTo).
