/**
 * Seed opcional. Em produção cria apenas o necessário para a plataforma funcionar:
 * catálogo de permissões, planos padrão (configuração) e o SUPER_ADMIN definido por variáveis de ambiente.
 * Com SEED_DEMO=true, cria também um workspace de DEMONSTRAÇÃO claramente sinalizado.
 *
 * Executar: npm run db:seed   (Windows: npm.cmd run db:seed)
 */
import "../scripts/load-env";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/server/auth/password";
import { generateDemoData } from "@/server/demo/generate";
import { createOrganization } from "@/server/modules/organization/setup";
import { ensurePermissions, ensurePlans } from "@/server/platform";

async function main() {
  await ensurePermissions();
  await ensurePlans();
  console.log("✓ Permissões e planos padrão verificados");

  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (email && password) {
    if (password.length < 10) throw new Error("SUPER_ADMIN_PASSWORD deve ter ao menos 10 caracteres.");
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.user.update({ where: { id: existing.id }, data: { isSuperAdmin: true } });
      console.log(`✓ SUPER_ADMIN já existia: ${email} (senha mantida)`);
    } else {
      await prisma.user.create({ data: { email, name: process.env.SUPER_ADMIN_NAME?.trim() || "Administrador", passwordHash: await hashPassword(password), isSuperAdmin: true, emailVerifiedAt: new Date() } });
      console.log(`✓ SUPER_ADMIN criado: ${email}`);
    }
  } else {
    console.log("• SUPER_ADMIN_EMAIL/SUPER_ADMIN_PASSWORD não definidos — nenhum administrador criado.");
  }

  if (process.env.SEED_DEMO === "true") {
    const demoEmail = "demo@jrcortex.local";
    if (await prisma.user.findUnique({ where: { email: demoEmail } })) {
      console.log("• Workspace de demonstração já existe — mantido.");
    } else {
      const demoPassword = process.env.DEMO_USER_PASSWORD || "Demo@cortex2026";
      const user = await prisma.user.create({ data: { email: demoEmail, name: "Usuário Demonstração", passwordHash: await hashPassword(demoPassword), emailVerifiedAt: new Date() } });
      const { organization } = await createOrganization({ name: "Empresa Demonstração", ownerUserId: user.id, segment: "Engenharia", isDemo: true, ownerTitle: "Diretor(a)" });
      const business = await prisma.plan.findFirst({ where: { key: "BUSINESS" } });
      if (business) await prisma.subscription.update({ where: { organizationId: organization.id }, data: { planId: business.id, status: "ACTIVE", trialEndsAt: null } });
      await prisma.organization.update({ where: { id: organization.id }, data: { onboardingCompletedAt: new Date(), onboardingStep: 8 } });
      await generateDemoData(prisma, organization.id, user.id);
      console.log(`✓ Workspace DEMO criado — login: ${demoEmail} / senha: ${process.env.DEMO_USER_PASSWORD ? "(DEMO_USER_PASSWORD)" : demoPassword}`);
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
