# Mixtour

Plataforma mobile-first de descoberta de eventos em mapa interativo + SaaS para organizadores
(planos pagos via Stripe). Idioma do produto: português do Brasil.

- **Leia `docs/CONVENTIONS.md` antes de escrever código** (camadas, segurança, formulários, UI, testes).
- Next.js 16: veja `AGENTS.md` e a documentação local em `node_modules/next/dist/docs/`.
- Nunca invente eventos, organizações, números ou integrações. Sem dados → estado vazio honesto.
- Comandos: `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, `npm run test:e2e`.
- Banco local: PostgreSQL em localhost:5432 (usuário/senha postgres). `npm run db:deploy && npm run db:seed`.
