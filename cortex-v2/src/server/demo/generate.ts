import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Gerador de dados de DEMONSTRAÇÃO. Só é usado em workspaces com `isDemo = true`
 * (claramente sinalizados na interface). Nunca roda em workspaces reais.
 * Pseudoaleatório com semente fixa para resultados reproduzíveis.
 */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const DAY = 86_400_000;
const at = (daysFromNow: number, hour = 12) => {
  const d = new Date(Date.now() + daysFromNow * DAY);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
};

const CLIENTS = [
  ["Construtora Horizonte", "Construção", "São Paulo", "SP"],
  ["Metalúrgica Vale Forte", "Indústria", "Joinville", "SC"],
  ["Hospital Santa Clara", "Saúde", "Curitiba", "PR"],
  ["Rede Supermercados Bom Preço", "Varejo", "Belo Horizonte", "MG"],
  ["Colégio Novo Saber", "Educação", "Campinas", "SP"],
  ["Logística Rota Sul", "Indústria", "Porto Alegre", "RS"],
  ["Prefeitura de Vila Verde", "Setor público", "Vila Verde", "GO"],
  ["Engeplan Projetos", "Engenharia", "Recife", "PE"],
  ["Shopping Atlântico", "Varejo", "Salvador", "BA"],
  ["Indústria Química Delta", "Indústria", "Camaçari", "BA"],
  ["Condomínio Parque das Águas", "Manutenção", "Florianópolis", "SC"],
  ["TechFarma Laboratórios", "Saúde", "Ribeirão Preto", "SP"],
];
const PEOPLE = ["Ana Souza", "Bruno Lima", "Carla Mendes", "Diego Rocha", "Eduarda Alves", "Felipe Costa", "Gabriela Nunes", "Henrique Dias", "Isabela Martins", "João Pereira", "Karina Lopes", "Lucas Barros"];
const SERVICES = ["Laudo estrutural", "Inspeção predial", "Manutenção preventiva anual", "Projeto de adequação NR-12", "Consultoria de eficiência energética", "SPDA e aterramento", "Plano de manutenção", "Auditoria de segurança"];
const SOURCES = ["REFERRAL", "WEBSITE", "INBOUND", "OUTBOUND", "EVENT", "PARTNER"] as const;

export async function generateDemoData(db: PrismaClient, organizationId: string, ownerId: string) {
  const r = rng(20261005);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
  const int = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const org = { organizationId };

  // Equipe fictícia (usuários convidados de demonstração, sem senha)
  const roles = await db.role.findMany({ where: { organizationId }, select: { id: true, key: true } });
  const roleId = (k: string) => roles.find((x) => x.key === k)!.id;
  const team: string[] = [ownerId];
  for (const [i, name] of ["Marina Teixeira", "Rafael Moura", "Paula Ribeiro"].entries()) {
    const u = await db.user.create({ data: { email: `demo-${organizationId.slice(-8)}-${i}@demo.jrcortex.local`, name, isDemoGuest: true } });
    await db.organizationMember.create({ data: { organizationId, userId: u.id, roleId: roleId(i === 0 ? "MANAGER" : "MEMBER"), title: ["Gerente comercial", "Engenheiro de projetos", "Analista técnica"][i], department: ["Comercial", "Engenharia", "Operações"][i], weeklyCapacityHours: 40 } });
    team.push(u.id);
  }

  const pipeline = await db.pipeline.findFirst({ where: { organizationId }, include: { stages: { orderBy: { order: "asc" } } } });
  const stages = pipeline!.stages;
  const open = stages.filter((s) => s.kind === "OPEN");
  const won = stages.find((s) => s.kind === "WON")!;
  const lost = stages.find((s) => s.kind === "LOST")!;

  // Clientes e contatos
  const clients: { id: string; name: string; ownerId: string }[] = [];
  for (const [i, [name, industry, city, state]] of CLIENTS.entries()) {
    const ownerIdC = team[i % team.length]!;
    const c = await db.client.create({
      data: { ...org, name: name!, industry, city, state, kind: "COMPANY", status: i < 10 ? "ACTIVE" : "PROSPECT", isKeyAccount: i < 3, source: pick(SOURCES), ownerId: ownerIdC, email: `contato@${name!.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "").slice(0, 14)}.com.br`, lastInteractionAt: at(-int(1, 45)), createdAt: at(-int(120, 300)), createdById: ownerId },
    });
    clients.push({ id: c.id, name: c.name, ownerId: ownerIdC });
    const dm = await db.contact.create({ data: { ...org, clientId: c.id, name: PEOPLE[i]!, jobTitle: "Diretor(a)", decisionRole: "DECISION_MAKER", influence: 5, isPrimary: true, email: `${PEOPLE[i]!.split(" ")[0]!.toLowerCase()}@exemplo.com.br` } });
    await db.contact.create({ data: { ...org, clientId: c.id, name: PEOPLE[(i + 5) % PEOPLE.length]!, jobTitle: "Coordenador(a) técnico(a)", decisionRole: i % 3 === 0 ? "CHAMPION" : "INFLUENCER", influence: 3, reportsToId: dm.id } });
    for (let k = 0; k < int(1, 4); k++) {
      const channel = pick(["CALL", "EMAIL", "WHATSAPP", "MEETING"] as const);
      await db.activity.create({ data: { ...org, action: "interaction.logged", channel, isInteraction: true, title: { CALL: "Ligação", EMAIL: "E-mail", WHATSAPP: "Conversa por WhatsApp", MEETING: "Reunião" }[channel] + ` com ${dm.name}`, entityType: "client", entityId: c.id, clientId: c.id, actorId: ownerIdC, occurredAt: at(-int(1, 60), int(9, 17)) } });
    }
  }

  // Leads
  for (let i = 0; i < 8; i++) {
    await db.lead.create({ data: { ...org, name: PEOPLE[(i + 3) % PEOPLE.length]!, companyName: ["Grupo Aurora", "Clínica Vida", "Transportes Minas", "Fábrica Polimix", "Escola Horizonte", "Hotel Mar Azul", "Agro Campo Bom", "Cerâmica Real"][i], source: pick(SOURCES), status: pick(["NEW", "CONTACTED", "QUALIFIED"] as const), ownerId: team[i % team.length], potentialValue: int(8, 90) * 1000, createdAt: at(-int(1, 40)) } });
  }

  // Oportunidades (abertas, ganhas e perdidas ao longo de 6 meses)
  const opps: { id: string; clientId: string; value: number; ownerId: string; title: string; status: string }[] = [];
  for (let i = 0; i < 26; i++) {
    const client = clients[i % clients.length]!;
    const value = int(12, 180) * 1000;
    const created = -int(10, 180);
    const roll = r();
    const status = i < 12 ? "OPEN" : roll < 0.55 ? "WON" : "LOST";
    const stage = status === "OPEN" ? open[i % open.length]! : status === "WON" ? won : lost;
    const closedAt = status === "OPEN" ? null : at(Math.min(-1, created + int(15, 60)));
    const title = `${pick(SERVICES)} — ${client.name.split(" ")[0]}`;
    const o = await db.opportunity.create({
      data: {
        ...org, title, clientId: client.id, pipelineId: pipeline!.id, stageId: stage.id, value, ownerId: client.ownerId, source: pick(SOURCES), status: status as "OPEN",
        expectedCloseDate: status === "OPEN" ? at(int(-5, 75)) : closedAt, nextStep: status === "OPEN" ? pick(["Enviar proposta revisada", "Agendar visita técnica", "Reunião com diretoria", "Validar escopo"]) : null,
        nextStepDate: status === "OPEN" ? at(int(-3, 10)) : null, wonAt: status === "WON" ? closedAt : null, lostAt: status === "LOST" ? closedAt : null,
        closeReason: status === "WON" ? pick(["PRICE", "RELATIONSHIP", "TECHNICAL_QUALITY", "REFERRAL"] as const) as never : status === "LOST" ? pick(["PRICE", "COMPETITOR", "NO_BUDGET", "TIMING", "NO_RESPONSE"] as const) as never : null,
        competitors: status === "LOST" && r() < 0.5 ? [pick(["Engetec", "Prime Serviços", "Construsul"])] : [],
        stageChangedAt: at(created + int(1, 10)), lastActivityAt: status === "OPEN" ? at(-int(0, 30)) : (closedAt ?? at(-5)), createdAt: at(created), createdById: ownerId,
      },
    });
    opps.push({ id: o.id, clientId: client.id, value, ownerId: client.ownerId, title, status });
  }

  // Propostas e contratos
  let seq = 0;
  for (const o of opps.slice(0, 18)) {
    seq++;
    const status = o.status === "WON" ? "ACCEPTED" : o.status === "LOST" ? "REJECTED" : pick(["DRAFT", "SENT", "VIEWED", "NEGOTIATION"] as const);
    const sentAt = status === "DRAFT" ? null : at(-int(3, 40));
    const items = [{ description: o.title.split(" — ")[0]!, unit: "serviço", quantity: 1, unitPrice: Math.round(o.value * 0.8) }, { description: "Relatório técnico e ART", unit: "un", quantity: 1, unitPrice: Math.round(o.value * 0.2) }];
    const p = await db.proposal.create({
      data: {
        ...org, number: seq, title: o.title, clientId: o.clientId, opportunityId: o.id, ownerId: o.ownerId, status: status as "SENT", subtotal: o.value, total: o.value, taxTotal: 0, taxes: [] as Prisma.InputJsonValue,
        validUntil: at(15), sentAt, viewedAt: status === "VIEWED" || status === "NEGOTIATION" ? at(-int(1, 3)) : null, viewCount: status === "VIEWED" || status === "NEGOTIATION" ? int(1, 4) : 0,
        acceptedAt: status === "ACCEPTED" ? at(-int(1, 30)) : null, rejectedAt: status === "REJECTED" ? at(-int(1, 30)) : null, statusChangedAt: sentAt ?? at(-1), createdById: ownerId,
        items: { create: items.map((it, k) => ({ ...org, ...it, total: it.quantity * it.unitPrice, sortOrder: k })) },
      },
    });
    if (status === "ACCEPTED" && seq % 2 === 0) {
      const recurring = seq % 4 === 0;
      const k = await db.contract.create({
        data: { ...org, number: `CT-${new Date().getFullYear()}-${String(seq).padStart(4, "0")}`, title: o.title, clientId: o.clientId, proposalId: p.id, opportunityId: o.id, ownerId: o.ownerId, value: recurring ? Math.round(o.value / 12) : o.value, recurrence: recurring ? "MONTHLY" : "ONE_TIME", startDate: at(-int(30, 200)), endDate: at(int(5, 200)), renewalType: "MANUAL", status: "ACTIVE", signedAt: at(-int(30, 200)), createdById: ownerId },
      });
      for (let m = 0; m < 3; m++) {
        const due = -60 + m * 30;
        const received = due < -5 && r() < 0.85;
        await db.receivable.create({ data: { ...org, description: `${k.number} — parcela ${m + 1}/3`, clientId: o.clientId, contractId: k.id, amount: Math.round((recurring ? o.value / 12 : o.value / 3) * 100) / 100, dueDate: at(due), status: received ? "RECEIVED" : "PENDING", receivedAt: received ? at(due + int(0, 4)) : null } });
      }
    }
  }
  await db.organization.update({ where: { id: organizationId }, data: { proposalSeq: seq, contractSeq: seq } });

  // Projetos, tarefas, riscos e reuniões
  const projNames = ["Inspeção predial — Torre A", "Adequação NR-12 — Linha 3", "Plano de manutenção 2026", "SPDA — Centro de distribuição", "Eficiência energética — Fase 1"];
  for (const [i, name] of projNames.entries()) {
    const client = clients[i]!;
    const start = -int(20, 90);
    const due = start + int(45, 120);
    const status = i === 1 ? "DELAYED" : "ACTIVE";
    const p = await db.project.create({ data: { ...org, name, code: `PRJ-${100 + i}`, clientId: client.id, managerId: team[(i + 1) % team.length], priority: pick(["MEDIUM", "HIGH"] as const), status, startDate: at(start), dueDate: at(i === 1 ? -6 : due), budget: int(40, 160) * 1000, actualCost: int(10, 120) * 1000, createdById: ownerId } });
    for (const uid of team) await db.projectMember.create({ data: { ...org, projectId: p.id, userId: uid } });
    const titles = ["Levantamento em campo", "Análise de documentação", "Elaborar relatório técnico", "Revisão com o cliente", "Emitir ART", "Entrega final", "Ajustes pós-revisão"];
    for (const [k, t] of titles.entries()) {
      const dueDay = start + 7 * (k + 1);
      const done = dueDay < -7 && r() < 0.8;
      await db.task.create({ data: { ...org, title: t, projectId: p.id, clientId: client.id, assigneeId: team[(k + i) % team.length], priority: pick(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const), status: done ? "DONE" : dueDay < 0 && r() < 0.3 ? "IN_PROGRESS" : "TODO", dueDate: at(dueDay), completedAt: done ? at(dueDay - int(0, 3)) : null, estimateHours: int(2, 16), createdById: ownerId } });
    }
    if (i === 1) await db.risk.create({ data: { ...org, projectId: p.id, title: "Atraso na entrega de peças pelo fornecedor", impact: 4, probability: 4, status: "OPEN", mitigation: "Cotar fornecedor alternativo", createdById: ownerId } });
    await db.meeting.create({ data: { ...org, title: `Alinhamento semanal — ${name}`, clientId: client.id, projectId: p.id, startsAt: at(int(0, 6), int(13, 17)), status: "SCHEDULED", createdById: ownerId, participants: { create: [{ userId: ownerId }] } } });
  }
  for (let i = 0; i < 6; i++) {
    await db.task.create({ data: { ...org, title: pick(["Ligar para confirmar visita", "Atualizar proposta com novo escopo", "Preparar apresentação", "Revisar contrato", "Enviar cronograma"]), clientId: clients[i]!.id, assigneeId: ownerId, priority: "MEDIUM", status: "TODO", dueDate: at(int(-3, 5)), createdById: ownerId } });
  }

  // Memória e snapshots históricos (para tendências)
  await db.memoryFact.create({ data: { ...org, clientId: clients[0]!.id, content: "Cliente prefere reuniões presenciais às terças pela manhã.", category: "PREFERENCE", authorId: ownerId } });
  await db.memoryFact.create({ data: { ...org, clientId: clients[2]!.id, content: "Toda proposta precisa ser aprovada pelo comitê de compras (reunião mensal).", category: "REQUIREMENT", authorId: ownerId } });
  const openValue = opps.filter((o) => o.status === "OPEN").reduce((s, o) => s + o.value, 0);
  for (let d = 60; d >= 1; d -= 1) {
    const date = new Date(new Date(Date.now() - d * DAY).toISOString().slice(0, 10) + "T00:00:00.000Z");
    const factor = 0.8 + (60 - d) / 300 + (r() - 0.5) * 0.05;
    await db.metricSnapshot.createMany({
      data: [
        { ...org, date, metric: "pipeline.open", value: Math.round(openValue * factor) },
        { ...org, date, metric: "projects.delayed", value: d > 20 ? 0 : 1 },
        { ...org, date, metric: "tasks.overdue", value: int(2, 7) },
      ],
      skipDuplicates: true,
    });
  }
}
