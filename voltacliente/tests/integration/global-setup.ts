import { execSync } from "node:child_process";
import { testDatabaseUrl } from "./test-db-url";

/** Aplica as migrações no banco de teste antes da suíte. */
export default function setup() {
  const url = testDatabaseUrl();
  execSync("npx prisma migrate deploy", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  });
}
