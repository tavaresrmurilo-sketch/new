import bcrypt from "bcryptjs";

const COST = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

let dummyHash: Promise<string> | null = null;

/**
 * Compara a senha com um hash descartável quando o e-mail não existe, para que o
 * tempo de resposta não revele quais contas estão cadastradas.
 */
export async function burnPasswordCheck(password: string): Promise<false> {
  dummyHash ??= bcrypt.hash("chavix-dummy-password", COST);
  await bcrypt.compare(password, await dummyHash);
  return false;
}

export function passwordProblems(password: string): string | null {
  if (password.length < 10) return "A senha precisa ter pelo menos 10 caracteres";
  if (password.length > 128) return "A senha pode ter no máximo 128 caracteres";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Use letras e números na senha";
  return null;
}
