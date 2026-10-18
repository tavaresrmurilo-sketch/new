# Frente C — Painel do organizador e ciclo de vida dos eventos (progresso)

Legenda: [x] feito · [ ] pendente · [~] em andamento

1. [x] Layout do painel (sidebar desktop, topo + abas no celular, seletor de org, "Ver como público")
2. [x] Onboarding /painel/comecar (criar organização, slug único, OWNER)
3. [x] Visão geral /painel (alertas, KPIs 30d, uso do plano, próximos, checklist)
4. [x] Lista /painel/eventos (filtros, busca, ações)
5. [x] Editor novo/[id] (etapas no celular, seções + prévia no desktop) + validação compartilhada
6. [x] Serviço do ciclo de vida (src/server/events/service.ts) + actions + organizer-queries.ts
7. [x] LocationPicker
8. [x] ImageUpload
9. [x] /painel/locais (CRUD Venue) e /painel/organizacao
10. [x] Estatísticas + charts.tsx + CSV
11. [x] Testes: tests/unit/event-validation.test.ts (21), tests/integration/events-lifecycle (27), organizations-onboarding (7), venues-limits (5) — passando
12. [x] QA Playwright + screenshots (fluxo completo; visão geral, eventos, editor, locais, organização e estatísticas nos dois temas e tamanhos)

## Observações
- Server: src/lib/validation/{event,organization}.ts, src/server/organizations/{service,venues,actions}.ts, src/server/events/{service,actions,organizer-queries}.ts prontos.
- Rascunho sem data usa UNSET_DATE (epoch 0) — colunas startsAt/endsAt são NOT NULL.
- 2026-10-18: início (nenhum arquivo da área existia).
- QA: dev servers paralelos geram loop de reload do HMR (Turbopack manda "restart"); scripts em scratchpad/qa-c filtram essa mensagem via routeWebSocket (shot.mjs, create-event.mjs).
- Fluxo real validado: cadastro → verificação → /painel/comecar → logo → editor completo → Enviar para análise.
- CSS do MapLibre força position: relative no container do mapa — usar size-full (não absolute inset-0). MiniMap (frente B2) tem o mesmo padrão.
- Retomada (2ª tentativa): tsc/eslint/vitest verdes (60 testes). Ajustes de QA: KPIs alinhados pelo valor (rótulo de 2 linhas), barra de uso oculta quando o limite é ilimitado, divisor extra no topo do formulário da organização, área de upload 3:1 com altura mínima e texto "Escolher imagem" no celular, erros do formulário de locais somem assim que o campo é corrigido.
- CRUD de locais validado pelo navegador (503 do geocodificador → aviso + "Usar minha localização"/pino manual).
- /painel/equipe ainda não existe no disco (frente E); o link da navegação depende dela.
