# Frente F — Administração (/admin), moderação, denúncias e rotinas — progresso

Legenda: [x] feito · [ ] pendente · [~] em andamento

1. [x] Acesso: requireAdmin/assertAdmin, auto-proteção, audit em todas as ações
2. [x] Visão geral /admin (KPIs, gráfico SVG 30 dias, MRR, atalhos)
3. [x] Moderação /admin/moderacao (aprovar / recusar / confiar / despublicar)
4. [x] Denúncias /admin/denuncias
5. [x] Usuários /admin/usuarios
6. [x] Organizações /admin/organizacoes
7. [x] Categorias / Planos / Configurações
8. [x] E-mails / Auditoria / Rotinas
9. [x] Jobs (reminders, maintenance, daily) + /api/cron/[job] + scripts/run-job.ts
10. [x] UI do admin (layout, tabelas→cards, filtros na URL, paginação, confirmações, toasts)
11. [x] Testes de integração
12. [x] QA visual com dados [QA]

## Observações
- Camada de serviço escrita: src/server/{admin,moderation,jobs}/*, /api/cron/[job], scripts/run-job.ts (CLI testada no banco dev_f). Ações: admin/actions.ts, moderation/actions.ts. Próximo: testes → UI.
- 2026-10-18: início (nenhum arquivo da área existia).
- Testes: moderation-review (10), admin-platform (12), jobs-routines (6) passando.
- Páginas prontas: layout/shell, /admin, /admin/moderacao, /admin/denuncias, /admin/usuarios(+[id]), /admin/organizacoes(+[id]). Pendentes: categorias, planos, configurações, e-mails(+[id]), auditoria, rotinas.
- QA: dados [QA] no mixtour_dev_f criados por script no scratchpad (qa-f-seed.ts).
- Todas as páginas do /admin prontas (categorias, planos, configurações, e-mails(+[id]), auditoria, rotinas). Fluxos testados no navegador (recusar, aprovar e confiar, resolver denúncia despublicando, executar rotina, alterar plano, suspender conta, criar categoria). eslint limpo nos arquivos da frente.
- Concluído: dev server reiniciado, 12 rotas do /admin sem erros de console/hidratação; typegen + tsc (0 erros no projeto), eslint limpo, 28 testes passando.
