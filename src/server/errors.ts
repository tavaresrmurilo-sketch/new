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
