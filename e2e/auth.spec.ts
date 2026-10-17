import { expect, test } from "@playwright/test";
import { db, lastEmailLink, login, PASSWORD, register, uniqueEmail, verifyEmail } from "./helpers";

test.describe("autenticação", () => {
  test("cadastro, confirmação de e-mail, saída e login", async ({ page }) => {
    const email = uniqueEmail("cadastro");
    await register(page, "Ana Teste", email);
    await expect(page).toHaveURL(/\/\?bemvindo=1/);
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect(user.emailVerifiedAt).toBeNull();

    await verifyEmail(page, email);
    expect((await db.user.findUniqueOrThrow({ where: { email } })).emailVerifiedAt).not.toBeNull();

    await page.context().clearCookies();
    await login(page, email, "senha-errada-1");
    await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
    // o e-mail digitado continua no campo após o erro
    await expect(page.getByLabel("E-mail")).toHaveValue(email);
    await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("e-mail duplicado e validação de senha", async ({ page }) => {
    const email = uniqueEmail("dup");
    await register(page, "Bia", email);
    await expect(page).toHaveURL(/bemvindo=1/);
    await page.context().clearCookies();
    await register(page, "Bia de novo", email);
    await expect(page.getByText(/já tem uma conta/)).toBeVisible();
    await page.getByLabel("Senha", { exact: true }).fill("curta");
    await page.getByRole("button", { name: "Criar conta grátis" }).click();
    await expect(page.getByText("A senha precisa de pelo menos 8 caracteres")).toBeVisible();
  });

  test("recuperação de senha com link de uso único", async ({ page }) => {
    const email = uniqueEmail("reset");
    await register(page, "Caio", email);
    await expect(page).toHaveURL(/bemvindo=1/);
    await page.context().clearCookies();

    await page.goto("/recuperar-senha");
    await page.getByLabel("E-mail da conta").fill(email);
    await page.getByRole("button", { name: "Enviar link" }).click();
    await expect(page.getByText(/Se houver uma conta com este e-mail/)).toBeVisible();

    const link = await lastEmailLink(email, "/redefinir-senha");
    await page.goto(link);
    await page.getByLabel("Nova senha", { exact: true }).fill("novaSenha2026");
    await page.getByLabel("Confirme a nova senha").fill("novaSenha2026");
    await page.getByRole("button", { name: "Salvar nova senha" }).click();
    await expect(page).toHaveURL(/senha=redefinida/);

    // link já usado
    await page.goto(link);
    await page.getByLabel("Nova senha", { exact: true }).fill("outraSenha2026");
    await page.getByLabel("Confirme a nova senha").fill("outraSenha2026");
    await page.getByRole("button", { name: "Salvar nova senha" }).click();
    await expect(page.getByText(/expirou ou já foi usado/)).toBeVisible();

    await page.context().clearCookies();
    await login(page, email, "novaSenha2026");
    await expect(page).toHaveURL(/\/$/);
  });

  test("áreas privadas exigem login e voltam ao destino", async ({ page }) => {
    await page.goto("/salvos");
    await expect(page).toHaveURL(/\/entrar\?next=%2Fsalvos/);
    const email = uniqueEmail("next");
    await page.getByRole("link", { name: "Criar conta grátis" }).click();
    await page.getByLabel("Nome").fill("Duda");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Criar conta grátis" }).click();
    await expect(page).toHaveURL(/\/salvos/);
  });

  test("bloqueia open redirect no parâmetro next", async ({ page }) => {
    const email = uniqueEmail("redir");
    await register(page, "Eva", email, PASSWORD, "//evil.example.com");
    await expect(page).toHaveURL(/localhost:\d+\/\?bemvindo=1/);
  });
});
