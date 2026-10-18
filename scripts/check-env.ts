/**
 * Diagnóstico de configuração: npm run check:env
 * Mostra o que está ativo e o que falta para cada integração — sem exibir segredos.
 */

const env = process.env;
const has = (k: string) => Boolean(env[k] && env[k]!.trim());

type Check = { name: string; ok: boolean; required?: boolean; hint: string };

const checks: Check[] = [
  { name: "Banco de dados (DATABASE_URL)", ok: has("DATABASE_URL"), required: true, hint: "PostgreSQL 14+ (Neon, Supabase, RDS...)." },
  { name: "Segredo de sessão (AUTH_SECRET ≥ 32)", ok: (env.AUTH_SECRET ?? "").length >= 32, required: true, hint: "openssl rand -base64 48" },
  { name: "URL pública (APP_URL)", ok: has("APP_URL"), required: true, hint: "Ex.: https://mixtour.app" },
  { name: "Administrador (ADMIN_EMAIL/ADMIN_PASSWORD)", ok: has("ADMIN_EMAIL") && (env.ADMIN_PASSWORD ?? "").length >= 12, hint: "Criado pelo seed (npm run db:seed)." },
  {
    name: "E-mail transacional",
    ok: (env.EMAIL_PROVIDER === "resend" && has("RESEND_API_KEY")) || (env.EMAIL_PROVIDER === "smtp" && has("SMTP_HOST")),
    hint: "EMAIL_PROVIDER=resend + RESEND_API_KEY, ou EMAIL_PROVIDER=smtp + SMTP_*. Sem isso, e-mails ficam no outbox (/admin/emails).",
  },
  {
    name: "Imagens em S3/R2",
    ok: env.STORAGE_DRIVER === "s3" && ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_PUBLIC_URL"].every(has),
    hint: "Obrigatório na Vercel (disco temporário). STORAGE_DRIVER=s3 + S3_*.",
  },
  { name: "Assinaturas (Stripe)", ok: has("STRIPE_SECRET_KEY") && has("STRIPE_WEBHOOK_SECRET"), hint: "STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET e STRIPE_PRICE_* (depois rode o seed)." },
  { name: "Login com Google", ok: has("GOOGLE_CLIENT_ID") && has("GOOGLE_CLIENT_SECRET"), hint: "Redirect URI: {APP_URL}/api/auth/google/callback" },
  { name: "Web Push (VAPID)", ok: has("VAPID_PUBLIC_KEY") && has("VAPID_PRIVATE_KEY") && has("NEXT_PUBLIC_VAPID_PUBLIC_KEY"), hint: "npx web-push generate-vapid-keys" },
  { name: "Push no app Android (FCM)", ok: ["FCM_PROJECT_ID", "FCM_CLIENT_EMAIL", "FCM_PRIVATE_KEY"].every(has), hint: "Conta de serviço do Firebase — docs/MOBILE.md." },
  { name: "Push no app iOS (APNs)", ok: ["APNS_KEY_ID", "APPLE_TEAM_ID", "APNS_PRIVATE_KEY", "IOS_BUNDLE_ID"].every(has), hint: "Chave .p8 do APNs — docs/MOBILE.md." },
  { name: "Links abrindo no app (App Links / Universal Links)", ok: (has("ANDROID_APP_ID") && has("ANDROID_SHA256_CERT_FINGERPRINTS")) || (has("APPLE_TEAM_ID") && has("IOS_BUNDLE_ID")), hint: "ANDROID_* e/ou APPLE_TEAM_ID + IOS_BUNDLE_ID — docs/MOBILE.md." },
  { name: "Rotinas agendadas (CRON_SECRET)", ok: has("CRON_SECRET"), hint: "A Vercel envia Authorization: Bearer $CRON_SECRET." },
  { name: "Geocodificação", ok: env.GEOCODER !== "none", hint: "Nominatim exige GEOCODER_CONTACT_EMAIL; para volume alto, use um provedor dedicado." },
];

let missingRequired = 0;
console.log("\nMixtour — diagnóstico de configuração\n");
for (const c of checks) {
  const mark = c.ok ? "✓" : c.required ? "✗" : "•";
  if (!c.ok && c.required) missingRequired++;
  console.log(`${mark} ${c.name}${c.ok ? "" : `\n    ${c.hint}`}`);
}
console.log(missingRequired ? `\n${missingRequired} item(ns) obrigatório(s) pendente(s).\n` : "\nConfiguração mínima OK.\n");
process.exit(missingRequired ? 1 : 0);
