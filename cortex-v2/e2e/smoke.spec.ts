import { expect, test } from "@playwright/test";

test("landing page apresenta a proposta de valor", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Sua empresa tem dados. O Córtex transforma dados em decisões.");
  await expect(page.getByRole("link", { name: "Começar agora" }).first()).toBeVisible();
});

test("rotas protegidas exigem login", async ({ page }) => {
  await page.goto("/app/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("login com credenciais inválidas não entra", async ({ page }) => {
  await page.goto("/login");
  await page.fill("#email", "nao-existe@teste.com.br");
  await page.fill("#password", "SenhaErrada123");
  await page.click("button[type=submit]");
  await expect(page.getByText(/inválid|incorret/i)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("cadastro cria a empresa e inicia o onboarding", async ({ page }) => {
  const email = `e2e-${Date.now()}@teste.com.br`;
  await page.goto("/register");
  await page.fill("#name", "Pessoa E2E");
  await page.fill("#companyName", "Empresa E2E");
  await page.fill("#email", email);
  await page.fill("#password", "SenhaForte123");
  await page.check("input[type=checkbox]");
  await page.click("button[type=submit]");
  await page.waitForURL(/\/app\/(onboarding|dashboard)/, { timeout: 60_000 });
});
