# Integrações — JR Cortex AI

## Arquitetura de conectores

Todo sistema externo é integrado por um **provider** que implementa `ConnectorProvider` (`src/server/connectors/types.ts`):

```ts
interface ConnectorProvider {
  id: string; label: string; type: ConnectorType;
  availability: "available" | "mock" | "planned";
  credentialFields: CredentialField[];          // gravados cifrados no Vault
  configSchema?: ZodType;                      // configuração não sensível
  testConnection(ctx): Promise<{ ok; message }>;
  fetch(ctx, { mode, cursor, page }): Promise<{ batch: CanonicalBatch; nextCursor?; hasMore? }>;
}
```

O provider **só converte** dados do sistema de origem para o modelo canônico do Cortex (`src/server/cortex/records.ts`). Validação, normalização, idempotência e gravação são responsabilidade do `Ingestor` — por isso um ERP novo não exige reconstruir o sistema.

## Status dos conectores

| Conector | Tipo | Status nesta versão |
|---|---|---|
| PostgreSQL | DATABASE | **Funcional** — somente leitura (driver `pg`), assistente "Conectar Dados" |
| MySQL / MariaDB | DATABASE | **Funcional** — somente leitura (driver `mysql2`) |
| SQL Server / Azure SQL | DATABASE | **Funcional** — somente leitura (driver `mssql`, `readOnlyIntent`) |
| API REST (genérica) | API | **Funcional** — somente GET, autenticação NONE/API Key/Bearer/Basic, headers personalizados |
| Excel (XLSX) / CSV | SPREADSHEET / CSV | **Funcional** — assistente de importação com tipos detectados, prévia e mapeamento |
| Google Sheets | GOOGLE_SHEETS | **Funcional** para planilhas compartilhadas por link (exportação CSV). Planilhas privadas exigem OAuth — *planejado* |
| ERP Simulado (MOCK) | ERP | **MOCK isolado** para desenvolvimento — gera dados sintéticos marcados `[MOCK]` |
| ERP (Omie, Bling, TOTVS, SAP B1, Sankhya...) | ERP | *Planejado* — depende de API/credenciais externas |
| CRM (RD Station, Pipedrive, HubSpot, Salesforce) | CRM | *Planejado* |
| Financeiro (Conta Azul, Nibo, Open Finance) | FINANCE | *Planejado* |
| Contábil (Domínio, Alterdata, Questor) | ACCOUNTING | *Planejado* |
| Logística (TMS/WMS) | LOGISTICS | *Planejado* |

Conectores *planejados* **não fingem funcionar**: são registrados com status `NOT_IMPLEMENTED`, `testConnection` retorna falha explicativa e `fetch` lança `ConnectorNotAvailableError` — nenhuma sincronização é marcada como bem-sucedida.

## Sincronização

`runSync(tenantId, integrationId, mode, trigger)` (`src/server/connectors/sync.ts`):

- **Modos**: `INCREMENTAL` (usa `Integration.syncCursor`), `FULL`, `REPROCESS` (relê tudo; seguro por causa da idempotência).
- **Gatilhos**: `MANUAL` (tela Integrações), `SCHEDULED` (cron via `runDueSyncs`), `IMPORT`.
- Cada execução gera um `SyncJob` com: início/fim, total, processados, novos, atualizados, rejeitados, cursor de/até, erros por registro e logs.
- A integração exibe: nome, tipo, status, última sincronização, próxima sincronização, número de registros, processados, rejeitados e erros.
- Trava contra execuções simultâneas da mesma integração.

### Idempotência
Chave natural `(tenantId, dataSourceId, externalId)` em todas as entidades. Quando a origem não fornece id (ex.: planilhas sem coluna de código), o id é um hash determinístico do conteúdo mapeado da linha; linhas idênticas repetidas recebem sufixo ordinal estável. Reimportar o mesmo arquivo atualiza os mesmos registros (testado em `tests/`).

## Importação de planilhas (CSV/XLSX)

1. **Upload** (`POST /api/import`) — até 10 MB / 100 mil linhas; CSV com detecção de delimitador (`;`, `,`, tab, `|`) e encoding (UTF-8/Latin-1); XLSX via ExcelJS (fórmulas usam o valor calculado).
2. **Detecção** — cabeçalhos + conteúdo das células (datas, números em formato brasileiro ou internacional, serial do Excel) → tipo de dado sugerido e **mapeamento sugerido** com nível de confiança.
3. **Confirmação** — o usuário revisa/corrige; campos obrigatórios são exigidos. Nada é gravado antes disso.
4. **Processamento** (`POST /api/import/:id/process`) — transformação, validação Zod, normalização e ingestão; relatório com erros por linha.

Tipos suportados: Vendas (agrupa linhas pelo nº do pedido quando mapeado), Despesas, Receitas, Clientes, Produtos, Contas a pagar, Contas a receber. Exemplos em [`samples/`](samples/).

## Conectar Dados — bancos e APIs dos clientes

O banco **Neon** (`DATABASE_URL`) continua sendo o banco interno do JR Cortex. Os bancos/APIs dos clientes são **fontes externas**, acessadas somente para leitura; os dados lidos são normalizados e gravados no Neon.

### Assistente (`/integracoes/nova`) — 7 etapas
1. **Escolha a fonte** — PostgreSQL, MySQL, SQL Server, API REST (CSV/Excel levam ao importador).
2. **Configure a conexão** — campos (host, porta, database, usuário, senha, SSL / Encrypt / Trust Server Certificate) ou connection string; API: Base URL, autenticação, headers e endpoints.
3. **Testar conexão** — `POST /api/integrations/connections/test`. Mensagens amigáveis ("Conexão realizada com sucesso." / "Não foi possível conectar ao banco." + causas prováveis). API: status HTTP, tempo de resposta e endpoint.
4. **Selecionar dados** — schemas/tabelas/views descobertos via `information_schema` (ou endpoints).
5. **Mapear campos** — `POST /api/integrations/connections/columns` lê as colunas; entidade (Clientes, Vendas, Produtos, Faturas, Receitas, Despesas, Pedidos, Contas a pagar/receber), mapeamento sugerido e coluna incremental (`updated_at`, `modified_at`, `created_at`, `id`).
6. **Definir sincronização** — Manual, a cada hora, a cada 6 horas ou diariamente.
7. **Concluir** — `POST /api/integrations` testa **de novo no servidor**, valida tabelas/colunas contra os metadados reais e só então salva.

### Segurança
- **Somente leitura**: PostgreSQL `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`; MySQL `SET SESSION TRANSACTION READ ONLY`; SQL Server `readOnlyIntent` + apenas SELECT gerado pelo sistema. Toda SQL passa por `assertReadOnlySql` (recusa INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE etc.). Recomende ao cliente um usuário apenas com SELECT (a UI mostra o script).
- **Sem SQL arbitrário**: o usuário escolhe tabelas e colunas; identificadores são validados contra a metadata descoberta e escapados por dialeto; valores (cursor, limite, offset) vão sempre como parâmetros.
- **Credenciais**: toda a configuração de conexão é cifrada (AES-256-GCM, chave `connection` no Vault). A connection string é descartada após normalização. O frontend só recebe dados não sensíveis (host, porta, database, usuário) e `Senha: ••••••••••••`. Ao editar, campos secretos vazios mantêm o valor salvo.
- **SSRF**: hosts internos (localhost, 10/8, 172.16/12, 192.168/16, 169.254/16, IPv6 privados, `.internal`, `.local`) são bloqueados. `ALLOW_PRIVATE_DB_HOSTS=true` só em desenvolvimento.
- **Multitenancy**: toda rota filtra por `tenantId` da sessão; outra empresa recebe 404 ao ver, testar, sincronizar ou editar. O AAD da cifra inclui tenant e integração.
- **JR Admin** (`/admin/integracoes`): apenas metadados (empresa, integração, tipo, status, última sincronização, registros, erros). No modo suporte, detalhes de conexão e conteúdo de erros ficam ocultos.
- **Cortex AI** consulta apenas as tabelas normalizadas do Neon — nunca integrações ou credenciais.
- **Logs e auditoria** sem segredos (`scrub`): `integration.created`, `integration.updated`, `integration.tested`, `integration.sync.started`, `integration.sync.completed`, `integration.sync.failed`, `integration.disabled`.

### Serverless / resiliência
Cada ação abre **uma** conexão, executa e fecha (`withSqlSession`). Timeouts: conexão 10 s, consulta 30 s; leitura em lotes de 1.000; até `SYNC_MAX_ROWS_PER_TABLE` (50.000) linhas por tabela por execução. Banco offline → integração `ERROR` ("Integração indisponível"), erro registrado em `SyncError`, botão "Tentar novamente"; o restante do Cortex continua funcionando.

### Sincronização incremental
Cursor por tabela (`IntegrationTable.lastCursor`, com tipo preservado). A consulta usa `coluna >= último valor` (não perde registros com o mesmo timestamp) e a ingestão idempotente evita duplicidade. O cursor só avança depois da ingestão bem-sucedida do lote. Alterar o mapeamento reinicia o cursor da tabela.

### Rotas
| Rota | Uso |
|---|---|
| `POST /api/integrations/connections/test` | testar conexão não salva |
| `POST /api/integrations/connections/columns` | ler colunas e sugerir mapeamento |
| `POST /api/integrations` | criar integração (com `source`) |
| `PATCH /api/integrations/:id` | nome, agendamento, `status` CONNECTED/DISABLED, `connection` |
| `DELETE /api/integrations/:id` | excluir (credenciais apagadas; dados permanecem) |
| `POST /api/integrations/:id/test` | testar conexão salva |
| `POST /api/integrations/:id/sync` | sincronizar agora |
| `GET /api/integrations/:id/discover` | listar tabelas disponíveis |
| `POST /api/integrations/:id/tables` | ler colunas / adicionar tabelas |
| `PATCH /api/integrations/:id/tables/:tableId` | editar entidade, mapeamento, incremental, ativa |
| `GET/POST /api/jobs/run` | cron (Bearer `CRON_SECRET`) |

### Bancos em rede privada
Opções seguras exibidas na UI: liberar o IP de saída no firewall (somente a porta do banco, com SSL), VPN/túnel gerenciado, API intermediária somente leitura (conectar via API REST) ou réplica de leitura na nuvem. Nunca desabilitar autenticação.

## Credentials Vault

`src/server/connectors/vault.ts` — valores cifrados com **AES-256-GCM** (chave `ENCRYPTION_KEY`), IV aleatório por valor e AAD `tenantId:integrationId:chave` (um ciphertext não pode ser reaproveitado em outro tenant/credencial). Credenciais nunca retornam ao frontend (apenas mascaradas, ex.: `••••a1b2`) e não entram em logs (redação automática no logger).

## Como criar um novo conector (ex.: Omie)

1. Crie `src/server/connectors/providers/omie.ts` implementando `ConnectorProvider` com `availability: "available"`.
2. Declare `credentialFields` (ex.: `appKey`, `appSecret`) e um `configSchema` Zod.
3. Em `fetch`, pagine a API, converta para `CanonicalBatch` (clientes, vendas, títulos...) e devolva `nextCursor` (ex.: maior `data_alteracao`) para o modo incremental.
4. Registre em `src/server/connectors/registry.ts`.
5. Escreva testes com respostas gravadas da API (sem credenciais reais).

## Agendamento

Na Vercel, `vercel.json` já agenda `GET /api/jobs/run` a cada hora (defina `CRON_SECRET` nas variáveis do projeto — a Vercel envia `Authorization: Bearer $CRON_SECRET`). Em outros ambientes, use `npm run jobs:run` ou `POST /api/jobs/run` com o mesmo header. Integrações com `syncIntervalMinutes` e `nextSyncAt` vencido são sincronizadas em modo incremental.
