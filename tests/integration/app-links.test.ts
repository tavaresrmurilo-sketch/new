import { afterEach, describe, expect, it } from "vitest";
import { GET as aasa } from "@/app/.well-known/apple-app-site-association/route";
import { GET as assetlinks } from "@/app/.well-known/assetlinks.json/route";
import { resetEnvCache } from "@/server/env";

const KEYS = ["ANDROID_APP_ID", "ANDROID_SHA256_CERT_FINGERPRINTS", "APPLE_TEAM_ID", "IOS_BUNDLE_ID"];
afterEach(() => {
  for (const k of KEYS) delete process.env[k];
  resetEnvCache();
});

const FP = Array.from({ length: 32 }, (_, i) => (i * 7).toString(16).padStart(2, "0").toUpperCase()).join(":");

describe("App Links (Android)", () => {
  it("404 sem configuração", async () => {
    resetEnvCache();
    expect(assetlinks().status).toBe(404);
  });
  it("publica o pacote e só impressões SHA-256 válidas", async () => {
    process.env.ANDROID_APP_ID = "br.com.exemplo.mixtour";
    process.env.ANDROID_SHA256_CERT_FINGERPRINTS = `${FP.toLowerCase()}, invalida`;
    resetEnvCache();
    const res = assetlinks();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0].target.package_name).toBe("br.com.exemplo.mixtour");
    expect(body[0].target.sha256_cert_fingerprints).toEqual([FP]);
  });
});

describe("Universal Links (iOS)", () => {
  it("404 sem configuração e appID correto quando configurado", async () => {
    resetEnvCache();
    expect(aasa().status).toBe(404);
    process.env.APPLE_TEAM_ID = "ABCDE12345";
    process.env.IOS_BUNDLE_ID = "br.com.exemplo.mixtour";
    resetEnvCache();
    const res = aasa();
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body.applinks.details[0].appIDs).toEqual(["ABCDE12345.br.com.exemplo.mixtour"]);
    expect(body.applinks.details[0].components).toContainEqual({ "/": "/evento/*" });
  });
});
