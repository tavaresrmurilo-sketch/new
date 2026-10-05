export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "LIMIT_REACHED"
  | "FEATURE_UNAVAILABLE"
  | "READ_ONLY"
  | "RATE_LIMITED"
  | "AI_NOT_CONFIGURED"
  | "INTERNAL";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what = "Registro") => new AppError("NOT_FOUND", `${what} não encontrado.`);
export const forbidden = (message = "Você não tem permissão para esta ação.") => new AppError("FORBIDDEN", message);

export function httpStatus(code: ErrorCode): number {
  switch (code) {
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
    case "READ_ONLY":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "VALIDATION":
      return 422;
    case "CONFLICT":
      return 409;
    case "LIMIT_REACHED":
    case "FEATURE_UNAVAILABLE":
      return 402;
    case "RATE_LIMITED":
      return 429;
    case "AI_NOT_CONFIGURED":
      return 503;
    default:
      return 500;
  }
}
