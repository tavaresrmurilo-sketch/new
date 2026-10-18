import "server-only";
import { z } from "zod";

/**
 * Variáveis de ambiente do servidor, validadas uma única vez.
 * Integrações externas são opcionais: sem credenciais, o recurso fica
 * desativado de forma explícita (nunca simulado) — veja `integrations()`.
 */
const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatória"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET precisa de pelo menos 32 caracteres"),
  SESSION_MAX_AGE_DAYS: z.coerce.number().int().min(1).max(365).default(30),

  ADMIN_EMAIL: optional,
  ADMIN_PASSWORD: optional,
  ADMIN_NAME: optional,

  // Google OAuth (opcional)
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,

  // E-mail
  EMAIL_FROM: z.string().default("Mixtour <nao-responda@localhost>"),
  EMAIL_PROVIDER: z.enum(["resend", "smtp", "none"]).default("none"),
  RESEND_API_KEY: optional,
  SMTP_HOST: optional,
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: optional,
  SMTP_PASSWORD: optional,
  SMTP_SECURE: bool,

  // Armazenamento de imagens
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage/uploads"),
  S3_ENDPOINT: optional,
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: optional,
  S3_ACCESS_KEY_ID: optional,
  S3_SECRET_ACCESS_KEY: optional,
  S3_PUBLIC_URL: optional,
  S3_FORCE_PATH_STYLE: bool,

  // Geocodificação (OpenStreetMap Nominatim por padrão)
  GEOCODER: z.enum(["nominatim", "none"]).default("nominatim"),
  NOMINATIM_URL: z.string().url().default("https://nominatim.openstreetmap.org"),
  GEOCODER_CONTACT_EMAIL: optional,
  GEOCODER_COUNTRY_CODES: z.string().default("br"),

  // Stripe
  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,

  // Web Push (VAPID)
  VAPID_PUBLIC_KEY: optional,
  VAPID_PRIVATE_KEY: optional,
  VAPID_SUBJECT: optional,

  // Push do app nativo — Android via Firebase Cloud Messaging (conta de serviço)
  FCM_PROJECT_ID: optional,
  FCM_CLIENT_EMAIL: optional,
  FCM_PRIVATE_KEY: optional,
  // Push do app nativo — iOS via APNs (chave .p8)
  APNS_KEY_ID: optional,
  APPLE_TEAM_ID: optional,
  APNS_PRIVATE_KEY: optional,
  IOS_BUNDLE_ID: optional,
  APNS_PRODUCTION: bool,
  // App Links / Universal Links (abrir links do Mixtour direto no app)
  ANDROID_APP_ID: optional,
  ANDROID_SHA256_CERT_FINGERPRINTS: optional,

  // Rotinas agendadas
  CRON_SECRET: optional,

  TRUST_PROXY: bool,
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | null = null;

export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Configuração inválida do Mixtour:\n${issues}\nVeja .env.example e docs/DEPLOY.md.`);
  }
  cached = parsed.data;
  return cached;
}

/** Somente para testes: força a releitura do ambiente. */
export function resetEnvCache() {
  cached = null;
}

/** Quais integrações externas estão realmente configuradas. */
export function integrations() {
  const e = env();
  return {
    google: Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET),
    email:
      (e.EMAIL_PROVIDER === "resend" && Boolean(e.RESEND_API_KEY)) ||
      (e.EMAIL_PROVIDER === "smtp" && Boolean(e.SMTP_HOST)),
    s3: e.STORAGE_DRIVER === "s3" && Boolean(e.S3_BUCKET && e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY),
    stripe: Boolean(e.STRIPE_SECRET_KEY),
    stripeWebhook: Boolean(e.STRIPE_SECRET_KEY && e.STRIPE_WEBHOOK_SECRET),
    push: Boolean(e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY),
    fcm: Boolean(e.FCM_PROJECT_ID && e.FCM_CLIENT_EMAIL && e.FCM_PRIVATE_KEY),
    apns: Boolean(e.APNS_KEY_ID && e.APPLE_TEAM_ID && e.APNS_PRIVATE_KEY && e.IOS_BUNDLE_ID),
    geocoder: e.GEOCODER !== "none",
    cron: Boolean(e.CRON_SECRET),
  };
}

export function appUrl(path = ""): string {
  const base = env().APP_URL.replace(/\/$/, "");
  return path ? `${base}${path.startsWith("/") ? path : `/${path}`}` : base;
}
