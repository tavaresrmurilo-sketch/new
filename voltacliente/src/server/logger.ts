import "server-only";

type Level = "info" | "warn" | "error";
type Fields = Record<string, string | number | boolean | null | undefined>;

/**
 * Logger estruturado. Registre apenas identificadores técnicos (ids, códigos,
 * contagens) — nunca nomes, telefones, e-mails ou conteúdo de mensagens.
 */
function write(level: Level, event: string, fields: Fields = {}) {
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const logger = {
  info: (event: string, fields?: Fields) => write("info", event, fields),
  warn: (event: string, fields?: Fields) => write("warn", event, fields),
  error: (event: string, error: unknown, fields?: Fields) =>
    write("error", event, {
      ...fields,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message.slice(0, 300) : undefined,
      errorCode: (error as { code?: string } | null)?.code,
    }),
};
