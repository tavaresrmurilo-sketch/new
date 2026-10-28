import { describe, expect, it } from "vitest";
import { defaultTemplateBody } from "@/lib/segments";
import { buildTemplateValues, findUnknownVariables, firstName, renderTemplate } from "@/lib/templates";

const ctx = {
  customerName: "joão da silva",
  companyName: "ClimaTech",
  companyPhone: "(11) 3333-4444",
  serviceName: "Limpeza de ar-condicionado",
  lastServiceDate: "2026-04-12",
  recommendedDate: "2026-10-09",
  today: "2026-10-28",
};

describe("modelos de mensagem", () => {
  it("personaliza as variáveis", () => {
    const text = renderTemplate(defaultTemplateBody("AR_CONDICIONADO"), buildTemplateValues(ctx));
    expect(text).toBe(
      "Olá, João! Tudo bem? Aqui é da ClimaTech. Faz um tempo desde o seu último atendimento de limpeza de ar-condicionado, em 12/04/2026. Gostaria de agendar uma nova manutenção?",
    );
  });

  it("calcula o tempo desde o último atendimento", () => {
    expect(renderTemplate("{tempo_desde}", buildTemplateValues(ctx))).toBe("6 meses");
  });

  it("mantém variáveis desconhecidas e as aponta", () => {
    expect(renderTemplate("Oi {nome_cliente}", buildTemplateValues(ctx))).toBe("Oi {nome_cliente}");
    expect(findUnknownVariables("Oi {primeiro_nome}, {nome_cliente} {xx}")).toEqual(["nome_cliente", "xx"]);
  });

  it("preserva siglas no nome do serviço", () => {
    expect(buildTemplateValues({ ...ctx, serviceName: "SPA dos pés" }).servico).toBe("SPA dos pés");
  });

  it("extrai e capitaliza o primeiro nome", () => {
    expect(firstName("  maria  clara souza ")).toBe("Maria");
  });
});
