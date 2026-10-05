import "server-only";
import { z } from "zod";

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL não configurada"),
  AUTH_SECRET: optional,
  APP_URL: optional,
  ENCRYPTION_KEY: optional,
  AI_PROVIDER: optional,
  AI_MODEL: optional,
  OPENAI_API_KEY: optional,
  OPENAI_BASE_URL: optional,
  ANTHROPIC_API_KEY: optional,
  GOOGLE_GENERATIVE_AI_API_KEY: optional,
  LOCAL_AI_URL: optional,
  RESEND_API_KEY: optional,
  EMAIL_FROM: optional,
  STORAGE_PROVIDER: optional,
  STORAGE_LOCAL_DIR: optional,
  S3_ENDPOINT: optional,
  S3_REGION: optional,
  S3_BUCKET: optional,
  S3_ACCESS_KEY_ID: optional,
  S3_SECRET_ACCESS_KEY: optional,
  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,
  CRON_SECRET: optional,
  DEMO_MODE_ENABLED: optional,
  SESSION_MAX_AGE_HOURS: optional,
  SESSION_IDLE_MINUTES: optional,
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Variáveis de ambiente validadas. Nunca importar em componentes de cliente. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configuração inválida: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

const DEV_SECRET = "cortex-development-only-secret-do-not-use-in-production";

/** Segredo usado para HMAC de tokens e derivação de chaves. Obrigatório em produção. */
export function authSecret(): string {
  const value = env().AUTH_SECRET;
  if (value && value.length >= 32) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET ausente ou com menos de 32 caracteres. Configure-o nas variáveis de ambiente.");
  }
  return DEV_SECRET;
}

export function appUrl(): string {
  return (env().APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function isDemoModeEnabled(): boolean {
  return env().DEMO_MODE_ENABLED === "true";
}

export function sessionMaxAgeHours(): number {
  return Number(env().SESSION_MAX_AGE_HOURS ?? 24 * 7);
}

export function sessionIdleMinutes(): number {
  return Number(env().SESSION_IDLE_MINUTES ?? 60 * 24);
}
