type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SECRET_KEYS = /pass(word)?|secret|token|api[_-]?key|authorization|cookie|credential/i;

/** Remove segredos embutidos em textos (connection strings, Bearer tokens, chaves de API). */
export function redactText(text: string): string {
  return text
    .replace(/([a-z][a-z0-9+.-]*:\/\/)([^\s:@/]+):([^\s@/]+)@/gi, "$1$2:[REDACTED]@")
    .replace(/(bearer\s+)[a-z0-9._~+/=-]{8,}/gi, "$1[REDACTED]")
    .replace(/\b(sk-(?:ant-)?[a-z0-9_-]{10,}|AIza[0-9A-Za-z_-]{20,})/gi, "[REDACTED]")
    .replace(/((?:password|pwd|secret|token|api[_-]?key)\s*[=:]\s*)[^\s;&,"']+/gi, "$1[REDACTED]");
}

function redact(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return redactText(value);
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_KEYS.test(k) ? "[REDACTED]" : redact(v, depth + 1);
  }
  return out;
}

function emit(level: Level, msg: string, ctx?: Record<string, unknown>) {
  const min = (process.env.LOG_LEVEL as Level | undefined) ?? "info";
  if (order[level] < order[min]) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg: redactText(msg),
    ...(ctx ? (redact(ctx) as Record<string, unknown>) : {}),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => emit("debug", msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => emit("warn", msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => emit("error", msg, ctx),
};

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
