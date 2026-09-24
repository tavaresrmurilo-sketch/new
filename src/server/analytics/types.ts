import type { PermissionKey } from "@/server/auth/permissions";

export interface AnalyticsCtx {
  tenantId: string;
  timezone: string;
  today: Date;
  permissions: Set<PermissionKey>;
  minCashBalance: number | null;
}

export interface CalcStep {
  label: string;
  formula?: string;
  value?: number | string | null;
  detail?: string;
}

export interface SourceInfo {
  id: string;
  name: string;
  kind: string;
  lastUpdatedAt: string;
}

export interface AnalysisMeta {
  period?: { start: string; end: string; label: string };
  comparison?: { start: string; end: string; label: string };
  sources: SourceInfo[];
  lastUpdated: string | null;
  filters: Record<string, string>;
  calculation: CalcStep[];
  notes?: string[];
}

export interface Analysis<T> {
  data: T;
  meta: AnalysisMeta;
  /** false quando não há dados suficientes para calcular o indicador */
  sufficient: boolean;
}

export const INSUFFICIENT = "Não encontrei dados suficientes para calcular este indicador.";
