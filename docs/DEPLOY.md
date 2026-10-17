# Deploy do Mixtour (produção)

Este guia leva o Mixtour do repositório a uma instalação real. Cada integração externa é
**opcional e independente**: sem credenciais, o recurso aparece desativado com instrução —
nada é simulado. Rode `npm run check:env` a qualquer momento para ver o que falta.

Arquitetura recomendada (custo inicial baixo, escala bem):

| Peça | Recomendação | Alternativas |
|---|---|---|
| App (Next.js 16) | **Vercel** | Qualquer Node 20.9+ (Docker, Railway, Render, VPS) |
| Banco | **Neon** (PostgreSQL 16, pooling) | Supabase, RDS, Postgres próprio (14+) |
| Imagens | **Cloudflare R2** (S3, sem taxa de saída) | AWS S3, Supabase Storage, MinIO |
| E-mail | **Resend** | Qualquer SMTP (Amazon SES, Brevo, Postmark…) |
| Pagamentos | **Stripe** (assinaturas em BRL) | — |
| Mapa base | **OpenFreeMap** (sem chave) | MapTiler, Stadia Maps (style.json com chave) |
| Endereços | **Nominatim/OSM** (1 req/s) | Nominatim próprio para volume alto |

---

## 1. Banco de dados (Neon)

1. Crie um projeto em <https://neon.tech> (região `sa-east-1`/São Paulo).
2. Copie a **connection string com pooling** → `DATABASE_URL` (acrescente `?sslmode=require&pgbouncer=true&connection_limit=1` se usar serverless).
3. Copie a **connection string direta** (sem `-pooler`) → `DIRECT_URL` (usada só pelas migrations no build).
4. As extensões `pg_trgm` e `unaccent` são criadas pela primeira migration (ambas disponíveis no Neon e no Supabase).

## 2. Vercel

1. Importe o repositório. O `vercel.json` já define `buildCommand: npm run vercel-build`, que:
   gera o Prisma Client → aplica migrations pendentes (nunca apaga dados) → roda o seed idempotente (categorias, planos, admin) → `next build`.
2. Configure as variáveis de ambiente (Production e Preview) a partir do `.env.example`. Mínimo:
   `DATABASE_URL`, `DIRECT_URL`, `APP_URL`, `NEXT_PUBLIC_APP_URL`, `AUTH_SECRET` (`openssl rand -base64 48`),
   `ADMIN_EMAIL`, `ADMIN_PASSWORD` (≥ 12 caracteres), `CRON_SECRET`, e o armazenamento S3 (passo 3).
3. **Rotinas agendadas**: o `vercel.json` agenda `/api/cron/daily` às 11:00 UTC (08:00 em Brasília) — lembretes
   de eventos das próximas 36 h + manutenção (arquivar eventos encerrados, limpar sessões/tokens/caches).
   No plano Pro da Vercel você pode adicionar `{ "path": "/api/cron/reminders", "schedule": "0 * * * *" }` para lembretes de hora em hora.
   A Vercel envia `Authorization: Bearer $CRON_SECRET` automaticamente.
4. Domínio próprio: aponte o DNS e atualize `APP_URL`/`NEXT_PUBLIC_APP_URL` (as variáveis `NEXT_PUBLIC_*` e o CSP são calculados no build — faça um novo deploy após alterá-las).

## 3. Imagens (Cloudflare R2)

1. Crie um bucket (ex.: `mixtour-media`) e habilite acesso público por domínio próprio (ex.: `img.mixtour.app`) ou pelo `r2.dev`.
2. Crie um token de API com permissão de escrita no bucket.
3. Variáveis:
   ```
   STORAGE_DRIVER=s3
   S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
   S3_REGION=auto
   S3_BUCKET=mixtour-media
   S3_ACCESS_KEY_ID=...
   S3_SECRET_ACCESS_KEY=...
   S3_PUBLIC_URL=https://img.mixtour.app
   ```
   O domínio de `S3_PUBLIC_URL` entra automaticamente no Content-Security-Policy (`img-src`).
   Na Vercel o disco é temporário — sem S3 o envio de imagens é recusado com mensagem explicativa.

## 4. E-mail (Resend)

1. Em <https://resend.com>, adicione e verifique seu domínio (registros SPF, DKIM e, de preferência, DMARC).
2. `EMAIL_PROVIDER=resend`, `RESEND_API_KEY=...`, `EMAIL_FROM="Mixtour <nao-responda@mixtour.app>"`.
3. SMTP alternativo: `EMAIL_PROVIDER=smtp` + `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`.
4. Todo e-mail fica registrado em `/admin/emails` (enviados, falhas e "não enviados" quando não há provedor), com reenvio.

## 5. Assinaturas (Stripe)

1. No painel do Stripe (modo de teste primeiro), crie dois produtos — **Mixtour Pro** e **Mixtour Business** — cada um com preço **recorrente mensal** e **anual em BRL** (valores sugeridos estão em `src/lib/plans.ts` e podem ser alterados em `/admin/planos`).
2. Variáveis: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_YEARLY`, `STRIPE_PRICE_BUSINESS_MONTHLY`, `STRIPE_PRICE_BUSINESS_YEARLY`. O seed grava os IDs de preço nos planos (ou edite em `/admin/planos`).
3. Webhook: endpoint `https://<seu-domínio>/api/billing/webhook` com os eventos
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.paid`. Copie o segredo → `STRIPE_WEBHOOK_SECRET`.
4. **Portal do cliente** (Settings → Billing → Customer portal): habilite troca entre os preços dos dois produtos, cancelamento e histórico de faturas.
5. Teste: assine com o cartão `4242 4242 4242 4242` em `/painel/plano` e confira o plano atualizado.
   Sem Stripe, o plano de uma organização pode ser alterado manualmente em `/admin/organizacoes` (fica registrado na auditoria).

## 6. Login com Google (opcional)

1. Google Cloud Console → APIs e serviços → Credenciais → **ID do cliente OAuth** (aplicativo da Web).
2. URI de redirecionamento autorizado: `https://<seu-domínio>/api/auth/google/callback`.
3. `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`. O botão "Continuar com Google" aparece automaticamente.

## 7. Mapas e endereços

- **Mapa base**: por padrão usa os estilos vetoriais gratuitos do OpenFreeMap (`dark` e `positron`).
  Para SLA comercial, use MapTiler/Stadia: defina `NEXT_PUBLIC_MAP_STYLE_DARK`, `NEXT_PUBLIC_MAP_STYLE_LIGHT`
  (URLs de style.json com a chave) e `MAP_CSP_HOSTS` com os domínios do provedor (ex.: `https://api.maptiler.com`).
  Se o provedor falhar, o app troca para um fundo liso automaticamente e os pinos continuam funcionando.
- **Geocodificação** (busca de endereço no editor de eventos e de cidade no perfil): Nominatim público — exige
  `GEOCODER_CONTACT_EMAIL`, respeita 1 requisição/s (fila interna + cache de 30 dias no banco).
  Para volume alto, aponte `NOMINATIM_URL` para uma instância própria. `GEOCODER=none` desativa a busca
  (organizadores posicionam o pino manualmente).

## 8. Notificações push (opcional)

`npx web-push generate-vapid-keys` → `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (igual à pública) e `VAPID_SUBJECT=mailto:...`.

## 9. Checklist pós-deploy

- [ ] `GET /api/health` responde `{"status":"ok"}`
- [ ] `npm run check:env` sem itens obrigatórios pendentes
- [ ] Login como administrador em `/admin`; revisar `/admin/configuracoes` (modo de moderação)
- [ ] Criar conta, confirmar e-mail (link recebido), criar organização e publicar um evento real
- [ ] Evento aparece no mapa (após moderação, conforme configuração)
- [ ] Checkout de teste do Stripe atualiza o plano; webhook com entregas 2xx
- [ ] Rotina `/api/cron/daily` executada (ver `/admin/rotinas`)
- [ ] Revisar textos de `/termos` e `/privacidade` com assessoria jurídica e preencher dados da empresa (CNPJ, endereço, encarregado/DPO)

## Servidor próprio (sem Vercel)

```bash
npm ci
npx prisma migrate deploy && npm run db:seed
npm run build && npm start   # porta 3000
```
Atrás de nginx/Caddy com HTTPS, defina `TRUST_PROXY=true` (para o IP real nos limites de taxa) e agende
`curl -H "Authorization: Bearer $CRON_SECRET" https://<domínio>/api/cron/daily` diariamente.
Com `STORAGE_DRIVER=local`, as imagens ficam em `./storage/uploads` (inclua no backup).
