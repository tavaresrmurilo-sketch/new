import fs from "node:fs";

if (fs.existsSync(".env") && typeof process.loadEnvFile === "function") process.loadEnvFile(".env");
process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-123456";
process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.AI_PROVIDER = "rules";
