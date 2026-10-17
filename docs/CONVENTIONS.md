# Convenções de código do Mixtour

Leia antes de escrever código. Estas regras valem para todas as fases.

## Stack (versões atuais — confira a documentação local)
- **Next.js 16** (App Router, Turbopack). Há mudanças em relação ao 15: `params`/`searchParams` são **Promises**; tipos globais `PageProps<"/rota/[x]">`, `LayoutProps`, `RouteContext<"/api/x/[id]">` (gerados por `npx next typegen`); `middleware` virou `src/proxy.ts`; `revalidateTag(tag, "max")` exige 2 argumentos; use `revalidatePath`/`updateTag`/`refresh` de `next/cache`. Documentação da versão instalada: `node_modules/next/dist/docs/`.
- **React 19.3**, **Tailwind CSS v4** (configuração em CSS: `src/app/globals.css`, sem `tailwind.config`), **Prisma 6** + PostgreSQL, **zod 4** (`z.email()`, `{ error: "..." }`), **MapLibre GL 5** + **Supercluster**, **lucide-react** (ícones; o pacote `lucide` vanilla gera SVG em texto para pinos do mapa).
- Não instale dependências novas. Se precisar de uma, descreva no relatório final.

## Estrutura
```
src/app/(app)/        app do explorador (shell com header desktop + barra inferior mobile)
src/app/(auth)/       entrar, cadastrar, recuperar/redefinir senha, verificar e-mail
src/app/painel/       painel do organizador (layout próprio)
src/app/admin/        administração da plataforma (layout próprio)
src/app/api/          route handlers (JSON)
src/components/ui/    primitivos de UI (Button, Input/Field/Select/Textarea/Checkbox, Dialog, Dropdown, Tabs, Switch, Chip/Segmented, Card, Badge, Alert, EmptyState, Skeleton, Avatar, PageHeader, SubmitButton, FormMessage)
src/components/layout/ shell (SiteHeader, BottomNav, MobileHeader, AppShell, SiteFooter, ThemeToggle)
src/components/events/ EventCard (variants "row" | "tile"), CategoryIcon
src/components/map/   useMap (MapLibre com tema + fallback), map-style, icon-svg
src/lib/              código isomórfico: dates (fusos, presets de data), format (pt-BR), geo, slug, plans, categories, events (EventCardData), validation/*, hooks/*
src/server/           somente servidor ("server-only"): db, env, auth/*, security/*, email/*, storage/*, geocode, notifications, audit, settings, billing/plans, events/{visibility,dto}
```

## Camadas no servidor
- **Serviço** (`src/server/<domínio>/service.ts` ou arquivos temáticos): regras de negócio puras, recebem o ator explicitamente (`userId`, `organizationId`), sem `cookies()`/`headers()` — por isso são testáveis com Vitest.
- **Server Actions** (`src/server/<domínio>/actions.ts` com `"use server"`): finas — `assertUser()`/`assertAdmin()`/`assertOrgRole()`, rate limit, `zod.safeParse`, chamam o serviço, `revalidatePath`, retornam `ActionState` (`src/lib/action.ts`). Erros esperados viram `{ status: "error", message }` — nunca vaze stack trace.
- **Route Handlers** que alteram estado: `isSameOrigin(req)` (CSRF), sessão via `getSessionUser()`, rate limit, validação zod, respostas JSON com mensagem em pt-BR.
- **Consultas públicas**: sempre filtre com `listedEventWhere()` (mapa/listas) ou `PUBLIC_EVENT_PAGE_WHERE` (página do evento) de `src/server/events/visibility.ts`. Cards usam `EVENT_CARD_SELECT` + `toEventCard()` de `src/server/events/dto.ts`.
- Autorização SEMPRE no servidor. Nunca confie em ids vindos do cliente sem checar posse/papel (`assertOrgRole(userId, orgId, "EDITOR" | "ADMIN" | "OWNER")`).
- Ações sensíveis (moderação, papéis, cobrança, exclusão de conta, mudanças de plano): `audit({...})`.
- Limites de plano: `src/server/billing/plans.ts` (`assertCanActivateEvent`, `assertCanAddMember`, `assertCanAddVenue`, `boostsUsedThisMonth`, `PlanLimitError`).
- Notificações: `notify(userId, { type, title, body, url }, { email })` de `src/server/notifications.ts`. E-mails: `sendEmail(to, genericMessage({...}))` de `src/server/email` (tudo vai para `EmailOutbox`).
- Configurações da plataforma: `getSetting/setSetting` (`src/server/settings.ts`).
- Datas: guarde UTC; converta horário local com `parseLocalDateTime(date, time, tz)` e exiba com `src/lib/format.ts` (sempre passando o `timezone` do evento).

## Formulários
- `useActionForm(action, idle)` (`src/lib/hooks/use-action-form.ts`) + `<form onSubmit={onSubmit}>` + `<SubmitButton pending={pending}>`. Não use `<form action={...}>` em formulários com validação (o React 19 apaga os campos após a action).
- Campos com `<Field label htmlFor error hint>` e `fieldError(state, "campo")`; mensagens gerais com `<FormMessage state={state} />`.

## UI e experiência
- **Mobile-first.** Projete para 390 px primeiro; desktop a partir de `lg` (1024 px).
- No celular, páginas do grupo `(app)` ganham a barra inferior fixa: use `pb-nav` no conteúdo rolável. Topo das páginas internas no celular: `<MobileHeader title back actions />`. No desktop, o `SiteHeader` já existe (64 px, sticky).
- Use os tokens (`bg-background`, `bg-surface`, `bg-surface-2`, `text-muted-foreground`, `border-border`, `text-primary`, `bg-primary-soft`, `text-accent`, `bg-brand-gradient`, `text-brand-gradient`, `glass`, `shadow-float`, `shadow-card`, `rounded-3xl`...). Tema escuro é o padrão; tudo precisa funcionar também no claro.
- Alvos de toque ≥ 44 px, `aria-label` em botões de ícone, foco visível, textos em **português do Brasil** (tom próximo e direto).
- Estados vazios bonitos (`EmptyState`) e skeletons (`Skeleton`, `EventCardSkeleton`) — nunca tela em branco.
- Imagens enviadas pelo usuário: `<img>` com `loading="lazy"` (já são WebP otimizadas no upload).
- Texto de usuário é renderizado como texto (sem `dangerouslySetInnerHTML`).

## Dados reais apenas
- **Não crie eventos, organizações, avaliações ou números fictícios** em código de produção, seeds ou telas. Sem dados: estado vazio honesto com chamada para ação.
- Integrações externas sem credenciais ficam visivelmente desativadas (com instrução de configuração), nunca simuladas.

## Testes
- Vitest: `tests/unit/*.test.ts` (puro) e `tests/integration/*.test.ts` (banco real). Helpers em `tests/helpers.ts` (`resetDb`, `createUser`, `createOrg`, `createEvent`, `setPlan`).
- Cada processo de teste paralelo usa seu próprio banco: `TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/<db>?schema=public npx vitest run <arquivos>`.
- QA visual: `node scripts/screenshot.mjs <url> <saida.png> [mobile|desktop] [dark|light] [fullpage]`.
- Servidor de desenvolvimento paralelo: `NEXT_DIST_DIR=.next-<nome> npx next dev -p <porta>`.
- Antes de concluir: `npx tsc --noEmit` e `npx eslint <seus arquivos>` sem erros.
