# Operação

## Jobs
| Job | O que faz | Frequência sugerida |
|---|---|---|
| `metric-snapshots` | Grava indicadores diários (pipeline, projetos/tarefas atrasados, clientes ativos) usados em tendências e anomalias | diária |
| `contracts-expiring` | Alerta nos marcos configurados (padrão 90/60/30/7 dias), emite `contract.expiring` (automações e webhooks) e marca contratos vencidos como EXPIRED (exceto renovação automática) | diária |
| `follow-ups` | Lembretes internos de propostas sem retorno após `followUpDays` | diária |
| `projects-at-risk` | Notifica gerentes sobre projetos atrasados (1×/semana por projeto) | diária |
| `overdue-tasks` | Resumo diário de tarefas atrasadas por pessoa | diária |
| `morning-brief` | Aviso diário de que o Morning Brief está pronto | diária, início do expediente |
| `priority-recompute` | Recalcula prioridades automáticas (não altera prioridades manuais) | diária |
| `webhook-retries` | Reenvia entregas de webhooks com falha (backoff 1, 5, 30, 120, 720 min) | de hora em hora |
| `retention` | Remove itens da lixeira após o prazo, demos expirados, contas com exclusão agendada, auditoria antiga, sessões expiradas | diária |

Todos aceitam `Authorization: Bearer $CRON_SECRET`. Exemplo GitHub Actions:
```yaml
on: { schedule: [{ cron: "0 * * * *" }] }
jobs:
  retries:
    runs-on: ubuntu-latest
    steps:
      - run: curl -fsS -X POST -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" https://SEU_DOMINIO/api/cron/webhook-retries
```

## Backups
- **Neon:** ative o histórico de restauração (PITR) compatível com seu plano; para restaurar, crie um *branch* a partir do instante desejado, valide e promova.
- **Cópia lógica externa:** `pg_dump "$DATABASE_URL" -Fc -f cortex-$(date +%F).dump` em um agendador seguro; guarde fora do provedor.
- **Restauração de teste** trimestral recomendada.
- O botão “Exportar dados da empresa” (LGPD) não substitui backup.

## Monitoramento
- `GET /api/health` → `{ status, database }` (503 quando o banco está indisponível).
- Logs estruturados em JSON (stdout) com redação de segredos; eventos relevantes em `SystemEvent` e execuções de jobs em `JobRun` (ambos visíveis em `/admin/logs`).
