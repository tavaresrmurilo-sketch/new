/**
 * Seed da CHAVIX 3D — seguro para rodar a cada deploy.
 *
 * Sempre: cria o administrador de ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME se ele ainda
 * não existir (nunca altera a senha de um admin existente).
 *
 * Só na primeira execução em um banco vazio (sem configurações da loja):
 *  - Configurações da loja com padrões (frete e tabela do personalizado)
 *  - Categorias iniciais
 *  - Cupons CHAVIX10 e PRIMEIRACOMPRA, criados INATIVOS
 *  - Produtos de demonstração com arte original (desligue com SEED_DEMO_PRODUCTS=false)
 *
 * Assim, o que você apagar ou mudar pelo painel não volta no próximo deploy.
 */

import "./load-env";
import { db } from "../src/lib/db";
import { DEFAULT_CUSTOM_BUILDER } from "../src/lib/custom-builder";
import { DEFAULT_SHIPPING_CONFIG } from "../src/lib/shipping/config";
import { buildSearchText } from "../src/lib/catalog";
import { effectivePriceCents } from "../src/lib/pricing";
import { hashPassword, passwordProblems } from "../src/lib/security/password";
import { saveProductImage } from "../src/lib/storage";
import { CATEGORIES, FILAMENT, PRODUCTS } from "./seed-data";
import { renderKeychainPng, SHAPES } from "./seed-art";

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  const name = process.env.ADMIN_NAME?.trim() || "Administrador";
  if (!email || !password) {
    console.log("• Admin: ADMIN_EMAIL/ADMIN_PASSWORD não definidos — pulei. Use `npm run admin:create` depois.");
    return;
  }
  const problem = passwordProblems(password);
  if (problem) throw new Error(`ADMIN_PASSWORD fraca: ${problem}`);

  const existing = await db.user.findUnique({ where: { email }, include: { admin: true } });
  if (existing?.admin) {
    console.log(`• Admin ${email} já existe (senha mantida).`);
    return;
  }
  const passwordHash = await hashPassword(password);
  await db.user.upsert({
    where: { email },
    create: { email, name, passwordHash, admin: { create: { role: "OWNER" } } },
    update: { admin: { create: { role: "OWNER" } } },
  });
  console.log(`• Admin ${email} criado.`);
}

async function seedSettings() {
  await db.storeSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      storeName: "CHAVIX 3D",
      announcement: "Produção sob demanda · Pix com QR Code na hora",
      shipping: DEFAULT_SHIPPING_CONFIG,
      customBuilder: DEFAULT_CUSTOM_BUILDER,
    },
    update: {},
  });
  console.log("• Configurações da loja prontas.");
}

async function seedCategories() {
  for (const [position, category] of CATEGORIES.entries()) {
    await db.category.upsert({
      where: { slug: category.slug },
      create: { ...category, position },
      update: {},
    });
  }
  console.log(`• ${CATEGORIES.length} categorias.`);
}

async function seedCoupons() {
  await db.coupon.upsert({
    where: { code: "CHAVIX10" },
    create: { code: "CHAVIX10", description: "10% de desconto", type: "PERCENT", value: 10, minSubtotalCents: 5000, active: false },
    update: {},
  });
  await db.coupon.upsert({
    where: { code: "PRIMEIRACOMPRA" },
    create: {
      code: "PRIMEIRACOMPRA",
      description: "R$ 8 de desconto na primeira compra",
      type: "FIXED",
      value: 800,
      minSubtotalCents: 4000,
      firstPurchaseOnly: true,
      active: false,
    },
    update: {},
  });
  console.log("• Cupons CHAVIX10 e PRIMEIRACOMPRA prontos — inativos por padrão (ative em /admin/cupons).");
}

async function seedProducts() {
  if (process.env.SEED_DEMO_PRODUCTS === "false") {
    console.log("• Produtos de demonstração desativados (SEED_DEMO_PRODUCTS=false).");
    return;
  }
  const categories = await db.category.findMany();
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  let created = 0;

  for (const p of PRODUCTS) {
    if (await db.product.findUnique({ where: { slug: p.slug }, select: { id: true } })) continue;
    const category = bySlug.get(p.category);
    if (!category) throw new Error(`Categoria ${p.category} não encontrada`);

    const images = [];
    for (const img of p.art.images) {
      const png = await renderKeychainPng({
        shape: SHAPES[p.art.shape](p.art.text),
        color: FILAMENT[img.color].hex,
        reliefColor: FILAMENT[img.relief].hex,
        backdrop: img.backdrop,
      });
      images.push({ stored: await saveProductImage(png), color: FILAMENT[img.color].name });
    }

    const variantNames = p.variants.map((v) => FILAMENT[v.color].name);
    await db.product.create({
      data: {
        slug: p.slug,
        sku: p.sku,
        name: p.name,
        categoryId: category.id,
        shortDescription: p.shortDescription,
        description: p.description,
        priceCents: p.priceCents,
        promoPriceCents: p.promoPriceCents ?? null,
        effectivePriceCents: effectivePriceCents(p.priceCents, p.promoPriceCents),
        stock: p.stock,
        allowBackorder: p.allowBackorder ?? true,
        featured: p.featured ?? false,
        isNew: p.isNew ?? false,
        isBestSeller: p.isBestSeller ?? false,
        widthMm: p.dims[0],
        heightMm: p.dims[1],
        depthMm: p.dims[2],
        weightGrams: p.weightGrams,
        material: p.material,
        productionDays: p.productionDays,
        searchText: buildSearchText([p.name, p.shortDescription, p.sku, category.name, p.material, ...variantNames]),
        images: {
          create: images.map(({ stored, color }, position) => ({
            url: stored.url,
            thumbUrl: stored.thumbUrl,
            storageKey: stored.storageKey,
            thumbKey: stored.thumbKey,
            width: stored.width,
            height: stored.height,
            alt: `Chaveiro ${p.name} em ${color.toLowerCase()}, impresso em 3D`,
            position,
          })),
        },
        variants: {
          create: p.variants.map((v, position) => ({
            name: FILAMENT[v.color].name,
            colorHex: FILAMENT[v.color].hex,
            priceDeltaCents: v.priceDeltaCents ?? 0,
            position,
          })),
        },
        customizations: {
          create: (p.customizations ?? []).map((c, position) => ({
            label: c.label,
            type: c.type,
            required: c.required ?? false,
            placeholder: c.placeholder ?? null,
            maxLength: c.maxLength ?? null,
            priceCents: c.priceCents ?? 0,
            options: c.options ?? undefined,
            position,
          })),
        },
      },
    });
    created++;
    process.stdout.write(`  ✓ ${p.name}\n`);
  }
  console.log(`• ${created} produto(s) de demonstração criados.`);
}

async function main() {
  console.log("Semeando CHAVIX 3D…");
  await seedAdmin();
  const firstRun = !(await db.storeSettings.findUnique({ where: { id: "default" }, select: { id: true } }));
  if (!firstRun) {
    console.log("• Loja já configurada: catálogo, cupons e configurações não foram alterados.");
    console.log("Pronto.");
    return;
  }
  await seedCategories();
  await seedCoupons();
  await seedProducts();
  // Por último: a existência das configurações marca o banco como já semeado.
  await seedSettings();
  console.log("Pronto.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
