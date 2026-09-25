import { ConnectionConfigError } from "./types";
import { PrivateHostError } from "./network";

export interface FriendlyError {
  message: string;
  reason: string;
  causes: string[];
  code: string;
}

const CAUSES = ["host incorreto", "porta bloqueada", "credenciais inválidas", "SSL necessário", "firewall", "banco indisponível"];

/** Remove qualquer segredo conhecido de mensagens de erro antes de exibir ou registrar. */
export function scrub(text: string, secrets: (string | undefined | null)[]): string {
  let out = text;
  for (const s of secrets) if (s && s.length >= 3) out = out.split(s).join("••••");
  return out.replace(/(postgres(?:ql)?|mysql|mssql|sqlserver):\/\/[^\s@]+@/gi, "$1://••••@").replace(/(password|pwd)=([^;\s]+)/gi, "$1=••••").slice(0, 400);
}

/** Traduz erros de drivers para mensagens amigáveis, sem expor credenciais. */
export function friendlyError(err: unknown, secrets: (string | undefined | null)[] = []): FriendlyError {
  if (err instanceof PrivateHostError) return { code: "PRIVATE_HOST", message: "Endereço não permitido.", reason: err.message, causes: ["firewall", "VPN", "API intermediária"] };
  if (err instanceof ConnectionConfigError) return { code: "INVALID_CONFIG", message: "Configuração inválida.", reason: err.message, causes: ["host incorreto"] };
  const e = err as { code?: string | number; errno?: number; message?: string; number?: number; originalError?: { code?: string; message?: string } };
  const code = String(e?.code ?? e?.originalError?.code ?? e?.number ?? e?.errno ?? "UNKNOWN");
  const raw = `${e?.message ?? ""} ${e?.originalError?.message ?? ""}`;
  const msg = raw.toLowerCase();
  const base = { message: "Não foi possível conectar ao banco.", code };
  if (/enotfound|eai_again|getaddrinfo/.test(msg) || code === "ENOTFOUND" || code === "EAI_AGAIN") return { ...base, reason: "Host não encontrado. Verifique o endereço do servidor.", causes: ["host incorreto"] };
  if (code === "ECONNREFUSED" || /econnrefused/.test(msg)) return { ...base, reason: "Conexão recusada pelo servidor. A porta pode estar bloqueada ou o banco indisponível.", causes: ["porta bloqueada", "banco indisponível", "firewall"] };
  if (/etimedout|timeout|timed out|esockettimedout/.test(msg) || ["ETIMEDOUT", "ETIMEOUT", "ESOCKET"].includes(code)) return { ...base, reason: "Tempo de conexão esgotado. Um firewall pode estar bloqueando o acesso ou o banco está indisponível.", causes: ["firewall", "porta bloqueada", "banco indisponível"] };
  if (["28P01", "28000", "ER_ACCESS_DENIED_ERROR", "1045", "ELOGIN", "18456"].includes(code) || /password authentication failed|access denied|login failed/.test(msg))
    return { ...base, reason: "Credenciais inválidas. Confira usuário e senha.", causes: ["credenciais inválidas"] };
  if (/ssl|tls|certificate|self.signed|pg_hba.conf/.test(msg)) return { ...base, reason: "Falha de SSL/TLS. O servidor pode exigir SSL ou o certificado não é confiável.", causes: ["SSL necessário"] };
  if (["3D000", "ER_BAD_DB_ERROR", "1049", "4060"].includes(code) || /database .* does not exist|unknown database|cannot open database/.test(msg))
    return { ...base, reason: "Banco de dados não encontrado. Confira o nome do database.", causes: ["banco indisponível"] };
  if (["42501", "1142", "229"].includes(code) || /permission denied|command denied/.test(msg))
    return { message: "Permissão insuficiente.", code, reason: "O usuário conectou, mas não tem permissão de leitura (SELECT) nesta tabela.", causes: ["credenciais inválidas"] };
  return { ...base, reason: scrub(raw.trim() || "Erro desconhecido ao acessar o banco.", secrets), causes: CAUSES };
}
