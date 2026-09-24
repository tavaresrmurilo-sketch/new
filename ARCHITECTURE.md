# Arquitetura — JR Cortex AI

## Visão geral

```
SISTEMAS DA EMPRESA (ERP, CRM, financeiro, planilhas, APIs, bancos)
        ↓
CONECTORES  (src/server/connectors — adapters/providers modulares)
        ↓
INGESTÃO    (src/server/cortex/ingest.ts — Ingestor)
        ↓
VALIDAÇÃO   (src/server/cortex/records.ts — schemas Zod canônicos)
        ↓
NORMALIZAÇÃO (referências por externalId/nome, status de títulos, datas UTC, valores decimais)
        ↓
CORTEX      (PostgreSQL — modelo normalizado, tudo com tenantId)
        ↓
CAMADA ANALÍTICA (src/server/analytics — consultas parametrizadas e agregações no banco)
        ↓
INTELIGÊNCIA ARTIFICIAL (src/server/ai — intenção → ferramentas internas → fatos → redação verificada)
        ↓
DASHBOARDS · RELATÓRIOS · CHAT (src/app)
```

Princípios:

1. **Nenhum número é inventado.** Todo valor exibido vem da camada analítica, que devolve dados + metadados (`AnalysisMeta`: período, comparação, fontes, última atualização, filtros e memória de cálculo).
2. **A IA nunca toca o banco.** Ela escolhe ferramentas internas tipadas e, opcionalmente, redige a resposta a partir de fatos mínimos; o texto é verificado numericamente.
3. **Isolamento por empresa em todas as camadas** (sessão → contexto → consultas com `tenantId` → extensão Prisma de defesa em profundidade).
4. **Agregação no backend.** O navegador recebe séries e totais, nunca milhares de registros.

## Estrutura de pastas

```
prisma/
  schema.prisma          modelo de dados completo
  migrations/            migrations versionadas
  seed.ts                RBAC + SUPER_ADMIN + tenant JR Demo (dados demonstrativos)
samples/                 planilhas de exemplo para importação
scripts/
  run-jobs.ts            rotinas agendadas (cron)
  ask.ts                 utilitário de desenvolvimento: perguntas ao Cortex via CLI
src/
  app/
    (auth)/              login e cadastro de empresa
    (app)/               área autenticada (layout com sidebar/topbar)
      dashboard, chat, insights, financeiro/*, comercial/*, projecoes, cenarios,
      relatorios, reuniao, cortex, integracoes, auditoria, configuracoes, onboarding
    admin/               JR Admin (plataforma)
    api/                 route handlers (auth, chat, import, integrations, reports, settings, privacy, jobs...)
  components/
    ui/                  primitivas no padrão shadcn/ui (Radix + Tailwind + CVA)
    charts/              wrapper Recharts (eixo único, tooltip, legenda)
    cortex/              KPI, blocos de resposta, "Ver cálculo", markdown seguro, assistente de importação
    layout/              sidebar, topbar, busca global, filtro de período
  lib/                   utilitários puros (datas, formatação, planos, simulador de cenários, env, logger, db)
  server/
    auth/                sessões, senhas, permissões (RBAC), guards de página/API
    security/            cripto (vault AES-256-GCM, HMAC de tokens), rate limit, sanitização
    analytics/           DRE, vendas, clientes, produtos, finanças, caixa, comparação, projeções, cenários, insights
    cortex/              registros canônicos, ingestão idempotente, importação CSV/XLSX, mapeamento de colunas
    connectors/          contrato de provider, registro, providers, vault de credenciais, motor de sincronização
    ai/                  tipos, planejador por regras, parser de períodos, ferramentas, provedores, orquestrador, guarda
    reports/             construtor de relatórios e renderizadores PDF/XLSX/CSV
    jobs/                agendador (sincronizações, insights, limpeza)
    audit.ts, tenant.ts, errors.ts, request.ts, page-period.ts
  middleware.ts          barreira de sessão na borda
tests/                   Vitest (unitários + integração com PostgreSQL)
```

## Camadas

### Apresentação (`src/app`, `src/components`)
- Server Components buscam dados diretamente da camada analítica (sem ida e volta HTTP).
- Client Components apenas para interação (chat, filtros, formulários, gráficos).
- Filtro global de período via query string (`?period=`, `?start=&end=`), resolvido por `server/page-period.ts`.
- Loading com skeletons (`loading.tsx`), erros com `error.tsx`, empty states e toasts (Sonner). Dark mode via `next-themes`.

### API (`src/app/api`)
Todas as rotas usam `apiRoute()` (`server/auth/guard.ts`): verificação de origem (CSRF), erros padronizados (`AppError`, `ZodError` → 422), logs estruturados. Autorização com `requireApi(permission)`; entrada validada por Zod.

### Domínio analítico (`src/server/analytics`)
- `dre.ts` — DRE com classificação de categorias pelo plano de contas do cliente (com fallback heurístico sinalizado).
- `sales.ts` — resumo comercial, rankings por dimensão, produtos, clientes (aumentos, reduções, inativos, concentração).
- `finance.ts` — despesas, posição de caixa, projeção diária, contas a pagar/receber.
- `series.ts` — resultado mensal em 3 consultas agregadas.
- `compare.ts`, `forecast.ts`, `scenarios.ts` (+ `lib/scenario-sim.ts` puro), `insights.ts`, `dre-analysis.ts`, `overview.ts`.

Todas as funções recebem `AnalyticsCtx { tenantId, today, timezone, permissions, minCashBalance }` e retornam `Analysis<T> { data, meta, sufficient }`.

### Cortex (`src/server/cortex`)
Modelo canônico (`records.ts`) → `Ingestor` idempotente (upsert por `(tenantId, dataSourceId, externalId)`), resolução de referências e cálculo de status. A importação de planilhas (`import.ts`, `mapping.ts`) faz parsing, detecção de colunas por nome + conteúdo, mapeamento sugerido e só ingere após confirmação.

### Conectores (`src/server/connectors`)
Contrato `ConnectorProvider` (teste de conexão + fetch paginado com cursor incremental). Veja [INTEGRATIONS.md](INTEGRATIONS.md).

### IA (`src/server/ai`)
Veja [AI.md](AI.md).

## Fluxos principais

**Pergunta no chat**: `POST /api/chat` → sessão/permissão/rate limit → `askCortex` → planejador (LLM com tool calling ou regras) → `runTool` (checa permissão da ferramenta, valida entrada, consulta a camada analítica) → narrativa determinística → (opcional) LLM redige a partir de fatos → verificação numérica → mensagem salva com blocos e trace → audit log.

**Importação**: upload → `ImportJob` com cabeçalhos, amostra e mapeamento sugerido → usuário confirma/corrige → `processImportJob` → transformação linha a linha → `Ingestor` → estatísticas (processados, novos, atualizados, rejeitados, erros por linha) → insights recalculados.

**Sincronização**: manual (`/api/integrations/:id/sync`) ou agendada (`runDueSyncs` via cron) → `SyncJob` com logs, contadores, cursor de/até → atualização de `Integration.lastSyncAt/nextSyncAt/syncCursor`.

## Background jobs
`src/server/jobs/scheduler.ts` executa sincronizações vencidas, análise periódica de insights e limpeza de sessões. Disparo: `npm run jobs:run` (cron) ou `POST /api/jobs/run` com `Authorization: Bearer $CRON_SECRET`. A interface está pronta para migrar para uma fila (pg-boss/BullMQ) sem alterar o domínio.

## Performance
- Agregações `SUM/COUNT/GROUP BY date_trunc` no PostgreSQL; índices compostos por `(tenantId, data)`, `(tenantId, status, vencimento)`, etc.
- Paginação no audit log e limites em listas; séries mensais em uma consulta por entidade.
- `React.cache` na sessão por requisição; memoização do simulador no cliente.
- Ingestão com cache de referências e transações por venda; `createMany` no seed.
