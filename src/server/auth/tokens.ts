import "server-only";
import type { TokenType } from "@prisma/client";
import { prisma } from "@/server/db";
import { hashToken, randomToken } from "@/server/security/crypto";

const TTL: Record<TokenType, number> = {
  EMAIL_VERIFY: 48 * 3_600_000,
  PASSWORD_RESET: 60 * 60_000,
};

/** Cria um token de uso único (o banco guarda só o HMAC). Invalida tokens anteriores do mesmo tipo. */
export async function issueToken(userId: string, type: TokenType): Promise<string> {
  const token = randomToken(32);
  await prisma.$transaction([
    prisma.verificationToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.verificationToken.create({
      data: { userId, type, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + TTL[type]) },
    }),
  ]);
  return token;
}

/** Consome o token de forma atômica. Retorna o userId ou null se inválido/expirado/usado. */
export async function consumeToken(token: string, type: TokenType): Promise<string | null> {
  if (!token || token.length > 200) return null;
  const tokenHash = hashToken(token);
  const row = await prisma.verificationToken.findUnique({ where: { tokenHash } });
  if (!row || row.type !== type || row.usedAt || row.expiresAt < new Date()) return null;
  const updated = await prisma.verificationToken.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  return updated.count === 1 ? row.userId : null;
}
