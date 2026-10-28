import "dotenv/config";

/**
 * URL do banco de TESTE. Os testes de integração apagam dados; por segurança
 * exigem TEST_DATABASE_URL e um nome de banco contendo "test".
 */
export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("Defina TEST_DATABASE_URL (ex.: postgresql://postgres:postgres@localhost:5432/voltacliente_test).");
  const name = new URL(url).pathname.replace("/", "");
  if (!/test/i.test(name)) throw new Error(`Recusado: o banco "${name}" não parece ser de teste (o nome deve conter "test").`);
  return url;
}
