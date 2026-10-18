import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/server/env";
import { registerDevice, sendNativePush, unregisterDevice } from "@/server/push/native";
import { createUser, prisma, resetDb } from "../helpers";

const FCM_TOKEN = "fcm-token-".padEnd(80, "a");

beforeEach(async () => {
  await resetDb();
  resetEnvCache();
});

afterEach(() => {
  delete process.env.FCM_PROJECT_ID;
  delete process.env.FCM_CLIENT_EMAIL;
  delete process.env.FCM_PRIVATE_KEY;
  resetEnvCache();
  vi.restoreAllMocks();
});

function enableFcm() {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  process.env.FCM_PROJECT_ID = "mixtour-teste";
  process.env.FCM_CLIENT_EMAIL = "push@mixtour-teste.iam.gserviceaccount.com";
  // como chega de variáveis de ambiente: quebras de linha escapadas
  process.env.FCM_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" }).toString().replace(/\n/g, "\\n");
  resetEnvCache();
}

describe("tokens de aparelho", () => {
  it("registra, reatribui a outra conta no mesmo aparelho e remove", async () => {
    const a = await createUser();
    const b = await createUser();
    await registerDevice(a.id, "ANDROID", FCM_TOKEN, "1.0.0");
    await registerDevice(b.id, "ANDROID", FCM_TOKEN, "1.0.1");
    const rows = await prisma.deviceToken.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(b.id);
    await unregisterDevice(FCM_TOKEN);
    expect(await prisma.deviceToken.count()).toBe(0);
  });
});

describe("envio pelo FCM", () => {
  it("sem credenciais não envia nada", async () => {
    const u = await createUser();
    await registerDevice(u.id, "ANDROID", FCM_TOKEN);
    const spy = vi.spyOn(globalThis, "fetch");
    expect(await sendNativePush(u.id, { title: "Oi", body: "Teste", url: "/" })).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it("autentica com a conta de serviço e envia a mensagem com a URL", async () => {
    enableFcm();
    const u = await createUser();
    await registerDevice(u.id, "ANDROID", FCM_TOKEN);
    const calls: { url: string; body: string }[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      calls.push({ url, body: String(init?.body ?? "") });
      if (url.includes("oauth2.googleapis.com")) return new Response(JSON.stringify({ access_token: "ya29.teste", expires_in: 3600 }), { status: 200 });
      return new Response(JSON.stringify({ name: "projects/x/messages/1" }), { status: 200 });
    });
    expect(await sendNativePush(u.id, { title: "Amanhã: Roda de choro", body: "19:00 · Praça da Sé", url: "/evento/roda" })).toBe(1);
    expect(calls[0].url).toContain("oauth2.googleapis.com/token");
    expect(calls[0].body).toContain("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer");
    expect(calls[1].url).toBe("https://fcm.googleapis.com/v1/projects/mixtour-teste/messages:send");
    const msg = JSON.parse(calls[1].body).message;
    expect(msg.token).toBe(FCM_TOKEN);
    expect(msg.data.url).toBe("/evento/roda");
  });

  it("remove token que o FCM diz não existir mais", async () => {
    enableFcm();
    const u = await createUser();
    await registerDevice(u.id, "ANDROID", FCM_TOKEN);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).includes("oauth2")) return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), { status: 200 });
      return new Response(JSON.stringify({ error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }), { status: 404 });
    });
    expect(await sendNativePush(u.id, { title: "x", body: "y", url: "/" })).toBe(0);
    expect(await prisma.deviceToken.count()).toBe(0);
  });
});
