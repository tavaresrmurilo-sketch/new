# Mixtour

**Descubra o que está rolando perto de você.**

O Mixtour é um mapa vivo de eventos — shows, festas, festivais, teatro, feiras, exposições,
gastronomia e passeios — feito para o celular. Para quem sai, é o jeito mais rápido de achar
o que fazer hoje, no fim de semana ou perto de onde está. Para quem organiza, é uma vitrine
com métricas, destaque no mapa e seguidores que recebem aviso de cada novo evento — em um
modelo SaaS com planos Gratuito, Pro e Business.

> Sem dados fictícios: o Mixtour nasce vazio. Eventos entram pelos organizadores (com
> moderação configurável) e cada integração externa só funciona com credenciais reais.

---

## Funcionalidades

**Explorador (grátis)**
- Mapa interativo (MapLibre) com pinos por categoria, agrupamento, destaques e "acontecendo agora"; lista sincronizada com o mapa; bottom sheet arrastável no celular
- Busca sem acentos com sugestões (eventos, organizadores, categorias, cidades), filtros por categoria, data (hoje, amanhã, fim de semana…), gratuitos, acessibilidade e ordenação; filtros na URL (compartilháveis)
- "Perto de mim" com distância nos cards (localização só com permissão explícita)
- Página do evento com mapa, "como chegar" (Google Maps, Waze, Apple Maps, Uber), adicionar à agenda (.ics / Google Agenda), compartilhar, ingressos, denúncia
- Salvar, "Vou"/"Tenho interesse", seguir organizadores; agenda pessoal; lembretes (in-app, e-mail, push)
- Conta com e-mail/senha ou Google, preferências, sessões ativas, exportação e exclusão de dados (LGPD)
- PWA instalável, tema escuro/claro

**Organizador (SaaS)**
- Painel com métricas reais (visualizações, visitantes únicos, salvamentos, presenças, cliques em ingresso)
- Editor de eventos mobile-first com busca de endereço, pino arrastável, upload de capa otimizado, prévia
- Ciclo de vida completo: rascunho → análise → publicado → encerrado/cancelado; duplicar; destacar no mapa
- Perfil público com seguidores, locais salvos, equipe com papéis e convites
- Planos com limites, assinatura via Stripe Checkout, portal de cobrança, webhooks idempotentes

**Equipe Mixtour (/admin)**
- Visão geral (KPIs, MRR estimado), fila de moderação, denúncias, usuários, organizações (selo, confiança, suspensão, plano manual), categorias, planos, configurações, outbox de e-mails, auditoria e rotinas

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL + Prisma 6 ·
MapLibre GL + Supercluster · Stripe · sharp · Resend/SMTP · S3/R2 · Vitest · Playwright

Detalhes em [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) e convenções em [docs/CONVENTIONS.md](docs/CONVENTIONS.md).

## Rodando localmente

Requisitos: Node.js 20.9+ e PostgreSQL 14+.

```bash
npm install
cp .env.example .env          # preencha DATABASE_URL, AUTH_SECRET, ADMIN_EMAIL/ADMIN_PASSWORD
npm run db:deploy             # aplica as migrations
npm run db:seed               # categorias, planos e conta de administrador
npm run dev                   # http://localhost:3000
```

Sem provedor de e-mail, os links de confirmação/redefinição aparecem no terminal (e ficam em `/admin/emails`).

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build e servidor de produção |
| `npm run typecheck` / `npm run lint` | TypeScript e ESLint |
| `npm test` | Testes unitários e de integração (banco `mixtour_test`, ou `TEST_DATABASE_URL`) |
| `npm run test:e2e` | E2E com Playwright (celular e desktop) em build de produção isolado |
| `npm run db:deploy` / `npm run db:seed` | Migrations / seed idempotente |
| `npm run jobs:run -- daily` | Executa uma rotina agendada pela linha de comando |
| `npm run check:env` | Diagnóstico das integrações configuradas |

## Integrações e o que falta configurar

| Integração | Sem credencial | Como ativar |
|---|---|---|
| E-mail (Resend/SMTP) | mensagens ficam no outbox (`SKIPPED`) | `EMAIL_PROVIDER` + chave — [DEPLOY §4](docs/DEPLOY.md#4-e-mail-resend) |
| Imagens S3/R2 | disco local (não funciona na Vercel) | `STORAGE_DRIVER=s3` + `S3_*` — [DEPLOY §3](docs/DEPLOY.md#3-imagens-cloudflare-r2) |
| Stripe | página de plano informa; admin altera plano manualmente | `STRIPE_*` + webhook — [DEPLOY §5](docs/DEPLOY.md#5-assinaturas-stripe) |
| Google OAuth | botão oculto | `GOOGLE_CLIENT_*` — [DEPLOY §6](docs/DEPLOY.md#6-login-com-google-opcional) |
| Web Push | opção desativada no perfil | chaves VAPID — [DEPLOY §8](docs/DEPLOY.md#8-notificações-push-opcional) |
| Mapa base | OpenFreeMap (sem chave); fallback liso se indisponível | `NEXT_PUBLIC_MAP_STYLE_*` |
| Geocodificação | Nominatim público (1 req/s) | `GEOCODER_CONTACT_EMAIL`; `GEOCODER=none` desliga |

Deploy completo passo a passo: **[docs/DEPLOY.md](docs/DEPLOY.md)** · Segurança e LGPD: **[docs/SECURITY.md](docs/SECURITY.md)**
