/**
 * Seed idempotente: taxonomia de categorias, configuração dos planos e conta
 * de administrador (ADMIN_EMAIL/ADMIN_PASSWORD). NÃO cria eventos nem dados fictícios.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { CATEGORY_SEED } from "../src/lib/categories";
import { PLAN_SEED } from "../src/lib/plans";

const prisma = new PrismaClient();

async function main() {
  for (const [i, c] of CATEGORY_SEED.entries()) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      create: { ...c, sortOrder: i },
      update: {}, // preserva edições feitas no /admin
    });
  }
  console.log(`✓ ${CATEGORY_SEED.length} categorias`);

  const priceEnv: Record<string, { monthly?: string; yearly?: string }> = {
    PRO: { monthly: process.env.STRIPE_PRICE_PRO_MONTHLY, yearly: process.env.STRIPE_PRICE_PRO_YEARLY },
    BUSINESS: { monthly: process.env.STRIPE_PRICE_BUSINESS_MONTHLY, yearly: process.env.STRIPE_PRICE_BUSINESS_YEARLY },
  };
  for (const p of PLAN_SEED) {
    const prices = priceEnv[p.tier] ?? {};
    const stripe = {
      ...(prices.monthly ? { stripePriceMonthly: prices.monthly } : {}),
      ...(prices.yearly ? { stripePriceYearly: prices.yearly } : {}),
    };
    await prisma.plan.upsert({ where: { tier: p.tier }, create: { ...p, ...stripe }, update: stripe });
  }
  console.log(`✓ ${PLAN_SEED.length} planos`);

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    if (password.length < 12) throw new Error("ADMIN_PASSWORD precisa de pelo menos 12 caracteres.");
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) {
      await prisma.user.create({
        data: {
          email,
          name: process.env.ADMIN_NAME?.trim() || "Equipe Mixtour",
          passwordHash: await bcrypt.hash(password, 12),
          role: "ADMIN",
          emailVerifiedAt: new Date(),
          termsAcceptedAt: new Date(),
        },
      });
      console.log(`✓ administrador criado: ${email}`);
    } else {
      await prisma.user.update({
        where: { email },
        data: {
          role: "ADMIN",
          status: "ACTIVE",
          ...(process.env.ADMIN_RESET_PASSWORD === "true" ? { passwordHash: await bcrypt.hash(password, 12) } : {}),
        },
      });
      console.log(`✓ administrador confirmado: ${email}`);
    }
  } else {
    console.log("• ADMIN_EMAIL/ADMIN_PASSWORD não definidos — nenhuma conta de administrador criada.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
