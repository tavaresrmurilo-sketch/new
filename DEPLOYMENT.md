# Deploy — JR Cortex AI

## Pré-requisitos
- PostgreSQL 14+ gerenciado (RDS, Cloud SQL, Neon, Supabase, Azure) com backups automáticos e TLS.
- Node.js 20.9+ (ou container).
- Variáveis de ambiente (ver `.env.example`) em um secret manager.

## Variáveis obrigatórias em produção
| Variável | Observação |
|---|---|
| `DATABASE_URL` | incluir `sslmode=require` quando aplicável |
| `DIRECT_URL` | opcional (Neon): conexão direta, sem `-pooler`, usada apenas pelas migrations no deploy |
| `AUTH_SECRET` | ≥ 32 caracteres aleatórios; trocar invalida todas as sessões |
| `ENCRYPTION_KEY` | 32 bytes base64; **guarde com segurança** — sem ela as credenciais do Vault não podem ser decifradas |
| `NEXT_PUBLIC_APP_URL` | URL pública (https) |
| `AI_PROVIDER` e chave correspondente | opcional; padrão `rules` |
| `CRON_SECRET` | necessário para `POST /api/jobs/run` |
| `NODE_ENV=production` | ativa cookies `Secure` |

## Opção A — Docker

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
```

```bash
docker build -t jr-cortex-ai .
docker run -p 3000:3000 --env-file .env.production jr-cortex-ai
```

## Opção B — Vercel / Render / Railway
1. Conecte o repositório.
2. Build: `npm run build` · Start: `npm start` (Render/Railway).
3. Configure as variáveis de ambiente.
4. Execute `npx prisma migrate deploy` no release/pre-deploy.
5. Agende o cron de jobs (Vercel Cron / Render Cron Job) chamando `POST /api/jobs/run` com `Authorization: Bearer $CRON_SECRET` a cada 15 minutos.

> Em ambientes serverless, rotas de importação/relatório usam runtime Node.js; ajuste `maxDuration` conforme o plano.

## Opção C — VM (PM2 + Nginx)
```bash
npm ci && npm run build
npx prisma migrate deploy
pm2 start npm --name jrcortex -- start
# crontab -e
*/15 * * * * cd /srv/jrcortex && npm run jobs:run >> /var/log/jrcortex-jobs.log 2>&1
```
Nginx como proxy reverso com TLS (Let's Encrypt), repassando `X-Forwarded-For`/`X-Forwarded-Host`, e `client_max_body_size 12m` para uploads.

## Primeira carga
```bash
npx prisma migrate deploy
SEED_ADMIN_EMAIL=admin@suaempresa.com.br SEED_ADMIN_PASSWORD='<senha forte>' SEED_SKIP_DEMO=0 npm run db:seed
```
Use `SEED_SKIP_DEMO=1` se não quiser o tenant JR Demo no ambiente.

## Operação
- **Healthcheck**: `GET /api/health` (verifica o banco).
- **Logs**: JSON estruturado em stdout (`LOG_LEVEL`), com redação de segredos — envie para Datadog/CloudWatch/Loki.
- **Backups**: diários com retenção compatível com a política do cliente; teste restauração periodicamente.
- **Escala horizontal**: sessões e dados já estão no banco; mova o rate limiter para Redis e os jobs para uma fila (pg-boss/BullMQ) ao rodar múltiplas instâncias.
- **Rotação de chaves**: `keyVersion` no Vault permite rotacionar `ENCRYPTION_KEY` com re-cifragem gradual.

## Checklist de segurança antes do go-live
- [ ] Senhas padrão do seed alteradas (ou demo desabilitado)
- [ ] `AUTH_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET` gerados e guardados no secret manager
- [ ] HTTPS obrigatório e HSTS ativo
- [ ] Banco com TLS, usuário com privilégios mínimos e backups
- [ ] Provedor de IA configurado apenas se contratado (e consentimento dos clientes)
- [ ] Monitoramento de erros e alertas de jobs de sincronização


## Migrations automáticas na Vercel

A Vercel executa o script `vercel-build` (em vez de `build`), implementado em `scripts/vercel-build.mjs` (multiplataforma):

```
prisma generate → prisma migrate deploy → next build
```

Assim, toda migration nova é aplicada no Neon antes do build, sem apagar dados (`migrate deploy` só aplica migrations pendentes). Se a `DATABASE_URL` usar o pooler do Neon (host com `-pooler`), defina também `DIRECT_URL` com a conexão direta — as migrations usam essa URL. Se uma migration falhar, o deploy é interrompido e a versão anterior continua no ar.

## Cron na Vercel

`vercel.json` agenda `GET /api/jobs/run` **uma vez por dia (09:00 UTC = 06:00 em Brasília)** — compatível com o plano Hobby, que só aceita crons diários. Defina `CRON_SECRET` nas variáveis do projeto. No plano Pro é possível aumentar a frequência (ex.: `"0 * * * *"` para sincronizar integrações a cada hora).

## Verificação antes de uma apresentação

```powershell
npm run pre-demo                                  # .env, banco, migrations, contas e servidor local
npm run pre-demo -- --url=https://SEU-APP.vercel.app   # também verifica a aplicação publicada
```

Também é possível abrir `https://SEU-APP.vercel.app/api/health` — a resposta saudável é `{"status":"ok","database":"connected",...}`.
