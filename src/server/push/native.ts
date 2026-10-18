import "server-only";
import { createSign, type KeyObject, createPrivateKey } from "node:crypto";
import http2 from "node:http2";
import type { DevicePlatform } from "@prisma/client";
import { prisma } from "@/server/db";
import { env, integrations } from "@/server/env";

/**
 * Push para o app nativo, sem SDKs: Android pelo Firebase Cloud Messaging (API HTTP v1,
 * autenticada com a conta de serviço) e iOS direto pelo APNs (HTTP/2 + JWT com chave .p8).
 * Cada canal só funciona com as credenciais configuradas (ver docs/MOBILE.md).
 */

export interface NativePushPayload {
  title: string;
  body: string;
  url: string;
}

type SendResult = "sent" | "invalid-token" | "error" | "disabled";

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

function privateKey(pem: string): KeyObject {
  // Variáveis de ambiente costumam trazer "\n" literal no lugar das quebras de linha.
  return createPrivateKey(pem.includes("\\n") ? pem.replace(/\\n/g, "\n") : pem);
}

// ───────────── Android (FCM HTTP v1) ─────────────

let fcmToken: { value: string; expiresAt: number } | null = null;

async function fcmAccessToken(): Promise<string> {
  if (fcmToken && fcmToken.expiresAt > Date.now() + 60_000) return fcmToken.value;
  const e = env();
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: e.FCM_CLIENT_EMAIL,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signature = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(privateKey(e.FCM_PRIVATE_KEY!)).toString("base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claims}.${signature}` }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`FCM OAuth ${res.status}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  fcmToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return fcmToken.value;
}

async function sendFcm(token: string, p: NativePushPayload): Promise<SendResult> {
  if (!integrations().fcm) return "disabled";
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${env().FCM_PROJECT_ID}/messages:send`, {
    method: "POST",
    headers: { authorization: `Bearer ${await fcmAccessToken()}`, "content-type": "application/json" },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: p.title, body: p.body },
        data: { url: p.url },
        android: { priority: "HIGH", notification: { color: "#7C5CFF", sound: "default" } },
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.ok) return "sent";
  const text = await res.text();
  if (res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT.*registration/i.test(text)) return "invalid-token";
  console.error("[push:fcm]", res.status, text.slice(0, 300));
  return "error";
}

// ───────────── iOS (APNs) ─────────────

let apnsJwt: { value: string; issuedAt: number } | null = null;

function apnsToken(): string {
  // A Apple aceita o mesmo token por até 1 h; renovamos a cada 50 min.
  if (apnsJwt && Date.now() - apnsJwt.issuedAt < 50 * 60_000) return apnsJwt.value;
  const e = env();
  const header = b64url(JSON.stringify({ alg: "ES256", kid: e.APNS_KEY_ID }));
  const claims = b64url(JSON.stringify({ iss: e.APPLE_TEAM_ID, iat: Math.floor(Date.now() / 1000) }));
  const signature = createSign("SHA256")
    .update(`${header}.${claims}`)
    .sign({ key: privateKey(e.APNS_PRIVATE_KEY!), dsaEncoding: "ieee-p1363" })
    .toString("base64url");
  apnsJwt = { value: `${header}.${claims}.${signature}`, issuedAt: Date.now() };
  return apnsJwt.value;
}

function sendApns(token: string, p: NativePushPayload): Promise<SendResult> {
  if (!integrations().apns) return Promise.resolve("disabled");
  const e = env();
  const host = e.APNS_PRODUCTION ? "https://api.push.apple.com" : "https://api.sandbox.push.apple.com";
  const payload = JSON.stringify({ aps: { alert: { title: p.title, body: p.body }, sound: "default" }, url: p.url });
  return new Promise((resolve) => {
    const client = http2.connect(host);
    client.on("error", (err) => {
      console.error("[push:apns]", err.message);
      resolve("error");
    });
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${apnsToken()}`,
      "apns-topic": e.IOS_BUNDLE_ID!,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    });
    let status = 0;
    let body = "";
    req.setTimeout(10_000, () => req.close());
    req.on("response", (h) => (status = Number(h[":status"])));
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      client.close();
      if (status === 200) return resolve("sent");
      if (status === 410 || /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/.test(body)) return resolve("invalid-token");
      console.error("[push:apns]", status, body.slice(0, 300));
      resolve("error");
    });
    req.end(payload);
  });
}

/** Envia para todos os aparelhos (app nativo) do usuário e remove tokens inválidos. */
export async function sendNativePush(userId: string, payload: NativePushPayload): Promise<number> {
  const { fcm, apns } = integrations();
  if (!fcm && !apns) return 0;
  const devices = await prisma.deviceToken.findMany({ where: { userId } });
  let sent = 0;
  await Promise.all(
    devices.map(async (d) => {
      const result = d.platform === "ANDROID" ? await sendFcm(d.token, payload) : await sendApns(d.token, payload);
      if (result === "sent") sent++;
      if (result === "invalid-token") await prisma.deviceToken.delete({ where: { id: d.id } }).catch(() => undefined);
    }),
  );
  return sent;
}

/** Registra (ou reatribui) o token deste aparelho ao usuário logado. */
export async function registerDevice(userId: string, platform: DevicePlatform, token: string, appVersion?: string | null) {
  return prisma.deviceToken.upsert({
    where: { token },
    create: { userId, platform, token, appVersion: appVersion ?? null },
    update: { userId, platform, appVersion: appVersion ?? null, lastSeenAt: new Date() },
  });
}

/** Remove o token (logout no aparelho ou push desativado). */
export async function unregisterDevice(token: string) {
  await prisma.deviceToken.deleteMany({ where: { token } });
}
