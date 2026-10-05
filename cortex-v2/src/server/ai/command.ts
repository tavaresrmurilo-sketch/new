import "server-only";
import { addDaysToKey, dayKeyInTz } from "@/lib/dates";
import type { Ctx } from "@/server/auth/context";

/** Comando interpretado: nada é executado até a confirmação explícita do usuário. */
export type ParsedCommand =
  | { kind: "create_task"; title: string; dueDate: string | null; summary: string }
  | { kind: "create_lead"; name: string; companyName: string | null; summary: string }
  | { kind: "navigate"; href: string; summary: string }
  | { kind: "unknown"; summary: string };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function parseDue(ctx: Ctx, text: string): { due: string | null; rest: string } {
  const today = dayKeyInTz(new Date(), ctx.org.timezone);
  const patterns: [RegExp, (m: RegExpMatchArray) => string][] = [
    [/\s+(para\s+)?hoje\s*$/i, () => today],
    [/\s+(para\s+)?amanh[ãa]\s*$/i, () => addDaysToKey(today, 1)],
    [/\s+(em|daqui a)\s+(\d{1,3})\s+dias?\s*$/i, (m) => addDaysToKey(today, Number(m[2]))],
    [/\s+(para|até|ate)\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s*$/i, (m) => `${m[4] ?? today.slice(0, 4)}-${m[3]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`],
  ];
  for (const [re, fn] of patterns) {
    const m = text.match(re);
    if (m) return { due: fn(m), rest: text.slice(0, m.index).trim() };
  }
  return { due: null, rest: text.trim() };
}

const ROUTES: [RegExp, string, string][] = [
  [/pipeline|funil/, "/app/pipeline", "Abrir o pipeline"],
  [/radar/, "/app/opportunities/radar", "Abrir o Opportunity Radar"],
  [/relatorio|report/, "/app/reports", "Abrir relatórios"],
  [/forecast|previs/, "/app/forecast", "Abrir o forecast"],
  [/decis/, "/app/decisions", "Abrir a Central de Decisões"],
  [/equipe|capacidade|time/, "/app/team", "Abrir o mapa de capacidade"],
  [/financeiro|recebi/, "/app/finance", "Abrir o financeiro"],
  [/configura/, "/app/settings", "Abrir configurações"],
];

/** Command Center: interpretação determinística de comandos em linguagem natural. */
export function parseCommand(ctx: Ctx, raw: string): ParsedCommand {
  const text = raw.trim().replace(/\s+/g, " ").slice(0, 300);
  const n = norm(text);
  const task = text.match(/^(?:criar|crie|nova|adicionar|adicione)\s+(?:uma\s+)?tarefa:?\s+(.+)$/i);
  if (task) {
    const { due, rest } = parseDue(ctx, task[1]!);
    if (rest.length >= 3) return { kind: "create_task", title: rest, dueDate: due, summary: `Criar a tarefa “${rest}”${due ? ` com prazo em ${due.split("-").reverse().join("/")}` : " sem prazo"}, atribuída a você.` };
  }
  const lead = text.match(/^(?:criar|crie|novo|adicionar|adicione|cadastrar|cadastre)\s+(?:um\s+)?lead:?\s+(.+?)(?:\s+(?:da|do|de)\s+(?:empresa\s+)?(.+))?$/i);
  if (lead && lead[1]!.length >= 2) return { kind: "create_lead", name: lead[1]!.trim(), companyName: lead[2]?.trim() ?? null, summary: `Cadastrar o lead “${lead[1]!.trim()}”${lead[2] ? ` da empresa ${lead[2].trim()}` : ""}.` };
  if (/^(abrir|abra|ir para|mostrar|mostre|ver)\b/.test(n)) {
    const route = ROUTES.find(([re]) => re.test(n));
    if (route) return { kind: "navigate", href: route[1], summary: route[2] };
  }
  return { kind: "unknown", summary: "Comando não reconhecido. Exemplos: “criar tarefa Ligar para a Horizonte amanhã”, “criar lead Ana Souza da Construtora Alfa”, “abrir pipeline”." };
}
