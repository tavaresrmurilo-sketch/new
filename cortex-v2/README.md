# JR Córtex V2 — Business Intelligence & Operations AI

Sistema operacional inteligente para empresas de serviços B2B: CRM, pipeline, projetos, tarefas, propostas, contratos, financeiro gerencial e uma camada de inteligência (scores, forecast, Pulse, insights, Córtex AI) — multiempresa, com permissões granulares e LGPD.

> **Princípio do produto:** nada é inventado. Todo número vem dos registros do workspace; quando não há dados suficientes o sistema diz isso. Dados fictícios existem **apenas** em workspaces de demonstração, sinalizados em todas as telas.

---

## 1. Visão geral

| Área | O que existe |
|---|---|
| **Comercial** | Leads (conversão em cliente/oportunidade), Clientes 360 com saúde do relacionamento, contatos com mapa de decisão, pipeline kanban (arrastar e soltar, etapas configuráveis, motivo obrigatório ao ganhar/perder), Deal Room, Opportunity Radar (0–100, Quente/Morna/Fria/Em risco), propostas com PDF e link público com aceite, contratos com alertas 90/60/30/7 e Contract Radar |
| **Operação** | Projetos com Project Health Score e matriz de riscos, tarefas (lista, kanban, calendário, subtarefas, comentários com @menções, anexos), Smart Priority Engine (sempre sobrescrevível), reuniões com transcrição → resumo e tarefas sugeridas (confirmadas por você), documentos, mapa de capacidade da equipe |
| **Inteligência** | Dashboard com comparação justa de períodos, Morning Brief, Córtex Pulse (metodologia publicada), “O que mudou?”, Insights com amostra mínima, detecção de anomalias (sem afirmar causa), Forecast por cenários, Win/Loss, Executive Cockpit, Central de Decisões, Córtex Memory |
| **Córtex AI** | “Pergunte ao seu negócio” (consultas determinísticas com links para os registros; IA apenas como complemento), Command Center com confirmação, gerador de propostas e análise de transcrições — tudo revisado antes de salvar |
| **Automação** | Construtor QUANDO/SE/ENTÃO, Playbooks (com modelos), webhooks assinados (HMAC), API pública v1 com API keys (hash, escopos, revogação, último uso) |
| **Relatórios** | Vendas, pipeline, conversão, clientes, projetos, produtividade, propostas, contratos e receita — tela + CSV/XLSX/PDF; Relatório Executivo em PDF |
| **SaaS** | Planos no banco, FeatureGate e limites de uso, trial e status de assinatura (TRIALING/ACTIVE/PAST_DUE/CANCELED/SUSPENDED), Stripe pronto (checkout, portal, webhook), painel Super Admin (MRR, ARR, churn, ARPU, conversão de testes — apenas dados reais), modo suporte auditado, demo pública opcional |
| **Segurança/LGPD** | Sessões em banco com cookies HttpOnly, hash scrypt, RBAC, isolamento por empresa em toda consulta, proteção IDOR, rate limiting, CSP e cabeçalhos seguros, auditoria, lixeira com restauração, exportação de dados e exclusão de conta com carência |

## 2. Stack

Next.js 15 (App Router) · React 19 · TypeScript estrito · Tailwind CSS + componentes no padrão shadcn/ui (Radix) · Prisma 6 + PostgreSQL · Zod · autenticação própria por sessão em banco · Recharts · Lucide · PDFKit · fflate (XLSX) · Vitest + Playwright. Deploy alvo: **Vercel + Neon**.

## 3. Estrutura de pastas

```
cortex-v2/
├── prisma/            schema.prisma, migrations/, seed.ts
├── scripts/           run-jobs.mjs (dispara jobs via API), load-env.ts
├── src/
│   ├── app/           rotas: (marketing) site público · (auth) login/cadastro · app/(shell) aplicação · admin · api
│   ├── components/    ui/ (design system), common/ (PageHeader, DataTable, MetricCard…), charts/, shell/, forms/
│   ├── features/      UI + Server Actions por domínio (clients, leads, proposals, settings, admin…)
│   ├── server/        núcleo: auth, db/tenant, billing, modules (regras de negócio), intelligence (motores puros),
│   │                  automations, webhooks, reports, jobs, ai, pdf, security
│   ├── services/      provedores plugáveis: ai/ (Anthropic, OpenAI, Gemini, local), email/, storage/, billing/
│   ├── lib/           utilitários compartilhados (datas, formatação, rótulos, permissões, planos)
│   ├── hooks/ providers/ types/
├── tests/             unit/ e integration/ (Vitest)
├── e2e/               Playwright
└── docs/              operação (backups, jobs, segurança)
```

## 4. Pré-requisitos

- Node.js **20.9+** (recomendado 22 LTS)
- PostgreSQL 14+ (local ou Neon)
- Git

## 5. Configuração local

### Linux / macOS
```bash
cd cortex-v2
cp .env.example .env          # edite DATABASE_URL, AUTH_SECRET, APP_URL…
npm install                   # também gera o Prisma Client
npx prisma migrate deploy     # cria as tabelas
npm run db:seed               # permissões, planos e SUPER_ADMIN (opcional: SEED_DEMO=true)
npm run dev                   # http://localhost:3000
```

### Windows 11 (PowerShell)
Use os executáveis `.cmd` para evitar a política de execução de scripts do PowerShell:
```powershell
cd cortex-v2
Copy-Item .env.example .env
notepad .env
npm.cmd install
npx.cmd prisma migrate deploy
npm.cmd run db:seed
npm.cmd run dev
```

Gerar um `AUTH_SECRET`:
```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## 6. Variáveis de ambiente

Todas documentadas em [`.env.example`](./.env.example). Essenciais: `DATABASE_URL`, `AUTH_SECRET`, `APP_URL`, `CRON_SECRET`. Opcionais: IA (`AI_PROVIDER`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `LOCAL_AI_URL`), e-mail (`RESEND_API_KEY`), armazenamento (`STORAGE_PROVIDER` = `database` | `s3`), Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`), demo (`DEMO_MODE_ENABLED`). Segredos ficam somente no servidor — nada é enviado ao navegador.

## 7. Banco de dados

- Migrações versionadas em `prisma/migrations` (`npx prisma migrate deploy` em qualquer ambiente; `npm run db:migrate` para criar novas em desenvolvimento).
- Todos os modelos de negócio têm `organizationId`, `createdAt`/`updatedAt` e, quando aplicável, `createdById` e `deletedAt` (lixeira), com índices compostos por empresa.
- **Neon:** use a URL *pooled* em `DATABASE_URL`. Para rodar migrações a partir da sua máquina, a URL pooled também funciona; se preferir, rode `migrate deploy` com a URL *direct* (sem `-pooler`).

## 8. Seed e modo demonstração

`npm run db:seed` (Windows: `npm.cmd run db:seed`) é idempotente e cria:
1. catálogo de permissões e os planos padrão (configuração editável em `/admin/plans`);
2. o SUPER_ADMIN definido por `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD`;
3. com `SEED_DEMO=true`, um workspace **DEMONSTRAÇÃO** (`demo@jrcortex.local`).

Produção começa limpa: sem `SEED_DEMO`, nenhum dado fictício é criado. A demo pública (`/demo`, com `DEMO_MODE_ENABLED=true`) cria workspaces temporários que a rotina de retenção remove após `retention.demoHours`.

## 9. Córtex AI

A IA é opcional e abstraída (`src/services/ai`). Configure **um** provedor:

| Provedor | Variáveis |
|---|---|
| Anthropic (Claude) | `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` (`AI_MODEL` opcional) |
| OpenAI | `AI_PROVIDER=openai`, `OPENAI_API_KEY` |
| Google Gemini | `AI_PROVIDER=gemini`, `GOOGLE_GENERATIVE_AI_API_KEY` |
| Local (Ollama/compatível OpenAI) | `AI_PROVIDER=local`, `LOCAL_AI_URL` |

Sem provedor, nada quebra: os recursos generativos mostram “Configure um provedor de IA para utilizar o Córtex AI.” e as consultas diretas continuam funcionando. Cálculos (scores, forecast, prioridades, saúde, Pulse) nunca usam IA. Uso por empresa é limitado pelo plano e registrado em `AIUsage`.

## 10. Jobs agendados

Endpoint: `GET|POST /api/cron/<job>` com `Authorization: Bearer <CRON_SECRET>`. Jobs: `contracts-expiring`, `follow-ups`, `projects-at-risk`, `overdue-tasks`, `morning-brief`, `metric-snapshots`, `priority-recompute`, `webhook-retries`, `retention` e `daily` (todos em sequência). São idempotentes.

- **Vercel:** `vercel.json` já agenda `/api/cron/daily` às 09:00 UTC (defina `CRON_SECRET` no projeto; a Vercel envia o header automaticamente).
- **Retentativas de webhooks** mais frequentes: agende `/api/cron/webhook-retries` de hora em hora em um cron externo (ex.: GitHub Actions, cron-job.org).
- **Manual/servidor próprio:** `npm run jobs:run -- daily` (Windows: `npm.cmd run jobs:run -- daily`), com a aplicação no ar.

Detalhes em [`docs/operacao.md`](./docs/operacao.md).

## 11. Testes e qualidade

```bash
npm run lint
npm run typecheck
npm run test                                   # unitários (integração é pulada sem banco de testes)
TEST_DATABASE_URL="postgresql://…/cortex_test" npm run test   # inclui integração (isolamento multi-tenant, IDOR, fluxos)
BASE_URL=http://localhost:3000 npm run test:e2e              # Playwright (app rodando)
npm run build
```
Windows: `npm.cmd run test`, `$env:TEST_DATABASE_URL="..."; npm.cmd run test`. O banco de testes precisa das migrações (`npx.cmd prisma migrate deploy` apontando para ele).

Cobertura: motores de inteligência (forecast, radar, prioridade, saúde, capacidade, Pulse, insights com amostra mínima, anomalias), cálculo de propostas, ROI, matriz de riscos, condições de automação, RBAC, FeatureGate, política de acesso por assinatura, hash de senhas e tokens, cifragem de segredos, exportação CSV/XLSX (anti-injeção de fórmulas), assinatura do webhook Stripe; integração: isolamento entre empresas, IDOR, lixeira, criação de projeto, pipeline ponderado, automações e prioridade automática; E2E: landing, proteção de rotas, login inválido e cadastro com onboarding.

## 12. Deploy na Vercel + Neon

1. **Neon:** crie o projeto/banco e copie a connection string *pooled*.
2. **Vercel → Add New Project →** importe este repositório.
3. **Root Directory: `cortex-v2`** (importante: a raiz do repositório contém a versão anterior do sistema).
4. Framework: Next.js. **Build Command:** `npm run vercel-build` (gera o Prisma Client, aplica migrações e compila). Install Command padrão.
5. **Environment Variables:** `DATABASE_URL`, `AUTH_SECRET`, `APP_URL` (URL final), `CRON_SECRET` e os opcionais desejados.
6. Deploy. Depois, rode o seed uma vez da sua máquina apontando para o Neon:
   ```powershell
   $env:DATABASE_URL="postgresql://...neon.../db?sslmode=require"
   $env:SUPER_ADMIN_EMAIL="voce@empresa.com.br"; $env:SUPER_ADMIN_PASSWORD="UmaSenhaForte2026"
   npm.cmd run db:seed
   ```
7. Stripe (opcional): crie os preços, informe os IDs em `/admin/plans` e cadastre o webhook `https://SEU_DOMINIO/api/billing/stripe/webhook` (eventos `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`).

Via CLI (Windows): `npm.cmd i -g vercel`, depois `vercel.cmd link`, `vercel.cmd env add DATABASE_URL`, `vercel.cmd --prod`.

## 13. Segurança

Sessões opacas armazenadas como hash (HMAC-SHA256) com expiração absoluta e por inatividade; senhas com scrypt; RBAC com ~50 permissões e papéis personalizáveis; extensão Prisma que injeta `organizationId` em todas as operações de modelos de tenant e valida FKs recebidas (anti-IDOR); Server Actions com validação Zod, verificação de permissão e de modo somente leitura; proteção CSRF nativa das Server Actions + `SameSite`; rate limiting em login, cadastro, IA, exportações, API e demo; CSP e cabeçalhos seguros; guarda SSRF para webhooks; segredos de webhook cifrados (AES-256-GCM); API keys exibidas uma única vez e armazenadas como hash; exportações neutralizam fórmulas; modo suporte do Super Admin é somente leitura e auditado. Detalhes em [`docs/seguranca.md`](./docs/seguranca.md).

## 14. Backups e retenção

O sistema **não simula backups**. Use os backups do provedor de banco: no Neon, *Point-in-time restore* (histórico conforme o plano) e *branches* para restauração/teste; complemente com `pg_dump` periódico para armazenamento externo. Retenções configuráveis em `/admin/system` (lixeira, auditoria, demos, carência de exclusão). Arquivos em `STORAGE_PROVIDER=s3` devem ter versionamento/backup no próprio bucket. Ver [`docs/operacao.md`](./docs/operacao.md).

## 15. Roadmap / integrações futuras

Marcadas como “Integração futura” na interface, sem simulação: Google Calendar/Outlook, Gmail/Outlook (timeline), WhatsApp Business (registro, nunca envio automático), ERP/NF-e, assinatura eletrônica, Mercado Pago, autenticação em dois fatores e resumos por e-mail. Zapier/Make já podem se conectar pela API v1 e pelos webhooks.

---

### Nota sobre a versão anterior
A aplicação anterior permanece na raiz do repositório, intacta. A V2 vive integralmente em `cortex-v2/`; para publicá-la, aponte o *Root Directory* do projeto na Vercel para `cortex-v2`. Quando a V2 estiver validada, a versão antiga pode ser removida em um commit separado.
