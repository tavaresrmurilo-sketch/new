/** Catálogo do Automation Builder (WHEN / IF / THEN). Compartilhado entre servidor e interface. */

export type FieldType = "number" | "text" | "enum";

export interface TriggerField {
  key: string;
  label: string;
  type: FieldType;
  /** opções fixas; "stages" = etapas do pipeline do workspace */
  options?: { value: string; label: string }[] | "stages";
}

export interface TriggerDef {
  label: string;
  description: string;
  entity: "opportunity" | "lead" | "client" | "proposal" | "project" | "task" | "contract" | "meeting";
  fields: TriggerField[];
}

const SOURCE_OPTIONS = [
  { value: "REFERRAL", label: "Indicação" },
  { value: "WEBSITE", label: "Site" },
  { value: "INBOUND", label: "Inbound" },
  { value: "OUTBOUND", label: "Prospecção ativa" },
  { value: "EVENT", label: "Evento" },
  { value: "SOCIAL", label: "Redes sociais" },
  { value: "PARTNER", label: "Parceiro" },
  { value: "ADS", label: "Anúncios" },
  { value: "OTHER", label: "Outro" },
];
const PRIORITY_OPTIONS = [
  { value: "LOW", label: "Baixa" },
  { value: "MEDIUM", label: "Média" },
  { value: "HIGH", label: "Alta" },
  { value: "CRITICAL", label: "Crítica" },
];

export const AUTOMATION_TRIGGERS = {
  "opportunity.created": {
    label: "Oportunidade criada",
    description: "Quando uma nova oportunidade é registrada.",
    entity: "opportunity",
    fields: [
      { key: "value", label: "Valor", type: "number" },
      { key: "stageName", label: "Etapa", type: "enum", options: "stages" },
      { key: "source", label: "Origem", type: "enum", options: SOURCE_OPTIONS },
    ],
  },
  "opportunity.stage_changed": {
    label: "Oportunidade mudar de etapa",
    description: "Quando uma oportunidade é movida no pipeline.",
    entity: "opportunity",
    fields: [
      { key: "stageName", label: "Nova etapa", type: "enum", options: "stages" },
      { key: "previousStageName", label: "Etapa anterior", type: "enum", options: "stages" },
      { key: "value", label: "Valor", type: "number" },
    ],
  },
  "opportunity.won": {
    label: "Oportunidade ganha",
    description: "Quando um negócio é fechado como ganho.",
    entity: "opportunity",
    fields: [{ key: "value", label: "Valor", type: "number" }],
  },
  "opportunity.lost": {
    label: "Oportunidade perdida",
    description: "Quando um negócio é fechado como perdido.",
    entity: "opportunity",
    fields: [
      { key: "value", label: "Valor", type: "number" },
      { key: "closeReason", label: "Motivo", type: "text" },
    ],
  },
  "lead.created": {
    label: "Lead criado",
    description: "Quando um novo lead entra no CRM.",
    entity: "lead",
    fields: [
      { key: "source", label: "Origem", type: "enum", options: SOURCE_OPTIONS },
      { key: "potentialValue", label: "Valor potencial", type: "number" },
    ],
  },
  "client.created": {
    label: "Cliente criado",
    description: "Quando um cliente é cadastrado.",
    entity: "client",
    fields: [{ key: "isKeyAccount", label: "Cliente estratégico", type: "enum", options: [{ value: "true", label: "Sim" }, { value: "false", label: "Não" }] }],
  },
  "proposal.sent": {
    label: "Proposta enviada",
    description: "Quando uma proposta muda para Enviada.",
    entity: "proposal",
    fields: [{ key: "total", label: "Valor total", type: "number" }],
  },
  "proposal.accepted": {
    label: "Proposta aceita",
    description: "Quando o cliente aceita uma proposta.",
    entity: "proposal",
    fields: [{ key: "total", label: "Valor total", type: "number" }],
  },
  "proposal.rejected": {
    label: "Proposta recusada",
    description: "Quando uma proposta é recusada.",
    entity: "proposal",
    fields: [{ key: "total", label: "Valor total", type: "number" }],
  },
  "project.created": {
    label: "Projeto criado",
    description: "Quando um projeto é criado.",
    entity: "project",
    fields: [{ key: "priority", label: "Prioridade", type: "enum", options: PRIORITY_OPTIONS }],
  },
  "project.status_changed": {
    label: "Projeto mudar de status",
    description: "Quando o status de um projeto é alterado.",
    entity: "project",
    fields: [
      {
        key: "status",
        label: "Novo status",
        type: "enum",
        options: [
          { value: "PLANNING", label: "Planejamento" },
          { value: "ACTIVE", label: "Ativo" },
          { value: "PAUSED", label: "Pausado" },
          { value: "DELAYED", label: "Atrasado" },
          { value: "COMPLETED", label: "Concluído" },
          { value: "CANCELED", label: "Cancelado" },
        ],
      },
    ],
  },
  "task.completed": {
    label: "Tarefa concluída",
    description: "Quando uma tarefa é marcada como concluída.",
    entity: "task",
    fields: [{ key: "priority", label: "Prioridade", type: "enum", options: PRIORITY_OPTIONS }],
  },
  "contract.expiring": {
    label: "Contrato próximo do vencimento",
    description: "Avaliado pela rotina diária nos marcos de 90, 60, 30 e 7 dias.",
    entity: "contract",
    fields: [
      { key: "daysLeft", label: "Dias para vencer", type: "number" },
      { key: "value", label: "Valor", type: "number" },
    ],
  },
  "meeting.completed": {
    label: "Reunião realizada",
    description: "Quando uma reunião é marcada como realizada.",
    entity: "meeting",
    fields: [],
  },
} satisfies Record<string, TriggerDef>;

export type AutomationTrigger = keyof typeof AUTOMATION_TRIGGERS;
export const TRIGGER_KEYS = Object.keys(AUTOMATION_TRIGGERS) as AutomationTrigger[];

export const OPERATORS = {
  equals: "é igual a",
  not_equals: "é diferente de",
  gt: "maior que",
  gte: "maior ou igual a",
  lt: "menor que",
  lte: "menor ou igual a",
  contains: "contém",
} as const;
export type Operator = keyof typeof OPERATORS;

export const AUTOMATION_ACTIONS = {
  create_task: { label: "Criar tarefa", description: "Cria uma tarefa vinculada ao registro." },
  notify: { label: "Criar alerta", description: "Envia uma notificação interna (nunca mensagens externas)." },
  add_tag: { label: "Adicionar tag", description: "Adiciona uma tag ao registro." },
  start_playbook: { label: "Iniciar playbook", description: "Inicia um playbook e cria suas tarefas." },
} as const;
export type AutomationActionType = keyof typeof AUTOMATION_ACTIONS;

/** Eventos públicos disponíveis para webhooks. */
export const WEBHOOK_EVENTS = {
  "lead.created": "Lead criado",
  "lead.updated": "Lead atualizado",
  "deal.created": "Oportunidade criada",
  "deal.stage_changed": "Oportunidade mudou de etapa",
  "proposal.created": "Proposta criada",
  "proposal.accepted": "Proposta aceita",
  "project.created": "Projeto criado",
  "task.completed": "Tarefa concluída",
  "contract.expiring": "Contrato vencendo",
} as const;
export type WebhookEvent = keyof typeof WEBHOOK_EVENTS;
