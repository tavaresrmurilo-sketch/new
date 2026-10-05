export type ActionKind =
  | "update_close_date"
  | "follow_up_proposal"
  | "send_proposal"
  | "contact_decision_maker"
  | "schedule_meeting"
  | "reactivate"
  | "complete_tasks"
  | "renewal"
  | "contact_client"
  | "review_project"
  | "qualify_lead"
  | "first_contact"
  | "scheduled_return"
  | "keep_cadence";

export interface Recommendation {
  kind: ActionKind;
  action: string;
  reason: string;
  urgency: "high" | "medium" | "low";
}

export interface OpportunityNbaInput {
  stageName: string;
  probability: number;
  daysSinceActivity: number;
  daysToClose: number | null;
  nextStep: string | null;
  daysToNextStep: number | null;
  proposal: { number: number; status: string; daysSinceSent: number | null; daysSinceUpdate: number } | null;
  hasDecisionMaker: boolean;
  meetingsLast30d: number;
  upcomingMeeting: boolean;
  overdueTasks: number;
  followUpDays: number;
}

/** Próxima Melhor Ação para uma oportunidade: regras em ordem de urgência, sempre com o motivo. */
export function nextBestActionForOpportunity(i: OpportunityNbaInput): Recommendation[] {
  const recs: Recommendation[] = [];
  if (i.daysToNextStep !== null && i.daysToNextStep <= 0 && i.nextStep) {
    recs.push({
      kind: "scheduled_return",
      action: i.nextStep,
      reason: i.daysToNextStep === 0 ? "Próximo passo combinado para hoje." : `Próximo passo combinado venceu há ${-i.daysToNextStep} dia(s).`,
      urgency: "high",
    });
  }
  if (i.proposal && (i.proposal.status === "SENT" || i.proposal.status === "VIEWED") && (i.proposal.daysSinceSent ?? 0) >= 5 && i.daysSinceActivity >= 3) {
    recs.push({
      kind: "follow_up_proposal",
      action: "Enviar follow-up da proposta",
      reason:
        i.proposal.status === "VIEWED"
          ? `O cliente visualizou a proposta #${i.proposal.number}, mas não houve follow-up.`
          : `Proposta #${i.proposal.number} enviada há ${i.proposal.daysSinceSent} dias sem retorno.`,
      urgency: "high",
    });
  }
  if (i.daysToClose !== null && i.daysToClose < 0) {
    recs.push({ kind: "update_close_date", action: "Revisar a previsão de fechamento", reason: `A data prevista venceu há ${-i.daysToClose} dia(s).`, urgency: "medium" });
  }
  if (!i.proposal && i.probability >= 55) {
    recs.push({ kind: "send_proposal", action: "Enviar proposta", reason: `A oportunidade está em “${i.stageName}” e ainda não tem proposta vinculada.`, urgency: "high" });
  }
  if (i.proposal?.status === "NEGOTIATION" && i.proposal.daysSinceUpdate > 7) {
    recs.push({ kind: "follow_up_proposal", action: "Revisar a proposta em negociação", reason: `A negociação está parada há ${i.proposal.daysSinceUpdate} dias.`, urgency: "medium" });
  }
  if (!i.hasDecisionMaker && i.probability >= 25) {
    recs.push({ kind: "contact_decision_maker", action: "Entrar em contato com o decisor", reason: "Nenhum contato com papel de decisor está mapeado neste cliente.", urgency: "medium" });
  }
  if (i.meetingsLast30d === 0 && !i.upcomingMeeting && i.probability <= 45) {
    recs.push({ kind: "schedule_meeting", action: "Agendar reunião", reason: "Não há reuniões nos últimos 30 dias nem reunião agendada.", urgency: "medium" });
  }
  if (i.daysSinceActivity >= i.followUpDays) {
    recs.push({ kind: "reactivate", action: "Retomar contato", reason: `Sem atividade há ${i.daysSinceActivity} dias.`, urgency: i.daysSinceActivity >= 21 ? "high" : "medium" });
  }
  if (i.overdueTasks > 0) {
    recs.push({ kind: "complete_tasks", action: "Concluir tarefas atrasadas", reason: `${i.overdueTasks} tarefa(s) desta oportunidade estão atrasadas.`, urgency: "medium" });
  }
  if (!recs.length) {
    recs.push({
      kind: "keep_cadence",
      action: i.nextStep ? `Seguir o próximo passo: ${i.nextStep}` : "Manter a cadência de contato",
      reason: "A oportunidade está ativa e sem pendências detectadas.",
      urgency: "low",
    });
  }
  return recs;
}

export interface ClientNbaInput {
  daysSinceInteraction: number | null;
  inactiveThreshold: number;
  contractExpiringDays: number | null;
  openOpportunities: number;
  overdueTasks: number;
  atRiskProjects: number;
  status: string;
}

export function nextBestActionForClient(i: ClientNbaInput): Recommendation[] {
  const recs: Recommendation[] = [];
  if (i.contractExpiringDays !== null && i.contractExpiringDays >= 0 && i.contractExpiringDays <= 60) {
    recs.push({ kind: "renewal", action: "Iniciar conversa de renovação", reason: `O contrato vence em ${i.contractExpiringDays} dia(s).`, urgency: i.contractExpiringDays <= 30 ? "high" : "medium" });
  }
  if (i.atRiskProjects > 0) {
    recs.push({ kind: "review_project", action: "Revisar projeto em risco com o cliente", reason: `${i.atRiskProjects} projeto(s) deste cliente estão em risco.`, urgency: "high" });
  }
  if (i.daysSinceInteraction === null) {
    recs.push({ kind: "contact_client", action: "Registrar o primeiro contato", reason: "Não há nenhuma interação registrada com este cliente.", urgency: "medium" });
  } else if (i.daysSinceInteraction >= i.inactiveThreshold && i.status !== "CHURNED") {
    recs.push({ kind: "contact_client", action: "Entrar em contato", reason: `Cliente sem atividade há ${i.daysSinceInteraction} dias.`, urgency: "medium" });
  }
  if (i.overdueTasks > 0) recs.push({ kind: "complete_tasks", action: "Resolver tarefas atrasadas", reason: `${i.overdueTasks} tarefa(s) deste cliente estão atrasadas.`, urgency: "medium" });
  if (!recs.length) recs.push({ kind: "keep_cadence", action: "Manter o relacionamento", reason: "Nenhum sinal de atenção detectado.", urgency: "low" });
  return recs;
}

export function nextBestActionForLead(i: { status: string; daysSinceCreated: number; daysSinceContact: number | null }): Recommendation[] {
  if (i.status === "CONVERTED" || i.status === "UNQUALIFIED") return [];
  if (i.daysSinceContact === null) {
    return [{
      kind: "first_contact",
      action: "Fazer o primeiro contato",
      reason: i.daysSinceCreated === 0 ? "Lead criado hoje e ainda sem contato." : `Lead criado há ${i.daysSinceCreated} dia(s) e ainda sem contato.`,
      urgency: i.daysSinceCreated >= 2 ? "high" : "medium",
    }];
  }
  if (i.status === "QUALIFIED") return [{ kind: "qualify_lead", action: "Converter em oportunidade", reason: "Lead qualificado pronto para entrar no pipeline.", urgency: "medium" }];
  if (i.daysSinceContact >= 7) return [{ kind: "reactivate", action: "Fazer novo contato", reason: `Sem contato há ${i.daysSinceContact} dias.`, urgency: "medium" }];
  return [{ kind: "keep_cadence", action: "Qualificar o lead", reason: "Contato recente registrado; avance a qualificação.", urgency: "low" }];
}
