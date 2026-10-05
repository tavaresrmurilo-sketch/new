// Ambiente de testes: segredos fictícios e banco de testes isolado (TEST_DATABASE_URL).
process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-123456";
process.env.APP_URL ??= "http://localhost:3000";
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
