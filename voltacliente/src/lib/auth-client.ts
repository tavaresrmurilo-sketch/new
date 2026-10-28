"use client";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

/** Mensagens de erro do Better Auth traduzidas para o usuário. */
export function authErrorMessage(error: { code?: string; message?: string; status?: number } | null | undefined): string {
  if (!error) return "Algo deu errado. Tente novamente.";
  if (error.status === 429) return "Muitas tentativas. Aguarde um minuto e tente novamente.";
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "E-mail ou senha incorretos.";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "Já existe uma conta com este e-mail. Tente entrar.";
    case "PASSWORD_TOO_SHORT":
      return "A senha precisa ter pelo menos 8 caracteres.";
    case "PASSWORD_TOO_LONG":
      return "A senha é muito longa.";
    case "INVALID_TOKEN":
      return "Link inválido ou expirado. Solicite uma nova redefinição de senha.";
    case "INVALID_EMAIL":
      return "E-mail inválido.";
    case "INVALID_PASSWORD":
      return "Senha atual incorreta.";
  }
  return error.message && /[àáâãçéêíóôõú]/i.test(error.message)
    ? error.message
    : "Não foi possível concluir. Verifique os dados e tente novamente.";
}
