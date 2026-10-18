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
12. [~] QA Playwright + screenshots

## Observações
- Server: src/lib/validation/{event,organization}.ts, src/server/organizations/{service,venues,actions}.ts, src/server/events/{service,actions,organizer-queries}.ts prontos.
- Rascunho sem data usa UNSET_DATE (epoch 0) — colunas startsAt/endsAt são NOT NULL.
- 2026-10-18: início (nenhum arquivo da área existia).
- QA: dev servers paralelos geram loop de reload do HMR (Turbopack manda "restart"); scripts em scratchpad/qa-c filtram essa mensagem via routeWebSocket (shot.mjs, create-event.mjs).
- Fluxo real validado: cadastro → verificação → /painel/comecar → logo → editor completo → Enviar para análise.
- CSS do MapLibre força position: relative no container do mapa — usar size-full (não absolute inset-0). MiniMap (frente B2) tem o mesmo padrão.
