# Banco de dados — JR Cortex AI

PostgreSQL + Prisma 6. Schema completo em [`prisma/schema.prisma`](prisma/schema.prisma); migrations em `prisma/migrations`.

## Regras gerais

- **Toda entidade empresarial carrega `tenantId`** com `onDelete: Cascade` a partir de `Tenant`.
- **Idempotência**: entidades do Cortex têm `@@unique([tenantId, dataSourceId, externalId])`. Conectores e importações fazem *upsert* por essa chave — sincronizar ou reimportar nunca duplica registros.
- **Valores monetários** em `Decimal(18,2)`; quantidades em `Decimal(18,4)`. Agregações são feitas no banco e convertidas para `number` apenas na apresentação.
- **Datas de negócio** em `@db.Date` (sem hora); "hoje" é calculado no fuso do tenant.
- **Rastreabilidade**: cada registro aponta para a `DataSource` de origem, usada para informar "Fonte" e "Dados atualizados" nas respostas.

## Entidades

### Plataforma e identidade
| Modelo | Descrição |
|---|---|
| `Tenant` | Empresa cliente: dados cadastrais, moeda, timezone, exercício fiscal, metas, caixa mínimo, plano, status, flags de demo/onboarding e privacidade (retenção, consentimento de IA, treinamento externo sempre `false`) |
| `Subscription` | Plano e provedor de cobrança (`NONE`, `STRIPE`, `MERCADO_PAGO`, `ASAAS`) — preparado, sem cobrança nesta versão |
| `User` | Usuário (e-mail único, hash bcrypt, papel, bloqueio por tentativas) — `tenantId` nulo apenas para SUPER_ADMIN |
| `Role`, `Permission`, `RolePermission` | RBAC; papéis de sistema (`tenantId` nulo) com permissões por módulo, prontos para papéis customizados por tenant |
| `Session` | Sessões em banco (token armazenado como HMAC), expiração absoluta e por inatividade, tenant ativo |
| `SupportAccessGrant` | Autorização temporária do cliente para acesso de suporte JR |

### Pipeline
| Modelo | Descrição |
|---|---|
| `Integration` | Conector configurado: tipo, provider, status, flag MOCK, config (não sensível), intervalo, última/próxima sincronização, cursor incremental |
| `IntegrationCredential` | Credentials Vault: `ciphertext`, `iv`, `authTag`, `keyVersion` (AES-256-GCM) |
| `SyncJob` | Execução de sincronização: modo (FULL/INCREMENTAL/REPROCESS), gatilho, status, contadores, cursores, erros e logs |
| `DataSource` | Fonte de dados (integração, importação, manual ou demo) com última atualização |
| `ImportedFile`, `ImportJob` | Arquivo enviado (hash SHA-256 para detectar reenvio) e job com cabeçalhos, amostra, mapeamento sugerido/confirmado, contadores e erros por linha |

### Cortex (modelo normalizado)
`Customer`, `Supplier`, `Product` (produto/serviço), `Seller`, `Sale`, `SaleItem`, `Revenue` (receitas não originadas de vendas), `Expense` (competência), `AccountPayable`, `AccountReceivable`, `Payment` (movimentação de caixa IN/OUT), `FinancialAccount`, `CostCenter`, `ChartAccount` (plano de contas → grupo do DRE, aliases de categoria, flag de dado sensível), `InventoryMovement`.

### Camada analítica e IA
`KPI`, `Goal`, `Insight` (fingerprint único por tenant para não duplicar alertas), `Forecast`, `Scenario`, `Report` (histórico de relatórios gerados), `Conversation`, `Message` (conteúdo, blocos estruturados e trace completo), `MessageFeedback`, `KnowledgeItem` (versionado), `AIUsage`.

### Auditoria
`AuditLog`: usuário, e-mail, empresa, ação, recurso, id do recurso, IP, user-agent, resultado (`SUCCESS`/`DENIED`/`FAILURE`), metadados e data.

## Índices principais

- `Sale(tenantId, date)`, `Sale(tenantId, customerId, date)`, `Sale(tenantId, sellerId, date)`
- `Expense(tenantId, date)`, `Expense(tenantId, category, date)`, `Revenue(tenantId, date)`
- `AccountPayable(tenantId, status, dueDate)`, `AccountReceivable(tenantId, status, dueDate)`
- `Payment(tenantId, date)`, `InventoryMovement(tenantId, productId, date)`
- `AuditLog(tenantId, createdAt)`, `Insight(tenantId, createdAt)`, `Conversation(tenantId, userId, updatedAt)`

## Multitenancy

1. A sessão define o tenant ativo; o `TenantContext` só existe após validação.
2. Toda consulta analítica recebe `tenantId` explícito (inclusive SQL bruto, sempre com `Prisma.sql` parametrizado e tabelas em whitelist).
3. `tenantDb(tenantId)` (`src/server/tenant.ts`) é uma extensão Prisma que injeta `tenantId` em leituras/atualizações em lote e criações — defesa em profundidade.
4. Testes de integração verificam que um tenant não enxerga dados de outro.

## Comandos

```bash
npm run db:migrate    # cria/aplica migrations em desenvolvimento
npm run db:deploy     # aplica migrations em produção
npm run db:seed       # RBAC + SUPER_ADMIN + JR Demo
npm run db:reset      # recria o banco (apaga tudo!)
npx prisma studio     # inspeção visual
```

## Retenção e exclusão (LGPD)
- `Tenant.dataRetentionDays` define a política de retenção.
- `POST /api/privacy/delete` remove todos os dados empresariais do tenant (mantém usuários, configurações e auditoria).
- `GET /api/privacy/export` exporta os dados em JSON (sem credenciais).
