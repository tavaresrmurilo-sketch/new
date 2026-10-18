# Frente E — Comercial (Stripe, planos, equipe/convites, páginas públicas, legais) — progresso

Legenda: [x] feito · [ ] pendente · [~] em andamento

1. [x] Stripe: src/server/billing/{stripe,sync,service,actions,webhook}.ts + /api/billing/webhook (testes 31 ok)
2. [ ] /painel/plano (page + componentes em src/components/pricing)
3. [~] /painel/equipe — serviço/ações prontos (src/server/team); falta página + testes
4. [ ] /convite/[token]
5. [ ] /para-organizadores + (marketing)/layout.tsx + components/marketing, components/pricing
6. [ ] /termos e /privacidade
7. [~] Testes: billing-sync unit + billing-webhook ok; faltam team-* integração
8. [ ] QA visual

## Observações
- 2026-10-18: início (nenhum arquivo da área existia).
- 2026-10-18 (retomada): server de billing/team revisado e ok; testes billing passando.
