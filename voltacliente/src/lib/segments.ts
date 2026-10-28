import type { LucideIcon } from "lucide-react";
import { AirVent, Car, Scissors, Wrench, Store } from "lucide-react";

export const SEGMENTS = ["AR_CONDICIONADO", "OFICINA_MECANICA", "BARBEARIA_SALAO", "MANUTENCAO", "OUTRO"] as const;
export type SegmentKey = (typeof SEGMENTS)[number];

export type SuggestedService = { name: string; returnIntervalDays: number };

type SegmentInfo = {
  label: string;
  description: string;
  icon: LucideIcon;
  defaultIntervalDays: number;
  services: SuggestedService[];
  closing: string;
};

export const SEGMENT_INFO: Record<SegmentKey, SegmentInfo> = {
  AR_CONDICIONADO: {
    label: "Ar-condicionado",
    description: "Limpeza, higienização e manutenção de climatização",
    icon: AirVent,
    defaultIntervalDays: 180,
    services: [
      { name: "Limpeza de ar-condicionado", returnIntervalDays: 180 },
      { name: "Higienização completa", returnIntervalDays: 365 },
      { name: "Manutenção preventiva", returnIntervalDays: 180 },
    ],
    closing: "Gostaria de agendar uma nova manutenção?",
  },
  OFICINA_MECANICA: {
    label: "Oficina mecânica",
    description: "Revisões, trocas de óleo e manutenção automotiva",
    icon: Car,
    defaultIntervalDays: 180,
    services: [
      { name: "Troca de óleo", returnIntervalDays: 180 },
      { name: "Revisão preventiva", returnIntervalDays: 365 },
      { name: "Alinhamento e balanceamento", returnIntervalDays: 180 },
    ],
    closing: "Que tal agendar a próxima revisão do seu veículo?",
  },
  BARBEARIA_SALAO: {
    label: "Barbearia ou salão",
    description: "Cortes, barba, coloração e cuidados pessoais",
    icon: Scissors,
    defaultIntervalDays: 30,
    services: [
      { name: "Corte de cabelo", returnIntervalDays: 30 },
      { name: "Barba", returnIntervalDays: 15 },
      { name: "Coloração", returnIntervalDays: 45 },
    ],
    closing: "Vamos agendar o seu próximo horário?",
  },
  MANUTENCAO: {
    label: "Manutenção em geral",
    description: "Manutenção predial, residencial e de equipamentos",
    icon: Wrench,
    defaultIntervalDays: 90,
    services: [
      { name: "Manutenção preventiva", returnIntervalDays: 90 },
      { name: "Limpeza de caixa d'água", returnIntervalDays: 180 },
      { name: "Dedetização", returnIntervalDays: 180 },
    ],
    closing: "Podemos agendar a próxima visita?",
  },
  OUTRO: {
    label: "Outro serviço recorrente",
    description: "Qualquer serviço que o cliente precisa contratar de novo",
    icon: Store,
    defaultIntervalDays: 90,
    services: [{ name: "Atendimento padrão", returnIntervalDays: 90 }],
    closing: "Gostaria de agendar um novo atendimento?",
  },
};

export function isSegment(value: unknown): value is SegmentKey {
  return typeof value === "string" && (SEGMENTS as readonly string[]).includes(value);
}

export function defaultTemplateBody(segment: SegmentKey): string {
  return (
    "Olá, {primeiro_nome}! Tudo bem? Aqui é da {empresa}. " +
    "Faz um tempo desde o seu último atendimento de {servico}, em {data_ultimo_atendimento}. " +
    SEGMENT_INFO[segment].closing
  );
}

export const FOLLOW_UP_TEMPLATE_BODY =
  "Oi, {primeiro_nome}! Passando para lembrar que já está na época do seu próximo atendimento de {servico}. " +
  "Se quiser, posso verificar um horário para você. Equipe {empresa}.";

export const TIMEZONES: { value: string; label: string }[] = [
  { value: "America/Sao_Paulo", label: "Brasília (SP, RJ, MG, Sul, GO, DF, BA, NE)" },
  { value: "America/Manaus", label: "Amazonas (Manaus)" },
  { value: "America/Cuiaba", label: "Mato Grosso (Cuiabá)" },
  { value: "America/Campo_Grande", label: "Mato Grosso do Sul (Campo Grande)" },
  { value: "America/Porto_Velho", label: "Rondônia (Porto Velho)" },
  { value: "America/Boa_Vista", label: "Roraima (Boa Vista)" },
  { value: "America/Rio_Branco", label: "Acre (Rio Branco)" },
  { value: "America/Belem", label: "Pará e Amapá (Belém)" },
  { value: "America/Fortaleza", label: "Ceará, RN, PB, PI, MA (Fortaleza)" },
  { value: "America/Recife", label: "Pernambuco (Recife)" },
  { value: "America/Maceio", label: "Alagoas e Sergipe (Maceió)" },
  { value: "America/Araguaina", label: "Tocantins (Araguaína)" },
  { value: "America/Noronha", label: "Fernando de Noronha" },
  { value: "Europe/Lisbon", label: "Portugal (Lisboa)" },
];
