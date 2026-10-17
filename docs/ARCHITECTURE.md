# Arquitetura

## Visão geral

```
                    ┌────────────────────────── Next.js 16 (App Router) ──────────────────────────┐
 Navegador / PWA ──▶│ Server Components (páginas)   Server Actions (mutações)   Route Handlers (API)│
  MapLibre + SW     │        │                              │                          │          │
                    │        └──────────────┬───────────────┴──────────────┬───────────┘          │
                    │                 src/server/* (serviços de domínio, "server-only")           │
                    └───────────────┬──────────────┬──────────────┬──────────────┬────────────────┘
                                    │              │              │              │
                              PostgreSQL       S3 / R2       Resend/SMTP      Stripe
                         (Prisma, pg_trgm,   (imagens WebP)   (outbox)     (Checkout, Portal,
                          unaccent, rate                                     webhooks)
                          limit, cache)                   Nominatim (geocodificação, cache)
```

- **Renderização**: páginas públicas (explorar, evento, organizador) são Server Components com metadados e JSON-LD para SEO; o mapa e o bottom sheet são Client Components. Dados do mapa vêm de `GET /api/events/map` (pontos compactos por bbox) e a lista de `GET /api/events` (paginada por cursor).
- **Mutações**: Server Actions finas (autorização → rate limit → validação zod → serviço → `revalidatePath`). Regras de negócio ficam em serviços testáveis em `src/server/<domínio>`.
- **Mapa**: MapLibre GL 5 com estilos vetoriais (OpenFreeMap por padrão, troca automática claro/escuro e fallback sem rede). Pinos são marcadores HTML desenhados sem React (desempenho), agrupados no cliente com Supercluster.
- **Busca**: coluna `searchVector` (tsvector com pesos: título > local > resumo/tags > descrição), mantida por trigger com `unaccent`; autocompletar por similaridade trigram (`pg_trgm`).
- **Fusos horários**: datas em UTC no banco, cada evento guarda seu `timezone` (IANA). Presets ("hoje", "fim de semana") são calculados no fuso de São Paulo por padrão (`src/lib/dates.ts`), sem dependências.

## Domínios e módulos

| Domínio | Servidor | Interface |
|---|---|---|
| Autenticação | `src/server/auth/*` (sessões HMAC, tokens de uso único, Google OAuth/PKCE) | `(auth)/*` |
| Explorar e busca | `src/server/events/search.ts`, `visibility.ts`, `dto.ts` | `(app)/page.tsx`, `components/explore`, `components/map` |
| Evento e engajamento | `src/server/events/detail.ts`, `src/server/engagement/*` | `(app)/evento/[slug]`, `(app)/organizador/[slug]`, `components/engagement` |
| Área do usuário | `src/server/me/*` | `(app)/salvos`, `(app)/notificacoes`, `(app)/perfil/*` |
| Painel do organizador | `src/server/events/service.ts`, `src/server/organizations/*` | `painel/*`, `components/painel` |
| Comercial | `src/server/billing/*`, `src/server/team/*` | `painel/plano`, `painel/equipe`, `convite/[token]`, `(marketing)/*` |
| Administração | `src/server/admin/*`, `src/server/moderation/*`, `src/server/jobs/*` | `admin/*` |
| Infraestrutura | `db`, `env`, `security/*`, `storage/*`, `email/*`, `geocode`, `notifications`, `audit`, `settings` | — |

## Modelo de dados (resumo)

- `User` (papel USER/ADMIN, status, preferências) · `Session` · `OAuthAccount` · `VerificationToken`
- `Organization` (plano, selo verificado, publicador confiável, cliente Stripe) · `Membership` (OWNER/ADMIN/EDITOR) · `OrgInvite` · `Subscription` · `Plan` (preços e limites editáveis) · `StripeEvent`
- `Venue` · `Category` · `Event` (status, datas + fuso, local + coordenadas, preço, ingressos, acessibilidade, contadores, destaque, `searchVector`)
- `EventSave` · `EventRsvp` (GOING/INTERESTED) · `Follow` · `EventMetricDaily` · `EventViewMark` · `EventBoost`
- `Report` · `Notification` · `PushSubscription` · `EmailOutbox` · `Upload` · `AuditLog` · `RateLimitBucket` · `GeocodeCache` · `AppSetting` · `JobRun`

## Ciclo de vida do evento

```
DRAFT ──publicar──▶ (moderação) ──▶ PENDING_REVIEW ──aprovar──▶ PUBLISHED ──fim + 24 h──▶ ARCHIVED
  ▲                      │                 │ recusar                 │ cancelar
  └──── editar ◀──── REJECTED ◀────────────┘                         ▼
                                                                 CANCELED
```
Modo de moderação (`/admin/configuracoes`): `all` (tudo passa por análise), `new_orgs` (padrão: só organizações sem selo de confiança) ou `none`. Ao publicar, seguidores são avisados; ao alterar data/local ou cancelar, quem marcou presença é avisado (`src/server/events/lifecycle.ts`).

## Planos e limites

Definidos na tabela `Plan` (valores iniciais em `src/lib/plans.ts`, editáveis no `/admin/planos`): eventos ativos simultâneos, membros da equipe, locais salvos, destaques por mês, estatísticas completas, exportação CSV e selo profissional. A cobrança é sincronizada pelo webhook do Stripe (`Subscription` → `Organization.plan`).

## Rotinas

`GET /api/cron/{daily|reminders|maintenance}` com `Authorization: Bearer $CRON_SECRET`: lembretes de eventos das próximas 36 h (idempotentes), arquivamento de eventos encerrados e limpeza de dados temporários. Cada execução fica em `JobRun` (`/admin/rotinas`).
