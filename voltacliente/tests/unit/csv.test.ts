import { describe, expect, it } from "vitest";
import { csvCell, parseCustomersCsv, toCsv } from "@/lib/csv";

describe("importação de clientes por CSV", () => {
  it("aceita ponto e vírgula, cabeçalhos com acento e BOM", () => {
    const csv =
      "﻿Nome;Telefone;E-mail;Observações;Data de cadastro;Preferência de contato;Consentimento\n" +
      "Maria Souza;(11) 98765-4321;MARIA@EXEMPLO.COM;Prefere manhã;15/03/2025;WhatsApp;Sim\n";
    const result = parseCustomersCsv(csv);
    expect(result.missingColumns).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      {
        line: 2,
        name: "Maria Souza",
        phone: "(11) 98765-4321",
        phoneNormalized: "5511987654321",
        email: "maria@exemplo.com",
        notes: "Prefere manhã",
        registeredAt: "2025-03-15",
        contactPreference: "WHATSAPP",
        marketingConsent: true,
      },
    ]);
  });

  it("aceita vírgula como separador e colunas mínimas", () => {
    const result = parseCustomersCsv("nome,whatsapp\nJoão,21987654321\n");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].phoneNormalized).toBe("5521987654321");
    expect(result.rows[0].marketingConsent).toBe(false);
  });

  it("aponta colunas obrigatórias ausentes", () => {
    expect(parseCustomersCsv("nome;email\nAna;ana@x.com\n").missingColumns).toEqual(["telefone"]);
  });

  it("valida linha a linha e detecta duplicatas no arquivo", () => {
    const csv = [
      "nome;telefone;email;consentimento",
      "Ana;11987654321;;sim",
      "B;11987654322;;",
      "Carlos;123;;",
      "Dani;11987654323;dani@;",
      "Ana de novo;(11) 98765-4321;;",
      "Eva;11987654324;;talvez",
    ].join("\n");
    const result = parseCustomersCsv(csv);
    expect(result.rows.map((r) => r.name)).toEqual(["Ana"]);
    expect(result.errors.map((e) => e.line)).toEqual([3, 4, 5, 7]);
    expect(result.duplicatesInFile).toEqual([{ line: 6, message: "mesmo telefone da linha 2" }]);
  });
});

describe("exportação CSV", () => {
  it("neutraliza fórmulas e escapa separadores", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("+5511")).toBe("'+5511");
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell(null)).toBe("");
  });

  it("gera arquivo com BOM e ponto e vírgula", () => {
    expect(toCsv(["a", "b"], [[1, "x"]])).toBe("﻿a;b\r\n1;x\r\n");
  });
});
