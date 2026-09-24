# JR Cortex AI

**Inteligência empresarial conectada aos seus dados.**
*Transforme os dados da sua empresa em decisões.* — um produto **JR Consultorias**.

O JR Cortex AI é um SaaS multiempresa que funciona como um **analista de dados virtual**: conecta-se aos sistemas da empresa (ou recebe planilhas), organiza tudo em um núcleo de dados normalizado — o **Cortex** — e entrega dashboards, DRE, fluxo de caixa, projeções, relatórios e um chat que responde perguntas em linguagem natural **sem inventar números**: todo valor é calculado a partir da base e pode ser auditado em "Ver cálculo".

---

## Funcionalidades

| Módulo | O que faz |
|---|---|
| **Visão Executiva** | Faturamento, receita líquida, lucro, margem, EBITDA, caixa, a receber/a pagar (hoje/mês/ano) e 6 gráficos |
| **Pergunte ao Cortex** | Chat com ferramentas internas, rastreabilidade (período, fonte, atualização, filtros), "Ver cálculo", feedback 👍/👎 e "Corrigir resposta" |
| **Insights** | Detecção periódica por regras objetivas (Informação, Oportunidade, Atenção, Crítico) com evidência |
| **DRE Inteligente** | Mês/trimestre/semestre/ano/intervalo, % da receita, comparação, variação, plano de contas configurável e **Análise do Cortex** |
| **Fluxo de Caixa** | Saldo inicial, entradas/saídas previstas, saldo diário, 7/15/30/60/90 dias, dias de atenção |
| **Contas a Pagar / Receber** | Totais, vencimentos, vencidos, inadimplência, agrupamentos |
| **Comercial** | Vendas, clientes (aumentos, reduções, inativos, concentração), produtos (margem, crescimento), vendedores |
| **Projeções** | Receita, despesas, resultado e caixa — sempre separando REALIZADO / PREVISTO / PROJETADO |
| **Cenários** | Conservador, base e otimista com premissas ajustáveis |
| **Relatórios** | DRE, caixa, vendas, clientes, produtos, a pagar, a receber, gerencial, **Relatório Executivo** (PDF, Excel, CSV) |
| **Prepare minha reunião** | Resumo, KPIs, 5 acontecimentos, problemas, oportunidades, perguntas recomendadas, gráficos |
| **Cortex / Knowledge** | Visão do núcleo de dados e memória organizacional controlada e auditável |
| **Integrações** | Conectores modulares, Credentials Vault, sincronização manual/agendada/incremental/reprocessamento, logs |
| **Importação** | CSV/XLSX com detecção de colunas, mapeamento sugerido e confirmação antes de importar |
| **Auditoria, Configurações, LGPD** | Audit log, empresa, usuários/RBAC, plano de contas, retenção, exportação/exclusão, acesso de suporte |
| **JR Admin** | Painel da plataforma (clientes, uso, erros, planos) sem acesso a dados financeiros sem autorização |
| **Onboarding** | 6 etapas até "Seu Cortex está pronto." |
| **Modo demonstração** | Tenant **JR Demo** com DADOS DEMONSTRATIVOS (26 meses fictícios) |

---

## Requisitos

- Node.js **20.9+** (testado com 22)
- PostgreSQL **14+** (testado com 16)
- npm 10+

## 1. Instalar

```bash
git clone <repo> jr-cortex-ai && cd jr-cortex-ai
npm install
```

## 2. Configurar o PostgreSQL

Com Docker:

```bash
docker run -d --name jrcortex-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=jrcortex -p 5432:5432 postgres:16
```

Ou em uma instalação local:

```bash
createdb jrcortex            # ou: psql -c "CREATE DATABASE jrcortex;"
```

## 3. Configurar o `.env`

```bash
cp .env.example .env
```

Preencha no mínimo:

| Variável | Como gerar / exemplo |
|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/jrcortex?schema=public` |
| `AUTH_SECRET` | `openssl rand -base64 48` (mínimo 32 caracteres) |
| `ENCRYPTION_KEY` | `openssl rand -base64 32` (chave do Credentials Vault — **não perca**: credenciais cifradas dependem dela) |
| `AI_PROVIDER` | `rules` (motor interno, sem chave) · `claude` · `openai` · `gemini` · `local` |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` |

Chaves de IA (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY`, `LOCAL_LLM_URL`) são opcionais — veja [AI.md](AI.md). Nunca commite chaves reais.

## 4. Executar as migrations

```bash
npx prisma migrate deploy     # produção / CI
# ou, em desenvolvimento:
npm run db:migrate
```

## 5. Popular o ambiente demo

```bash
npm run db:seed
```

Cria permissões e papéis, o usuário **SUPER_ADMIN** da JR e o tenant **JR Demo** (DADOS DEMONSTRATIVOS). Credenciais padrão (altere via variáveis `SEED_ADMIN_PASSWORD` / `SEED_DEMO_PASSWORD` antes de rodar em qualquer ambiente compartilhado):

| Perfil | E-mail | Senha padrão |
|---|---|---|
| JR Admin (SUPER_ADMIN) | `admin@jrconsultorias.com.br` | `JrCortex@2026admin` |
| Administrador do cliente | `admin@demo.jrcortex.com.br` | `Demo@2026cortex` |
| Diretor / Financeiro / Comercial / Analista / Viewer | `diretor@`, `financeiro@`, `comercial@`, `analista@`, `viewer@demo.jrcortex.com.br` | `Demo@2026cortex` |

O seed é idempotente: rodá-lo novamente recria apenas o tenant JR Demo. Use `SEED_SKIP_DEMO=1` para não criar dados demonstrativos.

## 6. Desenvolvimento

```bash
npm run dev          # http://localhost:3000
npm run lint         # ESLint
npm run typecheck    # TypeScript strict
npm test             # Vitest (unitários + integração com PostgreSQL)
npm run jobs:run     # rotinas agendadas (sincronizações, insights, limpeza de sessões)
```

Arquivos de exemplo para importação estão em [`samples/`](samples/).

## 7. Build

```bash
npm run build        # prisma generate + next build
npm start            # servidor de produção na porta 3000
```

## 8. Deploy

Veja [DEPLOYMENT.md](DEPLOYMENT.md) (Docker, Vercel/Render/Railway, VM com PM2/Nginx, cron de jobs, backups e checklist de segurança).

---

## Documentação

- [ARCHITECTURE.md](ARCHITECTURE.md) — camadas, estrutura de pastas e fluxos
- [DATABASE.md](DATABASE.md) — modelo de dados, índices, idempotência e multitenancy
- [INTEGRATIONS.md](INTEGRATIONS.md) — conectores, sincronização, importação e como criar um novo adapter
- [AI.md](AI.md) — arquitetura segura da IA, ferramentas internas, provedores e verificação anti-alucinação
- [SECURITY.md](SECURITY.md) — autenticação, RBAC, criptografia, auditoria e LGPD
- [DEPLOYMENT.md](DEPLOYMENT.md) — implantação e operação

## Stack

Next.js 15 (App Router) · React 19 · TypeScript strict · Tailwind CSS · componentes no padrão shadcn/ui (Radix) · Recharts · Prisma 6 · PostgreSQL · Zod · autenticação própria com sessões em banco (equivalente ao Auth.js) · Lucide · PDFKit · ExcelJS · Vitest.
