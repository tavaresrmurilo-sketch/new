import type { TenantKind } from "@prisma/client";

/** Textos que variam entre conta pessoal (PERSON) e empresarial (COMPANY). */
export function accountLabels(kind: TenantKind | null | undefined) {
  const personal = kind === "PERSONAL";
  return {
    personal,
    homeTitle: personal ? "Meu painel" : "Visão Executiva",
    homeDescription: personal ? "Resultados, caixa e movimentações das suas finanças." : "Resultados, caixa e desempenho comercial da empresa.",
    profileTab: personal ? "Meu perfil" : "Empresa",
    profileTitle: personal ? "Configurações → Meu perfil" : "Configurações → Empresa",
    nameLabel: personal ? "Seu nome" : "Nome da empresa",
    settingsDescription: personal
      ? "Seu perfil, plano de contas, privacidade (LGPD) e plano."
      : "Empresa, usuários e permissões, plano de contas, privacidade (LGPD), suporte e plano.",
    workspaceNoun: personal ? "sua conta" : "a empresa",
    deleteConfirmHint: personal ? "Digite seu nome exatamente como no perfil" : "Digite o nome da empresa",
  };
}
