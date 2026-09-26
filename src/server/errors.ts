export class AppError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
    public readonly code: string = "BAD_REQUEST",
  ) {
    super(message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Sessão expirada ou inválida. Faça login novamente.") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Você não tem permissão para acessar este recurso.") {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Recurso não encontrado.") {
    super(message, 404, "NOT_FOUND");
  }
}

export class RateLimitError extends AppError {
  constructor(public readonly retryAfter: number) {
    super("Muitas requisições. Aguarde alguns instantes e tente novamente.", 429, "RATE_LIMITED");
  }
}

/** Indisponibilidade temporária (ex.: banco de dados fora do ar). */
export class ServiceUnavailableError extends AppError {
  constructor(message = "Não foi possível acessar os dados no momento. Tente novamente em instantes.") {
    super(message, 503, "SERVICE_UNAVAILABLE");
  }
}

/**
 * Traduz erros do Prisma para erros de aplicação com mensagem amigável.
 * Retorna null quando o erro não é do Prisma (deve seguir como erro interno).
 */
export function fromPrismaError(err: unknown): AppError | null {
  const e = err as { name?: string; code?: string };
  const name = e?.name ?? "";
  if (name === "PrismaClientInitializationError" || name === "PrismaClientRustPanicError") return new ServiceUnavailableError();
  if (name !== "PrismaClientKnownRequestError") return null;
  switch (e.code) {
    case "P1001": // servidor inacessível
    case "P1002": // timeout de conexão
    case "P1008": // timeout de operação
    case "P1017": // conexão encerrada pelo servidor
    case "P2024": // timeout do pool de conexões
      return new ServiceUnavailableError();
    case "P2002":
      return new AppError("Já existe um registro com esses dados.", 409, "DUPLICATE");
    case "P2003":
      return new AppError("Operação inválida: o registro está vinculado a outros dados.", 409, "RELATION_CONFLICT");
    case "P2025":
      return new NotFoundError("Registro não encontrado.");
    default:
      return null;
  }
}
