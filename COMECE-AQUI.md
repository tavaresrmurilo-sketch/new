# Mixtour — comece aqui

Guia rápido para rodar o Mixtour no seu computador (Windows, macOS ou Linux).

## 1. Instale (uma vez)

- **Node.js 22 LTS** — <https://nodejs.org> (instalador padrão)
- **PostgreSQL 16** — Windows/macOS: <https://www.postgresql.org/download/> (anote a senha do usuário `postgres`).
  No macOS também pode usar `brew install postgresql@16 && brew services start postgresql@16`.
  Com Docker: `docker run -d --name mixtour-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16`

## 2. Prepare o projeto

1. Extraia o ZIP (ex.: em `Documentos/mixtour`) e abra um terminal nessa pasta
   (Windows: clique com o botão direito na pasta → *Abrir no Terminal*).
2. Crie o banco:
   ```bash
   psql -U postgres -c "CREATE DATABASE mixtour;"
   ```
3. Copie o arquivo de configuração:
   - Windows (PowerShell): `Copy-Item .env.example .env`
   - macOS/Linux: `cp .env.example .env`
4. Abra o `.env` num editor e preencha pelo menos:
   ```
   DATABASE_URL="postgresql://postgres:SUA_SENHA@localhost:5432/mixtour?schema=public"
   AUTH_SECRET="cole aqui 48+ caracteres aleatórios"
   ADMIN_EMAIL="voce@seuemail.com"
   ADMIN_PASSWORD="uma senha com 12+ caracteres"
   ```
   Para gerar o `AUTH_SECRET`: `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`

## 3. Rode

```bash
npm install
npm run db:deploy
npm run db:seed
npm run dev
```

Abra <http://localhost:3000> — de preferência no modo celular do navegador (F12 → ícone de celular)
ou no seu celular pela rede (`http://IP-DO-SEU-PC:3000`).

- Administração: <http://localhost:3000/admin> (com o `ADMIN_EMAIL`/`ADMIN_PASSWORD` do `.env`)
- Para organizadores: crie uma conta e toque em **+** (Publicar)
- Sem provedor de e-mail configurado, os links de confirmação aparecem no terminal e em `/admin/emails`

## Próximos passos

| Quero… | Veja |
|---|---|
| Publicar na internet (Vercel + Neon + R2 + Stripe + Resend) | `docs/DEPLOY.md` |
| Gerar o app Android/iOS e publicar nas lojas | `docs/MOBILE.md` |
| Entender o produto e as integrações | `README.md` |
| Segurança e LGPD | `docs/SECURITY.md` |
| Verificar o que falta configurar | `npm run check:env` |
