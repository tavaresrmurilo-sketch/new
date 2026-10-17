import "server-only";
import bcrypt from "bcryptjs";

const ROUNDS = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

let dummy: Promise<string> | null = null;
/** Compara com um hash descartável para equalizar o tempo quando o usuário não existe. */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummy ??= bcrypt.hash("mixtour-timing-equalizer", ROUNDS);
  await bcrypt.compare(password, await dummy);
}
