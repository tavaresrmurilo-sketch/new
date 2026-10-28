import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { passwordPolicyError, PASSWORD_MAX, PASSWORD_MIN, personNameSchema } from "@/lib/validation";
import { db } from "./db";
import { isEmailConfigured, resetPasswordEmail, sendEmail } from "./email";
import { logger } from "./logger";
import { deleteSoleOwnedCompanies } from "@/modules/privacy/service";

const isProduction = process.env.NODE_ENV === "production";

function appUrl(): string {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

function trustedOrigins(): string[] {
  const origins = new Set<string>([appUrl()]);
  if (process.env.NEXT_PUBLIC_APP_URL) origins.add(process.env.NEXT_PUBLIC_APP_URL);
  if (process.env.VERCEL_URL) origins.add(`https://${process.env.VERCEL_URL}`);
  if (process.env.VERCEL_BRANCH_URL) origins.add(`https://${process.env.VERCEL_BRANCH_URL}`);
  return [...origins];
}

/** Recuperação de senha só fica ativa com e-mail configurado (ou em desenvolvimento). */
export const passwordResetAvailable = isEmailConfigured() || !isProduction;

export const auth = betterAuth({
  appName: "VoltaCliente",
  baseURL: appUrl(),
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: trustedOrigins(),
  database: prismaAdapter(db, { provider: "postgresql" }),
  telemetry: { enabled: false },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: PASSWORD_MIN,
    maxPasswordLength: PASSWORD_MAX,
    autoSignIn: true,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    sendResetPassword: passwordResetAvailable
      ? async ({ user, url }) => {
          if (isEmailConfigured()) {
            const email = resetPasswordEmail(user.name, url);
            await sendEmail({ to: user.email, ...email });
            return;
          }
          // Somente em desenvolvimento, sem serviço de e-mail: exibe o link no terminal.
          console.info(`\n[dev] Link de redefinição de senha: ${url}\n`);
        }
      : undefined,
  },
  user: {
    deleteUser: {
      enabled: true,
      // Exclusão de conta (LGPD): remove antes as empresas sem outro dono.
      beforeDelete: async (user) => {
        await deleteSoleOwnedCompanies(user.id);
      },
      afterDelete: async (user) => {
        logger.info("user_deleted", { userId: user.id });
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 dias
    updateAge: 60 * 60 * 24, // renova a cada 24h de uso
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 8 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 300, max: 3 },
      "/reset-password": { window: 300, max: 5 },
      "/change-password": { window: 300, max: 5 },
      "/delete-user": { window: 300, max: 5 },
    },
  },
  advanced: {
    useSecureCookies: isProduction,
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      const body = (ctx.body ?? {}) as Record<string, unknown>;
      if (ctx.path === "/sign-up/email") {
        const name = personNameSchema.safeParse(body.name);
        if (!name.success) throw new APIError("BAD_REQUEST", { message: name.error.issues[0]?.message });
        const error = passwordPolicyError(String(body.password ?? ""));
        if (error) throw new APIError("BAD_REQUEST", { message: error });
      }
      if (ctx.path === "/reset-password" || ctx.path === "/change-password") {
        const error = passwordPolicyError(String(body.newPassword ?? ""));
        if (error) throw new APIError("BAD_REQUEST", { message: error });
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          logger.info("user_signed_up", { userId: user.id });
        },
      },
    },
  },
  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
