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
| Excel (XLSX) / CSV | SPREADSHEET / CSV | **Funcional** — assistente de importação com mapeamento sugerido |
| API REST (genérica) | API | **Funcional** — endpoints JSON via HTTPS com `fieldMap` configurável e token no Vault |
| Google Sheets | GOOGLE_SHEETS | **Funcional** para planilhas compartilhadas por link (exportação CSV). Planilhas privadas exigem OAuth — *planejado* |
| ERP Simulado (MOCK) | ERP | **MOCK isolado** para desenvolvimento — gera dados sintéticos marcados `[MOCK]` |
| ERP (Omie, Bling, TOTVS, SAP B1, Sankhya...) | ERP | *Planejado* — depende de API/credenciais externas |
| CRM (RD Station, Pipedrive, HubSpot, Salesforce) | CRM | *Planejado* |
| Financeiro (Conta Azul, Nibo, Open Finance) | FINANCE | *Planejado* |
| Contábil (Domínio, Alterdata, Questor) | ACCOUNTING | *Planejado* |
| Logística (TMS/WMS) | LOGISTICS | *Planejado* |
| PostgreSQL / MySQL | DATABASE | *Planejado* — leitura de views com usuário somente leitura (driver a adicionar) |

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

## API REST genérica — exemplo de configuração

```json
{
  "baseUrl": "https://api.seusistema.com.br",
  "authHeader": "Authorization",
  "authScheme": "Bearer",
  "endpoints": [
    {
      "entity": "sales",
      "path": "/v1/vendas",
      "dataPath": "data",
      "fieldMap": { "externalId": "id", "date": "emissao", "grossAmount": "valor_total", "customerName": "cliente.nome", "customerExternalId": "cliente.id" }
    }
  ]
}
```

Somente HTTPS; hosts privados/internos são bloqueados (mitigação de SSRF).

## Credentials Vault

`src/server/connectors/vault.ts` — valores cifrados com **AES-256-GCM** (chave `ENCRYPTION_KEY`), IV aleatório por valor e AAD `tenantId:integrationId:chave` (um ciphertext não pode ser reaproveitado em outro tenant/credencial). Credenciais nunca retornam ao frontend (apenas mascaradas, ex.: `••••a1b2`) e não entram em logs (redação automática no logger).

## Como criar um novo conector (ex.: Omie)

1. Crie `src/server/connectors/providers/omie.ts` implementando `ConnectorProvider` com `availability: "available"`.
2. Declare `credentialFields` (ex.: `appKey`, `appSecret`) e um `configSchema` Zod.
3. Em `fetch`, pagine a API, converta para `CanonicalBatch` (clientes, vendas, títulos...) e devolva `nextCursor` (ex.: maior `data_alteracao`) para o modo incremental.
4. Registre em `src/server/connectors/registry.ts`.
5. Escreva testes com respostas gravadas da API (sem credenciais reais).

## Agendamento

Configure um cron chamando `npm run jobs:run` (ou `POST /api/jobs/run` com `Authorization: Bearer $CRON_SECRET`) a cada 15 minutos. Integrações com `syncIntervalMinutes` e `nextSyncAt` vencido são sincronizadas em modo incremental.
