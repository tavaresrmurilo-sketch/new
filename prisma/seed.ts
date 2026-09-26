/**
 * Seed do JR Cortex AI.
 * - Permissões e papéis de sistema
 * - Usuário SUPER_ADMIN da JR Consultorias
 * - Tenant "JR Demo" com DADOS DEMONSTRATIVOS (fictícios, determinísticos, ~26 meses)
 *
 * Os dados demo ficam isolados no tenant JR Demo e na fonte "DADOS DEMONSTRATIVOS — ERP Demo".
 */
import { PrismaClient, type DreGroup, type Prisma, type RoleKey } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { PERMISSIONS, ROLE_LABELS, ROLE_PERMISSIONS, type PermissionKey } from "../src/server/auth/permissions";
import { ensureAdmin } from "../src/server/bootstrap/admin";

const prisma = new PrismaClient();

// ───────── utilidades determinísticas ─────────
let seedState = 20260924;
function rand() {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296;
  return seedState / 4294967296;
}
const between = (a: number, b: number) => a + rand() * (b - a);
const int = (a: number, b: number) => Math.floor(between(a, b + 1));
const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
const r2 = (v: number) => Math.round(v * 100) / 100;
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const businessDay = (d: Date) => (d.getUTCDay() === 6 ? addDays(d, 2) : d.getUTCDay() === 0 ? addDays(d, 1) : d);
const key = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

function todaySP(): Date {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [y, m, d] = s.split("-").map(Number);
  return utc(y, m - 1, d);
}

async function chunked<T>(rows: T[], fn: (chunk: T[]) => Promise<unknown>, size = 2000) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

// ───────── papéis e permissões ─────────
async function seedRbac() {
  for (const [k, v] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({ where: { key: k }, create: { key: k, module: v.module, description: v.description }, update: { module: v.module, description: v.description } });
  }
  const perms = await prisma.permission.findMany();
  const byKey = new Map(perms.map((p) => [p.key, p.id]));
  const roles: Record<string, string> = {};
  for (const roleKey of Object.keys(ROLE_PERMISSIONS) as RoleKey[]) {
    let role = await prisma.role.findFirst({ where: { tenantId: null, key: roleKey } });
    if (!role) role = await prisma.role.create({ data: { key: roleKey, name: ROLE_LABELS[roleKey], isSystem: true } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: ROLE_PERMISSIONS[roleKey].map((p: PermissionKey) => ({ roleId: role.id, permissionId: byKey.get(p)! })),
    });
    roles[roleKey] = role.id;
  }
  return roles;
}

// ───────── dados de referência ─────────
const CUSTOMER_NAMES = [
  "Grupo Horizonte Varejo", "Alfa Distribuidora", "Construtora Vale Norte", "Rede Supermercados Aurora", "Metalúrgica Tupã",
  "Indústria Solaris", "Agropecuária Campo Belo", "Hospital Santa Clara", "Transportes Rota Sul", "Frigorífico Serra Azul",
  "Colégio Nova Geração", "Hotel Mirante", "Laboratório BioVida", "Padaria Pão Dourado", "Farmácias Bem Estar",
  "Auto Peças Veloz", "Condomínio Parque Verde", "Clínica Sorriso", "Shopping Estação", "Cooperativa Agrícola União",
  "Restaurante Sabor da Terra", "Academia Corpo em Forma", "Gráfica Impressa", "Mercado Bom Preço", "Posto Estrela",
  "Construtora Pilar", "Têxtil Fio de Ouro", "Móveis Aconchego", "Cervejaria Artesanal Lúpulo", "Papelaria Central",
  "Distribuidora Oeste", "Lavanderia Clean", "Pet Shop Amigo Fiel", "Eletro Center", "Madeireira Ipê",
  "Clínica Veterinária Vida", "Escritório Contábil Exato", "Supermercado Família", "Indústria Plasmax", "Hortifruti Natural",
  "Hotel Bela Vista", "Transportadora Ágil", "Loja Moda Viva", "Construtora Alicerce", "Laticínios Vale Verde",
  "Pousada Recanto", "Ótica Visão Clara", "Serralheria Forte", "Rede Drogafarma", "Cafeteria Grão Nobre",
  "Instituto Educar", "Fábrica de Gelo Polar", "Distribuidora Litoral", "Mineração Pedra Alta", "Clube Atlético Leste",
  "Buffet Celebrar", "Tecnologia Nuvem Sul", "Vidraçaria Cristal", "Açougue Boi Gordo", "Estúdio Criativo",
];
const REGIONS = ["Sudeste", "Sul", "Nordeste", "Centro-Oeste", "Norte"];
const SEGMENTS = ["Varejo", "Indústria", "Serviços", "Saúde", "Agronegócio", "Educação", "Construção"];
const PRODUCTS: { name: string; category: string; type: "PRODUCT" | "SERVICE"; price: number; cost: number }[] = [
  { name: "Compressor Industrial CX-200", category: "Equipamentos", type: "PRODUCT", price: 8900, cost: 5200 },
  { name: "Gerador Diesel GD-45", category: "Equipamentos", type: "PRODUCT", price: 15400, cost: 9800 },
  { name: "Bomba Hidráulica BH-12", category: "Equipamentos", type: "PRODUCT", price: 3200, cost: 1750 },
  { name: "Equipamento Linha Econômica LE-1", category: "Equipamentos", type: "PRODUCT", price: 2400, cost: 2090 },
  { name: "Painel Elétrico PE-8", category: "Equipamentos", type: "PRODUCT", price: 5600, cost: 3350 },
  { name: "Kit Filtros Premium", category: "Insumos", type: "PRODUCT", price: 420, cost: 190 },
  { name: "Óleo Lubrificante 20L", category: "Insumos", type: "PRODUCT", price: 380, cost: 215 },
  { name: "Correia Industrial CI-40", category: "Peças", type: "PRODUCT", price: 260, cost: 118 },
  { name: "Rolamento Blindado RB-6", category: "Peças", type: "PRODUCT", price: 145, cost: 62 },
  { name: "Válvula de Pressão VP-3", category: "Peças", type: "PRODUCT", price: 690, cost: 330 },
  { name: "Sensor de Temperatura ST-2", category: "Peças", type: "PRODUCT", price: 540, cost: 245 },
  { name: "Motor Elétrico 5CV", category: "Equipamentos", type: "PRODUCT", price: 4300, cost: 2600 },
  { name: "Mangueira Hidráulica MH-10", category: "Insumos", type: "PRODUCT", price: 310, cost: 150 },
  { name: "Manutenção Preventiva Mensal", category: "Serviços", type: "SERVICE", price: 1800, cost: 650 },
  { name: "Manutenção Corretiva", category: "Serviços", type: "SERVICE", price: 2600, cost: 1100 },
  { name: "Instalação de Equipamentos", category: "Serviços", type: "SERVICE", price: 3500, cost: 1500 },
  { name: "Consultoria em Eficiência Energética", category: "Consultoria", type: "SERVICE", price: 6800, cost: 2400 },
  { name: "Treinamento Operacional", category: "Consultoria", type: "SERVICE", price: 2900, cost: 900 },
];
const SELLERS = [
  { name: "Ana Ribeiro", region: "Sudeste" }, { name: "Bruno Carvalho", region: "Sul" }, { name: "Carla Mendes", region: "Nordeste" },
  { name: "Diego Almeida", region: "Sudeste" }, { name: "Elisa Martins", region: "Centro-Oeste" }, { name: "Fábio Souza", region: "Norte" },
];
const SUPPLIERS = ["Fornecedora Industrial Delta", "Importadora Técnica Ômega", "Metalúrgica Fornece Bem", "Distribuidora de Peças Sigma", "Imobiliária Centro", "Companhia de Energia Regional", "Agência Criativa Impulso", "SoftGestão Sistemas", "Transportes Expresso", "Contabilidade & Jurídico Associados", "Banco Alfa"];
const SEASON = [0.85, 0.88, 0.97, 0.98, 1.0, 0.97, 0.95, 1.02, 1.03, 1.06, 1.1, 1.2];

interface ExpenseDef {
  category: string;
  base: number;
  supplier?: string;
  kind: "fixed" | "pctRevenue" | "noCash";
  pct?: number;
  dueDay: number;
  department: string;
  costCenter: string;
}
const EXPENSES: ExpenseDef[] = [
  { category: "Salários e encargos", base: 58000, kind: "fixed", dueDay: 5, department: "Pessoas", costCenter: "ADM" },
  { category: "Pró-labore", base: 15000, kind: "fixed", dueDay: 5, department: "Diretoria", costCenter: "ADM" },
  { category: "Aluguel", base: 14000, supplier: "Imobiliária Centro", kind: "fixed", dueDay: 10, department: "Administrativo", costCenter: "ADM" },
  { category: "Energia elétrica", base: 3200, supplier: "Companhia de Energia Regional", kind: "fixed", dueDay: 15, department: "Operações", costCenter: "OPS" },
  { category: "Marketing e publicidade", base: 9000, supplier: "Agência Criativa Impulso", kind: "fixed", dueDay: 12, department: "Comercial", costCenter: "COM" },
  { category: "Sistemas e software", base: 4500, supplier: "SoftGestão Sistemas", kind: "fixed", dueDay: 8, department: "Tecnologia", costCenter: "ADM" },
  { category: "Fretes sobre vendas", base: 0, supplier: "Transportes Expresso", kind: "pctRevenue", pct: 0.022, dueDay: 20, department: "Logística", costCenter: "OPS" },
  { category: "Comissões de vendas", base: 0, kind: "pctRevenue", pct: 0.03, dueDay: 10, department: "Comercial", costCenter: "COM" },
  { category: "Manutenção", base: 3000, kind: "fixed", dueDay: 18, department: "Operações", costCenter: "OPS" },
  { category: "Despesas administrativas", base: 5000, kind: "fixed", dueDay: 15, department: "Administrativo", costCenter: "ADM" },
  { category: "Serviços contábeis e jurídicos", base: 4000, supplier: "Contabilidade & Jurídico Associados", kind: "fixed", dueDay: 10, department: "Administrativo", costCenter: "ADM" },
  { category: "Viagens", base: 2000, kind: "fixed", dueDay: 25, department: "Comercial", costCenter: "COM" },
  { category: "Tarifas bancárias", base: 900, supplier: "Banco Alfa", kind: "fixed", dueDay: 3, department: "Financeiro", costCenter: "FIN" },
  { category: "Juros e encargos financeiros", base: 2400, supplier: "Banco Alfa", kind: "fixed", dueDay: 3, department: "Financeiro", costCenter: "FIN" },
  { category: "Depreciação", base: 6000, kind: "noCash", dueDay: 0, department: "Administrativo", costCenter: "ADM" },
  { category: "IRPJ e CSLL", base: 0, kind: "pctRevenue", pct: 0.021, dueDay: 28, department: "Financeiro", costCenter: "FIN" },
];

const CHART: { code: string; name: string; group: DreGroup; aliases: string[]; sensitive?: boolean }[] = [
  { code: "3.1", name: "Receita de vendas e serviços", group: "GROSS_REVENUE", aliases: ["Receita de serviços de instalação"] },
  { code: "3.2", name: "Deduções da receita", group: "DEDUCTIONS", aliases: ["Devoluções"] },
  { code: "4.1", name: "Custo das mercadorias vendidas", group: "COGS", aliases: ["CMV"] },
  { code: "5.1", name: "Despesas com pessoal", group: "OPERATING_EXPENSES", aliases: ["Salários e encargos", "Pró-labore"], sensitive: true },
  { code: "5.2", name: "Despesas comerciais", group: "OPERATING_EXPENSES", aliases: ["Marketing e publicidade", "Comissões de vendas", "Fretes sobre vendas", "Viagens"] },
  { code: "5.3", name: "Despesas administrativas", group: "OPERATING_EXPENSES", aliases: ["Aluguel", "Energia elétrica", "Sistemas e software", "Manutenção", "Despesas administrativas", "Serviços contábeis e jurídicos"] },
  { code: "6.1", name: "Depreciação e amortização", group: "DEPRECIATION", aliases: ["Depreciação"] },
  { code: "7.1", name: "Receitas financeiras", group: "FINANCIAL_INCOME", aliases: ["Rendimentos de aplicações"] },
  { code: "7.2", name: "Despesas financeiras", group: "FINANCIAL_EXPENSES", aliases: ["Tarifas bancárias", "Juros e encargos financeiros"] },
  { code: "8.1", name: "IRPJ e CSLL", group: "INCOME_TAXES", aliases: ["IRPJ e CSLL"] },
];

/** Senha das contas demo: sempre de SEED_DEMO_PASSWORD em produção; valor padrão apenas em desenvolvimento local. */
function demoPassword(): string | null {
  const fromEnv = process.env.SEED_DEMO_PASSWORD?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") return null;
  console.warn("• SEED_DEMO_PASSWORD não definida: usando a senha padrão de desenvolvimento para as contas demo.");
  return "Demo@2026cortex";
}

async function seedDemo(roles: Record<string, string>) {
  const existing = await prisma.tenant.findUnique({ where: { slug: "jr-demo" } });
  if (existing && !existing.isDemo) {
    // Proteção: nunca apagar um tenant real que por acaso use o slug "jr-demo".
    console.log("• Tenant com slug jr-demo não é demonstrativo — seed demo ignorado.");
    return null;
  }
  if (existing) {
    if (process.env.SEED_RESET_DEMO !== "1") {
      console.log("• Tenant JR Demo já existe — mantido sem alterações (defina SEED_RESET_DEMO=1 para recriar os dados demonstrativos).");
      return null;
    }
    console.log("• SEED_RESET_DEMO=1: recriando o tenant JR Demo (somente dados demonstrativos)...");
    await prisma.user.deleteMany({ where: { tenantId: existing.id } });
    await prisma.tenant.delete({ where: { id: existing.id } });
  }
  const password = demoPassword();
  if (!password) {
    console.log("• Ambiente de produção sem SEED_DEMO_PASSWORD — tenant demonstrativo não criado.");
    return null;
  }
  const today = todaySP();
  const tenant = await prisma.tenant.create({
    data: {
      name: "JR Demo",
      slug: "jr-demo",
      cnpj: "00.000.000/0001-00",
      segment: "Distribuição e serviços industriais (DEMONSTRATIVO)",
      plan: "BUSINESS",
      status: "ACTIVE",
      isDemo: true,
      onboardingCompleted: true,
      revenueGoalMonthly: 560000,
      marginGoalPct: 8,
      minCashBalance: 120000,
      subscription: { create: { plan: "BUSINESS", provider: "NONE", status: "demo", seats: 20 } },
    },
  });
  const tid = tenant.id;

  const pwd = await bcrypt.hash(password, 12);
  const demoUsers: [string, string, RoleKey][] = [
    ["admin@demo.jrcortex.com.br", "Administrador Demo", "ADMIN_CLIENTE"],
    ["diretor@demo.jrcortex.com.br", "Diretoria Demo", "DIRETOR"],
    ["financeiro@demo.jrcortex.com.br", "Financeiro Demo", "FINANCEIRO"],
    ["comercial@demo.jrcortex.com.br", "Comercial Demo", "COMERCIAL"],
    ["analista@demo.jrcortex.com.br", "Analista Demo", "ANALISTA"],
    ["viewer@demo.jrcortex.com.br", "Visualizador Demo", "VIEWER"],
  ];
  for (const [email, name, role] of demoUsers) {
    await prisma.user.upsert({ where: { email }, create: { email, name, passwordHash: pwd, roleId: roles[role], tenantId: tid }, update: { tenantId: tid, roleId: roles[role], passwordHash: pwd, active: true } });
  }

  const integration = await prisma.integration.create({
    data: { tenantId: tid, name: "DADOS DEMONSTRATIVOS — ERP Demo", type: "ERP", provider: "mock-erp", status: "CONNECTED", isMock: true, syncIntervalMinutes: 1440, lastSyncAt: new Date(), nextSyncAt: new Date(Date.now() + 86_400_000) },
  });
  const ds = await prisma.dataSource.create({
    data: { tenantId: tid, name: "DADOS DEMONSTRATIVOS — ERP Demo", kind: "DEMO", integrationId: integration.id, description: "Dados fictícios gerados para demonstração. Não representam nenhuma empresa real." },
  });
  const base = { tenantId: tid, dataSourceId: ds.id };

  await prisma.chartAccount.createMany({ data: CHART.map((c) => ({ tenantId: tid, code: c.code, name: c.name, dreGroup: c.group, categoryAliases: c.aliases, isSensitive: c.sensitive ?? false })) });

  const costCenters = ["ADM", "COM", "OPS", "FIN"].map((code) => ({ id: randomUUID(), ...base, externalId: `CC-${code}`, code, name: { ADM: "Administrativo", COM: "Comercial", OPS: "Operações", FIN: "Financeiro" }[code]!, department: code }));
  await prisma.costCenter.createMany({ data: costCenters });
  const ccId = (code: string) => costCenters.find((c) => c.code === code)!.id;

  const suppliers = SUPPLIERS.map((name, i) => ({ id: randomUUID(), ...base, externalId: `F${i + 1}`, name, category: i < 4 ? "Mercadorias" : "Serviços" }));
  await prisma.supplier.createMany({ data: suppliers });
  const supplierId = (name: string) => suppliers.find((s) => s.name === name)?.id ?? null;

  const sellers = SELLERS.map((s, i) => ({ id: randomUUID(), ...base, externalId: `V${i + 1}`, name: s.name, region: s.region, email: `${s.name.split(" ")[0].toLowerCase()}@demo.jrcortex.com.br`, team: "Comercial" }));
  await prisma.seller.createMany({ data: sellers });

  const products = PRODUCTS.map((p, i) => ({ id: randomUUID(), ...base, externalId: `P${i + 1}`, sku: `SKU-${1000 + i}`, name: p.name, category: p.category, type: p.type, unitPrice: p.price, unitCost: p.cost }));
  await prisma.product.createMany({ data: products });

  const customers = CUSTOMER_NAMES.map((name, i) => {
    const region = REGIONS[i % 5];
    return {
      id: randomUUID(), ...base, externalId: `C${i + 1}`, name, document: `${String(10 + i).padStart(2, "0")}.${int(100, 999)}.${int(100, 999)}/0001-${int(10, 99)}`,
      segment: pick(SEGMENTS), region, city: null, state: null, email: null,
    };
  });
  await prisma.customer.createMany({ data: customers });
  const weights = customers.map((_, i) => 1 / Math.pow(i + 1, 0.85));
  const sellerOf = customers.map((_, i) => sellers[i % sellers.length].id);

  const accounts = [
    { id: randomUUID(), ...base, externalId: "BANCO-1", name: "Banco Alfa — Conta Movimento", bank: "Banco Alfa (fictício)", type: "CHECKING", openingBalance: 0, openingDate: utc(today.getUTCFullYear(), today.getUTCMonth() - 25, 1) },
    { id: randomUUID(), ...base, externalId: "BANCO-2", name: "Banco Beta — Conta Recebimentos", bank: "Banco Beta (fictício)", type: "CHECKING", openingBalance: 0, openingDate: utc(today.getUTCFullYear(), today.getUTCMonth() - 25, 1) },
  ];

  // ───────── vendas ─────────
  const start = utc(today.getUTCFullYear(), today.getUTCMonth() - 25, 1);
  const sales: Prisma.SaleCreateManyInput[] = [];
  const items: Prisma.SaleItemCreateManyInput[] = [];
  const receivables: Prisma.AccountReceivableCreateManyInput[] = [];
  const payables: Prisma.AccountPayableCreateManyInput[] = [];
  const payments: Prisma.PaymentCreateManyInput[] = [];
  const expenses: Prisma.ExpenseCreateManyInput[] = [];
  const revenues: Prisma.RevenueCreateManyInput[] = [];
  const monthlyNet = new Map<string, number>();
  const monthlyCogs = new Map<string, number>();
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let saleSeq = 0;
  let recSeq = 0;
  let paySeq = 0;

  const productWeights = PRODUCTS.map((p) => (p.type === "SERVICE" ? 1 : p.price > 2000 ? 0.5 : 2));
  const productWeightTotal = productWeights.reduce((a, b) => a + b, 0);
  const pickProduct = () => {
    let r = rand() * productWeightTotal;
    for (let i = 0; i < productWeights.length; i++) {
      r -= productWeights[i];
      if (r <= 0) return i;
    }
    return 0;
  };

  const pickCustomer = (d: Date) => {
    const daysAgo = Math.round((today.getTime() - d.getTime()) / 86_400_000);
    const w = weights.map((wt, i) => {
      if (i === 0 && daysAgo < 80) return wt * 0.35; // maior cliente reduzindo compras (insight)
      if ([7, 13, 22, 31].includes(i) && daysAgo < 95) return 0; // clientes que pararam de comprar
      if (i === 4 && daysAgo < 90) return wt * 1.9; // cliente em expansão
      if (i >= 50 && daysAgo > 120) return 0; // clientes novos recentes
      return wt;
    });
    const total = w.reduce((a, b) => a + b, 0) || totalWeight;
    let r = rand() * total;
    for (let i = 0; i < w.length; i++) {
      r -= w[i];
      if (r <= 0) return i;
    }
    return 0;
  };

  for (let d = start; d.getTime() <= today.getTime(); d = addDays(d, 1)) {
    const dow = d.getUTCDay();
    if (dow === 0) continue;
    const monthsFromStart = (d.getUTCFullYear() - start.getUTCFullYear()) * 12 + d.getUTCMonth() - start.getUTCMonth();
    const trend = 1 + monthsFromStart * 0.009;
    const season = SEASON[d.getUTCMonth()];
    const expected = (dow === 6 ? 2 : 6) * trend * season;
    const count = Math.max(0, Math.round(expected + between(-2, 2)));
    for (let s = 0; s < count; s++) {
      saleSeq++;
      const ci = pickCustomer(d);
      const saleId = randomUUID();
      const roll = rand();
      const nItems = roll < 0.7 ? 1 : roll < 0.95 ? 2 : 3;
      let gross = 0;
      let cost = 0;
      let category = "";
      for (let li = 0; li < nItems; li++) {
        const pi = rand() < 0.12 ? 3 : pickProduct(); // "Linha Econômica" relevante e com margem baixa
        const p = PRODUCTS[pi];
        const qty = p.type === "SERVICE" || p.price > 2000 ? 1 : int(1, 8);
        const price = r2(p.price * between(0.95, 1.05) * (1 + monthsFromStart * 0.003));
        const total = r2(price * qty);
        const tc = r2(p.cost * qty * between(0.97, 1.03) * (1 + monthsFromStart * 0.0035));
        gross += total;
        cost += tc;
        if (!category) category = p.category;
        items.push({ id: randomUUID(), tenantId: tid, saleId, productId: products[pi].id, lineNumber: li + 1, quantity: qty, unitPrice: price, discount: 0, total, totalCost: tc });
      }
      gross = r2(gross);
      const discount = r2(gross * (rand() < 0.35 ? between(0.02, 0.08) : 0));
      const tax = r2((gross - discount) * 0.0925);
      const net = r2(gross - discount - tax);
      const cancelled = rand() < 0.015;
      sales.push({
        id: saleId, ...base, externalId: `S${saleSeq}`, number: `PV-${100000 + saleSeq}`, date: d, customerId: customers[ci].id, sellerId: sellerOf[ci],
        status: cancelled ? "CANCELLED" : "COMPLETED", grossAmount: gross, discountAmount: discount, taxAmount: tax, netAmount: net, costAmount: r2(cost),
        region: customers[ci].region, channel: rand() < 0.7 ? "Vendas diretas" : "E-commerce B2B", category,
      });
      if (cancelled) continue;
      const mk = key(d);
      monthlyNet.set(mk, (monthlyNet.get(mk) ?? 0) + net);
      monthlyCogs.set(mk, (monthlyCogs.get(mk) ?? 0) + cost);

      // contas a receber (parcelado)
      const receivable = gross - discount;
      const inst = receivable > 6000 ? 3 : receivable > 2500 ? 2 : 1;
      for (let k = 1; k <= inst; k++) {
        recSeq++;
        const amount = r2(receivable / inst);
        const due = businessDay(addDays(d, 30 * k));
        let receivedAt: Date | null = null;
        const r = rand();
        const lateCustomer = ci === 2 || ci === 17;
        const old = today.getTime() - due.getTime() > 150 * 86_400_000;
        if (r < (lateCustomer ? 0.55 : 0.93)) receivedAt = businessDay(addDays(due, int(-1, 1)));
        else if (old || r < (lateCustomer ? 0.8 : 0.985)) receivedAt = businessDay(addDays(due, int(12, 45)));
        if (receivedAt && receivedAt.getTime() > today.getTime()) receivedAt = null;
        const recId = randomUUID();
        receivables.push({
          id: recId, ...base, externalId: `R${recSeq}`, description: `PV-${100000 + saleSeq} parcela ${k}/${inst}`, customerId: customers[ci].id, saleId,
          issueDate: d, dueDate: due, amount, receivedAmount: receivedAt ? amount : 0, receivedAt, status: receivedAt ? "PAID" : "OPEN",
        });
        if (receivedAt) {
          paySeq++;
          payments.push({ id: randomUUID(), ...base, externalId: `PG${paySeq}`, direction: "IN", date: receivedAt, amount, description: `Recebimento ${customers[ci].name}`, category: "Recebimento de clientes", financialAccountId: accounts[rand() < 0.6 ? 1 : 0].id, receivableId: recId });
        }
      }
    }
  }

  // ───────── despesas, compras e contas a pagar ─────────
  const addPayable = (description: string, category: string, supplier: string | null, cc: string | null, department: string, issue: Date, due: Date, amount: number, forceOpen = false) => {
    paySeq++;
    const id = randomUUID();
    const recent = today.getTime() - due.getTime() < 45 * 86_400_000;
    const paid = !forceOpen && due.getTime() < today.getTime() && (!recent || rand() > 0.985);
    payables.push({
      id, ...base, externalId: `AP${paySeq}`, description, category, supplierId: supplier ? supplierId(supplier) : null, costCenterId: cc, department,
      companyUnit: rand() < 0.8 ? "Matriz" : "Filial Sul", issueDate: issue, dueDate: due, amount: r2(amount), paidAmount: paid ? r2(amount) : 0, paidAt: paid ? due : null, status: paid ? "PAID" : "OPEN",
    });
    if (paid) payments.push({ id: randomUUID(), ...base, externalId: `PGO${paySeq}`, direction: "OUT", date: due, amount: r2(amount), description, category, financialAccountId: accounts[0].id, payableId: id });
  };

  for (let m = new Date(start); m.getTime() <= today.getTime(); m = utc(m.getUTCFullYear(), m.getUTCMonth() + 1, 1)) {
    const mk = key(m);
    const y = m.getUTCFullYear();
    const mo = m.getUTCMonth();
    const monthsFromStart = (y - start.getUTCFullYear()) * 12 + mo - start.getUTCMonth();
    const lastDay = utc(y, mo + 1, 0).getUTCDate();
    const isCurrent = y === today.getUTCFullYear() && mo === today.getUTCMonth();
    const net = monthlyNet.get(mk) ?? 0;
    const inflation = 1 + monthsFromStart * 0.006;
    const monthsToNow = (today.getUTCFullYear() - y) * 12 + today.getUTCMonth() - mo;

    for (const e of EXPENSES) {
      let monthly = e.kind === "pctRevenue" ? net * (e.pct ?? 0) : e.base * inflation * between(0.94, 1.06);
      if (e.category === "Marketing e publicidade" && monthsToNow >= 0 && monthsToNow <= 3) monthly *= 1.55; // aumento recente (insight)
      if (e.category === "Energia elétrica" && [11, 0, 1].includes(mo)) monthly *= 1.15;
      if (isCurrent && e.kind === "pctRevenue") monthly = net * (e.pct ?? 0);
      // competência distribuída em 4 lançamentos (dias 7, 14, 21, 28)
      [7, 14, 21, 28].forEach((day, w) => {
        const date = utc(y, mo, Math.min(day, lastDay));
        if (date.getTime() > today.getTime()) return;
        expenses.push({ id: randomUUID(), ...base, externalId: `E${mk}-${e.category}-${w}`, date, description: `${e.category} — ${String(mo + 1).padStart(2, "0")}/${y} (${w + 1}/4)`, category: e.category, amount: r2(monthly / 4), supplierId: e.supplier ? supplierId(e.supplier) : null, costCenterId: ccId(e.costCenter), department: e.department });
      });
      if (e.kind === "noCash") continue;
      // título a pagar do mês (inclusive o mês corrente: valores já programados)
      const due = businessDay(utc(y, mo + 1, e.dueDay));
      addPayable(`${e.category} — competência ${String(mo + 1).padStart(2, "0")}/${y}`, e.category, e.supplier ?? null, ccId(e.costCenter), e.department, utc(y, mo, lastDay), due, isCurrent && e.kind === "pctRevenue" ? (monthly * lastDay) / today.getUTCDate() : monthly);
    }

    // receitas não operacionais/financeiras
    [["Rendimentos de aplicações", 1100 * inflation], ["Receita de serviços de instalação", 7800 * inflation * SEASON[mo]]].forEach(([cat, val]) => {
      const date = utc(y, mo, Math.min(20, lastDay));
      if (date.getTime() > today.getTime()) return;
      revenues.push({ id: randomUUID(), ...base, externalId: `RV${mk}-${cat}`, date, description: `${cat} ${String(mo + 1).padStart(2, "0")}/${y}`, category: String(cat), amount: r2(Number(val) * between(0.9, 1.1)) });
      paySeq++;
      if (addDays(date, 2).getTime() <= today.getTime()) {
        payments.push({ id: randomUUID(), ...base, externalId: `PGR${paySeq}`, direction: "IN", date: addDays(date, 2), amount: r2(Number(val)), description: String(cat), category: String(cat), financialAccountId: accounts[0].id });
      }
    });

    // compras de mercadorias (reposição ~ CMV do mês), semanais, com prazo de 28 dias
    const cogs = monthlyCogs.get(mk) ?? 0;
    const projectedCogs = isCurrent ? (cogs * lastDay) / Math.max(1, today.getUTCDate()) : cogs;
    for (let w = 0; w < 4; w++) {
      const issue = utc(y, mo, 3 + w * 7);
      addPayable(`Compra de mercadorias — lote ${mk}-${w + 1}`, "Compra de mercadorias", SUPPLIERS[w % 4], ccId("OPS"), "Suprimentos", issue, businessDay(addDays(issue, 28 + int(0, 6))), (projectedCogs / 4) * between(0.95, 1.05));
    }
  }

  // saldo de abertura calibrado para que o caixa atual fique em ~R$ 310 mil
  const inflow = payments.filter((p) => p.direction === "IN").reduce((a, p) => a + Number(p.amount), 0);
  const outflow = payments.filter((p) => p.direction === "OUT").reduce((a, p) => a + Number(p.amount), 0);
  const target = 265000;
  const opening = r2(target - (inflow - outflow));
  accounts[0].openingBalance = r2(opening * 0.7);
  accounts[1].openingBalance = r2(opening - accounts[0].openingBalance);
  await prisma.financialAccount.createMany({ data: accounts });

  console.log(`• Inserindo ${sales.length} vendas, ${items.length} itens, ${receivables.length} recebíveis, ${payables.length} títulos a pagar, ${payments.length} pagamentos, ${expenses.length} despesas...`);
  await chunked(sales, (c) => prisma.sale.createMany({ data: c }));
  await chunked(items, (c) => prisma.saleItem.createMany({ data: c }));
  await chunked(receivables, (c) => prisma.accountReceivable.createMany({ data: c }));
  await chunked(payables, (c) => prisma.accountPayable.createMany({ data: c }));
  await chunked(payments, (c) => prisma.payment.createMany({ data: c }));
  await chunked(expenses, (c) => prisma.expense.createMany({ data: c }));
  await chunked(revenues, (c) => prisma.revenue.createMany({ data: c }));

  // estoque: entradas por compras e saídas por vendas nos últimos 90 dias
  const inv: Prisma.InventoryMovementCreateManyInput[] = [];
  products.forEach((p, i) => {
    if (PRODUCTS[i].type === "SERVICE") return;
    inv.push({ id: randomUUID(), ...base, externalId: `INV-IN-${i}`, productId: p.id, date: addDays(today, -90), type: "IN", quantity: int(40, 160), unitCost: PRODUCTS[i].cost, warehouse: "CD Principal" });
    inv.push({ id: randomUUID(), ...base, externalId: `INV-OUT-${i}`, productId: p.id, date: addDays(today, -10), type: "OUT", quantity: int(10, 35), unitCost: PRODUCTS[i].cost, warehouse: "CD Principal" });
  });
  await prisma.inventoryMovement.createMany({ data: inv });

  // ───────── conhecimento, KPIs, metas, integrações ─────────
  await prisma.knowledgeItem.createMany({
    data: [
      { tenantId: tid, type: "INDICATOR", title: "EBITDA", content: "EBITDA = Lucro bruto − Despesas operacionais (antes de depreciação, amortização, resultado financeiro e impostos sobre o lucro).", tags: ["ebitda", "resultado"] },
      { tenantId: tid, type: "INDICATOR", title: "Margem líquida", content: "Margem líquida = Lucro líquido ÷ Receita líquida × 100.", tags: ["margem", "lucro"] },
      { tenantId: tid, type: "INDICATOR", title: "Ticket médio", content: "Ticket médio = Faturamento bruto ÷ número de vendas concluídas no período.", tags: ["ticket", "vendas"] },
      { tenantId: tid, type: "ACCOUNTING_RULE", title: "Regime de competência", content: "O DRE da JR Demo é elaborado pelo regime de competência: vendas pela data de emissão e despesas pela data de competência.", tags: ["dre", "competencia"] },
      { tenantId: tid, type: "POLICY", title: "Política de caixa mínimo", content: "A empresa deve manter caixa mínimo de R$ 120.000,00. Abaixo disso, a diretoria financeira deve ser acionada.", tags: ["caixa", "politica"] },
      { tenantId: tid, type: "GOAL", title: "Meta de faturamento", content: "Meta mensal de faturamento de R$ 560.000,00 e meta de margem líquida de 8%.", tags: ["meta", "faturamento"] },
      { tenantId: tid, type: "COMPANY_CONTEXT", title: "Contexto da empresa (DEMONSTRATIVO)", content: "Empresa fictícia de distribuição de equipamentos industriais e serviços de manutenção, com vendas B2B em todas as regiões do Brasil.", tags: ["empresa", "contexto"] },
      { tenantId: tid, type: "SYSTEM", title: "Origem dos dados (DEMONSTRATIVO)", content: "Os dados da JR Demo vêm de um ERP simulado e são totalmente fictícios, gerados para demonstração do JR Cortex AI.", tags: ["sistemas", "erp"] },
    ],
  });
  await prisma.kPI.createMany({
    data: [
      { tenantId: tid, key: "net_revenue", name: "Receita líquida", description: "Receita bruta menos deduções", formula: "Receita bruta − Deduções", unit: "BRL" },
      { tenantId: tid, key: "ebitda", name: "EBITDA", description: "Resultado operacional antes de D&A", formula: "Lucro bruto − Despesas operacionais", unit: "BRL" },
      { tenantId: tid, key: "net_margin", name: "Margem líquida", description: "Lucro líquido sobre receita líquida", formula: "Lucro líquido ÷ Receita líquida", unit: "%" },
    ],
  });
  await prisma.goal.create({ data: { tenantId: tid, kpiKey: "gross_revenue", period: `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`, target: 560000 } });
  await prisma.syncJob.create({
    data: {
      tenantId: tid, integrationId: integration.id, mode: "FULL", trigger: "MANUAL", status: "SUCCESS", startedAt: new Date(Date.now() - 3_600_000), finishedAt: new Date(Date.now() - 3_550_000),
      recordsTotal: sales.length + receivables.length + payables.length, recordsProcessed: sales.length + receivables.length + payables.length, recordsCreated: sales.length + receivables.length + payables.length,
      logs: [{ ts: new Date().toISOString(), level: "info", message: "Carga inicial de DADOS DEMONSTRATIVOS (seed)." }],
    },
  });
  await prisma.integration.create({ data: { tenantId: tid, name: "Planilhas (CSV/XLSX)", type: "SPREADSHEET", provider: "xlsx", status: "CONNECTED" } });
  await prisma.auditLog.create({ data: { tenantId: tid, userEmail: "seed", action: "tenant.seeded", resource: "tenant", resourceId: tid, result: "SUCCESS", metadata: { demo: true } } });
  return tenant;
}

async function main() {
  console.log("JR Cortex AI — seed");
  const roles = await seedRbac();
  const admin = await ensureAdmin(prisma);
  if (admin.status === "created") console.log(`• Administrador criado: ${admin.email}`);
  else if (admin.status === "exists") console.log(`• Administrador já existe: ${admin.email} (senha não alterada)`);
  else console.log(`• Administrador não criado: ${admin.reason}`);
  if (process.env.SEED_SKIP_DEMO !== "1") {
    const t = await seedDemo(roles);
    if (t) console.log(`• Tenant demonstrativo criado: ${t.name} (${t.slug})`);
  }
  console.log("Seed concluído.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
