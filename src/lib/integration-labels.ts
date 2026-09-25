/** Rótulos compartilhados (servidor e cliente) para o módulo Conectar Dados. */
export type BadgeVariant = "success" | "warning" | "critical" | "secondary" | "info";

export const INTEGRATION_STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  CONNECTED: { label: "Conectada", variant: "success" },
  SYNCING: { label: "Sincronizando", variant: "info" },
  ERROR: { label: "Erro", variant: "critical" },
  DISABLED: { label: "Desativada", variant: "secondary" },
  PENDING: { label: "Pendente", variant: "warning" },
  NOT_IMPLEMENTED: { label: "Depende de API externa", variant: "info" },
};

export const SYNC_STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  SUCCESS: { label: "Sucesso", variant: "success" },
  PARTIAL: { label: "Parcial", variant: "warning" },
  FAILED: { label: "Falhou", variant: "critical" },
  RUNNING: { label: "Em andamento", variant: "info" },
  PENDING: { label: "Pendente", variant: "secondary" },
};

export const PROVIDER_LABELS: Record<string, string> = {
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  sqlserver: "SQL Server",
  "rest-api": "API REST",
  csv: "CSV",
  xlsx: "Excel",
  "google-sheets": "Google Sheets",
  "mock-erp": "ERP Demo",
  manual: "Manual",
};

export function intervalLabel(minutes: number | null | undefined): string {
  if (!minutes) return "Manual";
  if (minutes === 60) return "A cada hora";
  if (minutes === 360) return "A cada 6 horas";
  if (minutes === 1440) return "Diariamente";
  if (minutes % 1440 === 0) return `A cada ${minutes / 1440} dias`;
  if (minutes % 60 === 0) return `A cada ${minutes / 60} horas`;
  return `A cada ${minutes} min`;
}

export function durationLabel(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}
