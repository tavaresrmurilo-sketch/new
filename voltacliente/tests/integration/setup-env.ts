import { testDatabaseUrl } from "./test-db-url";

// Deve rodar antes de importar src/server/db.ts.
process.env.DATABASE_URL = testDatabaseUrl();
