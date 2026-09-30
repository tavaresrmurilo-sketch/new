import { execSync } from "node:child_process";
import { config } from "dotenv";

/** Aplica as migrations no banco de teste antes da suíte. */
export default function setup() {
  config({ quiet: true });
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.warn("TEST_DATABASE_URL não definido: testes de integração serão pulados.");
    return;
  }
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url } });
}
