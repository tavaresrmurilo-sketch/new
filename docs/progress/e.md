# Frente E — Comercial (Stripe, planos, equipe/convites, páginas públicas, legais) — progresso

Legenda: [x] feito · [ ] pendente · [~] em andamento

1. [x] Stripe: src/server/billing/{stripe,sync,service,actions,webhook}.ts + /api/billing/webhook
2. [x] /painel/plano — page + src/components/pricing/{pricing.ts,pricing-table.tsx,portal-button.tsx}; QA ok (sem Stripe, editor só leitura, assinatura em atraso/cancelando simuladas)
3. [x] /painel/equipe — page + team-manager.tsx (convite, reenviar, cancelar, papéis, transferência, remover, sair); QA ok
4. [x] /convite/[token] — page + accept-form + switchAccountForInviteAction; fluxo real testado (convite pela UI → e-mail no outbox → aceitar → /painel)
5. [x] /para-organizadores + (marketing)/layout.tsx + components/marketing (map-mock, faq, legal, marketing-header); QA ok
6. [x] /termos e /privacidade — LegalDocument; QA ok
7. [x] Testes: billing-sync (unit), billing-webhook, billing-checkout, team-invites, team-roles — 60 passando
8. [x] QA visual (celular/desktop, escuro/claro)

## Observações
- Dados de QA só no banco de dev (mixtour_dev_e): qa-e-owner@teste.dev, qa-e-guest@teste.dev, organização id qa_e_org.
- Fluxos do Stripe testados com cliente falso (sem rede/chaves); checkout real não foi exercitado.
- Textos legais têm campos [a completar] (razão social, CNPJ, DPO, provedor de hospedagem, foro).
