import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import {
  buildPixPayload,
  crc16,
  formatAmount,
  normalizePixKey,
  parseTlv,
  PixConfigError,
  sanitizeMerchantText,
  sanitizeTxid,
  verifyPixPayload,
} from "@/lib/pix/brcode";

describe("crc16 (CRC-16/CCITT-FALSE)", () => {
  it("bate com o valor de verificação padrão do algoritmo", () => {
    // Check value oficial do CRC-16/CCITT-FALSE para "123456789"
    expect(crc16("123456789")).toBe("29B1");
  });

  it("reproduz o exemplo do Manual do BR Code do Banco Central", () => {
    const semCrc =
      "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-426655440000" +
      "5204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304";
    expect(crc16(semCrc)).toBe("1D3D");
  });

  it("sempre retorna 4 dígitos hexadecimais maiúsculos", () => {
    for (const sample of ["", "a", "Pix", "0002010102"]) {
      expect(crc16(sample)).toMatch(/^[0-9A-F]{4}$/);
    }
  });
});

describe("normalizePixKey", () => {
  it("reconhece CPF válido", () => {
    expect(normalizePixKey("529.982.247-25")).toEqual({ key: "52998224725", type: "CPF" });
    expect(normalizePixKey("52998224725")).toEqual({ key: "52998224725", type: "CPF" });
  });
  it("rejeita CPF com dígito verificador errado", () => {
    expect(() => normalizePixKey("52998224726")).toThrow(PixConfigError);
  });
  it("reconhece e-mail, telefone, CNPJ e chave aleatória", () => {
    expect(normalizePixKey("Contato@Chavix.com.br")).toEqual({ key: "contato@chavix.com.br", type: "EMAIL" });
    expect(normalizePixKey("+55 (62) 99999-8888")).toEqual({ key: "+5562999998888", type: "PHONE" });
    expect(normalizePixKey("11.222.333/0001-81")).toEqual({ key: "11222333000181", type: "CNPJ" });
    expect(normalizePixKey("123E4567-E89B-12D3-A456-426614174000").type).toBe("EVP");
  });
  it("exige chave configurada", () => {
    expect(() => normalizePixKey("")).toThrow(PixConfigError);
  });
});

describe("campos do BR Code", () => {
  it("formata valor com duas casas e ponto", () => {
    expect(formatAmount(1)).toBe("0.01");
    expect(formatAmount(1990)).toBe("19.90");
    expect(formatAmount(123456)).toBe("1234.56");
    expect(() => formatAmount(0)).toThrow();
    expect(() => formatAmount(10.5)).toThrow();
  });
  it("limpa nome/cidade e respeita limites", () => {
    expect(sanitizeMerchantText("João da Silva Açaí Ltda Muito Grande", 25)).toBe("Joao da Silva Acai Ltda M");
    expect(sanitizeMerchantText("São Paulo", 15)).toBe("Sao Paulo");
  });
  it("txid aceita só alfanuméricos, até 25", () => {
    expect(sanitizeTxid("CHX-A82F91")).toBe("CHXA82F91");
    expect(sanitizeTxid("")).toBe("***");
    expect(sanitizeTxid("x".repeat(40))).toHaveLength(25);
  });
});

describe("buildPixPayload", () => {
  const input = {
    key: "52998224725",
    receiverName: "CHAVIX 3D",
    city: "Goiânia",
    amountCents: 4780,
    txid: "CHXA82F91",
    description: "Pedido CHX-A82F91",
  };

  it("gera payload com CRC válido e campos na ordem do padrão", () => {
    const payload = buildPixPayload(input);
    expect(verifyPixPayload(payload)).toBe(true);
    const fields = parseTlv(payload);
    expect(fields.map((f) => f.id)).toEqual(["00", "26", "52", "53", "54", "58", "59", "60", "62", "63"]);
    const get = (id: string) => fields.find((f) => f.id === id)!.value;
    expect(get("00")).toBe("01");
    expect(get("52")).toBe("0000");
    expect(get("53")).toBe("986");
    expect(get("54")).toBe("47.80");
    expect(get("58")).toBe("BR");
    expect(get("59")).toBe("CHAVIX 3D");
    expect(get("60")).toBe("Goiania");

    const account = parseTlv(get("26"));
    expect(account[0]).toEqual({ id: "00", value: "br.gov.bcb.pix" });
    expect(account[1]).toEqual({ id: "01", value: "52998224725" });
    expect(account[2]).toEqual({ id: "02", value: "Pedido CHX-A82F91" });

    expect(parseTlv(get("62"))).toEqual([{ id: "05", value: "CHXA82F91" }]);
  });

  it("valor exato do pedido, sem arredondar", () => {
    for (const cents of [1, 99, 100, 1999, 2490, 999999]) {
      const fields = parseTlv(buildPixPayload({ ...input, amountCents: cents }));
      const amount = fields.find((f) => f.id === "54")!.value;
      expect(Math.round(Number(amount) * 100)).toBe(cents);
    }
  });

  it("detecta payload adulterado", () => {
    const payload = buildPixPayload(input);
    const tampered = payload.replace("47.80", "04.78");
    expect(verifyPixPayload(tampered)).toBe(false);
  });

  it("exige nome e cidade do recebedor", () => {
    expect(() => buildPixPayload({ ...input, receiverName: "" })).toThrow(PixConfigError);
    expect(() => buildPixPayload({ ...input, city: "   " })).toThrow(PixConfigError);
  });

  it("o QR Code gerado decodifica exatamente para o payload", async () => {
    const payload = buildPixPayload(input);
    const pngBuffer = await QRCode.toBuffer(payload, { errorCorrectionLevel: "M", margin: 2, scale: 6 });
    const png = PNG.sync.read(pngBuffer);
    const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    expect(decoded?.data).toBe(payload);
    expect(verifyPixPayload(decoded!.data)).toBe(true);
  });
});
