import type { ReportReason } from "@prisma/client";

/** Motivos de denúncia (enum ReportReason) com rótulos para a interface. Isomórfico. */
export const REPORT_REASONS = [
  { value: "FRAUD", label: "Golpe ou fraude", hint: "Ingressos falsos, cobrança indevida ou organizador suspeito" },
  { value: "WRONG_INFO", label: "Informações erradas", hint: "Data, horário, local ou preço incorretos" },
  { value: "CANCELED_EVENT", label: "O evento foi cancelado", hint: "Não vai mais acontecer, mas continua no ar" },
  { value: "INAPPROPRIATE", label: "Conteúdo impróprio", hint: "Ofensivo, discriminatório, violento ou ilegal" },
  { value: "SPAM", label: "Spam ou propaganda", hint: "Divulgação repetida ou que não é um evento" },
  { value: "OTHER", label: "Outro motivo", hint: "Conte para a gente nos detalhes" },
] as const satisfies readonly { value: ReportReason; label: string; hint: string }[];

export const REPORT_REASON_VALUES = REPORT_REASONS.map((r) => r.value) as [ReportReason, ...ReportReason[]];

export const REPORT_REASON_LABEL: Record<ReportReason, string> = Object.fromEntries(REPORT_REASONS.map((r) => [r.value, r.label])) as Record<
  ReportReason,
  string
>;

export const REPORT_DETAILS_MAX = 1000;
