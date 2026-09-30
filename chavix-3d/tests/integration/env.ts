// Os testes de integração nunca usam o banco de desenvolvimento.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DIRECT_URL = process.env.TEST_DATABASE_URL;
}
// CPF sintético de teste (válido só pelo dígito verificador) — nunca a chave real
process.env.PIX_KEY = "52998224725";
process.env.PIX_RECEIVER_NAME ||= "CHAVIX 3D";
process.env.PIX_CITY ||= "GOIANIA";
process.env.AUTH_SECRET ||= "test-secret-test-secret-test-secret-1234";
