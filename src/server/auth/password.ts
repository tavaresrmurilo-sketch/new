import bcrypt from "bcryptjs";
import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(10, "A senha deve ter pelo menos 10 caracteres")
  .max(128)
  .regex(/[A-Za-z]/, "A senha deve conter letras")
  .regex(/[0-9]/, "A senha deve conter números");

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

let dummy: Promise<string> | null = null;
/** Hash descartável para equalizar o tempo de resposta quando o usuário não existe (evita enumeração). */
export function dummyHash(): Promise<string> {
  dummy ??= bcrypt.hash("jrcortex-dummy-password", 12);
  return dummy;
}
