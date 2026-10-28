# VoltaCliente

**Clientes que voltam. Negócios que crescem.**

Plataforma SaaS para pequenas empresas e autônomos de serviços recorrentes (ar-condicionado, oficinas, barbearias e salões, manutenção…) recuperarem clientes antigos: registra clientes e atendimentos, calcula quando cada cliente deve voltar e prepara uma mensagem personalizada no WhatsApp (envio assistido).

> Este projeto fica na pasta `voltacliente/` porque a raiz do repositório já contém outro sistema (JR Cortex AI), que não foi alterado. Todos os comandos abaixo são executados **dentro de `voltacliente/`**.

---

## Sumário

1. [Funcionalidades](#funcionalidades)
2. [Stack](#stack)
3. [Arquitetura](#arquitetura)
4. [Rodar localmente (Windows / PowerShell)](#rodar-localmente-windows--powershell)
5. [Banco de dados (Neon)](#banco-de-dados-neon)
6. [Deploy na Vercel](#deploy-na-vercel)
7. [Testes e qualidade](#testes-e-qualidade)
8. [Segurança, multiempresa e LGPD](#segurança-multiempresa-e-lgpd)
9. [WhatsApp, planos e pagamentos](#whatsapp-planos-e-pagamentos)
10. [Status: concluído × depende de configuração](#status-concluído--depende-de-configuração)

---

## Funcionalidades

| Área                                  | O que faz                                                                                                                                                                                                                                                              |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Landing page** (`/`)                | Hero, demonstração visual (rotulada como ilustrativa), problema, como funciona, recursos, segmentos, planos de lançamento, FAQ, CTA e rodapé com suporte/privacidade/termos                                                                                            |
| **Autenticação**                      | Cadastro, login, logout, recuperação de senha (com e-mail configurado), alteração de senha, exclusão de conta. Senhas com hash scrypt, sessões em cookie httpOnly, limite de tentativas                                                                                |
| **Onboarding**                        | Empresa, segmento, telefone, fuso horário, serviços mais comuns (sugeridos por segmento) e periodicidade padrão                                                                                                                                                        |
| **Painel** (`/painel`)                | Indicadores reais: clientes, retornos de hoje, atrasados, próximos 7 dias, contatos, clientes que retornaram e receita registrada em retornos; gráfico de evolução; próximos contatos; últimos atendimentos; ações rápidas; filtro de período                          |
| **Clientes**                          | CRUD completo, busca instantânea, filtros, ordenação, paginação, histórico individual (atendimentos, retornos, contatos), consentimento e “não contatar”, prevenção de duplicatas por telefone/e-mail, importação CSV com pré-visualização e validação, exportação CSV |
| **Serviços**                          | Nome, descrição, preço padrão, intervalo de retorno (ou padrão da empresa), ativo/inativo                                                                                                                                                                              |
| **Atendimentos**                      | Cliente, serviço, data, valor cobrado, observações e próxima data de retorno (automática, manual ou “sem retorno”)                                                                                                                                                     |
| **Central de retornos** (`/retornos`) | Abas Hoje, Atrasados, Próximos, Contatados, Convertidos e Encerrados; Enviar WhatsApp, Marcar como contatado, Registrar retorno, Adiar, Encerrar/Reabrir e histórico de ações                                                                                          |
| **Mensagens**                         | Modelos editáveis com variáveis, modelo padrão e por serviço, pré-visualização                                                                                                                                                                                         |
| **Relatórios**                        | Clientes que retornaram, conversão dos contatos registrados, receita registrada (em retornos e total), serviços com mais retornos e evolução (avançados nos planos Profissional/Business)                                                                              |
| **Configurações**                     | Empresa, plano (limites), conta, privacidade e dados (exportação JSON/CSV e exclusão da empresa)                                                                                                                                                                       |

## Stack

| Camada       | Escolha                                                                 | Versão      |
| ------------ | ----------------------------------------------------------------------- | ----------- |
| Framework    | Next.js (App Router, Turbopack, Server Actions)                         | 16.4        |
| UI           | React · Tailwind CSS · componentes no padrão shadcn/ui (Radix) · Lucide | 19.3 · 4.3  |
| Banco        | PostgreSQL (Neon em produção) · Prisma ORM com `@prisma/adapter-pg`     | Prisma 7.10 |
| Autenticação | Better Auth (e-mail e senha, sessões no banco, rate limit no banco)     | 1.7         |
| Validação    | Zod (cliente e servidor)                                                | 4.6         |
| Gráficos     | Recharts                                                                | 3.10        |
| Testes       | Vitest (unitários + integração com PostgreSQL) · Playwright (E2E)       | 5 · 1.63    |
| Hospedagem   | Vercel                                                                  | —           |

Decisões técnicas relevantes:

- **Prisma 7 estável** (o 8 ainda está em RC). Driver `pg` via adapter, igual em local e no Neon.
- **Cache Components desativado**: o app autenticado é 100% dinâmico por empresa; a landing e as páginas legais continuam estáticas.
- **Componentes shadcn/ui** foram escritos no padrão oficial (Radix + CVA) porque o registro `ui.shadcn.com` estava inacessível no ambiente de desenvolvimento. O `components.json` está pronto para usar `npx shadcn add` normalmente.
- **Paleta dos gráficos validada** quanto a daltonismo e contraste nos modos claro e escuro (tokens `--chart-1` e `--chart-2` em `globals.css`).

## Arquitetura

```
voltacliente/
├─ prisma/
│  ├─ schema.prisma            # modelo de dados (comentado)
│  └─ migrations/              # migração inicial + restrições CHECK + planos
├─ src/
│  ├─ app/
│  │  ├─ (marketing)/          # landing, planos, suporte, privacidade, termos (estáticas)
│  │  ├─ (auth)/               # entrar, cadastro, esqueci/redefinir senha
│  │  ├─ (app)/                # área logada (layout exige sessão + empresa)
│  │  ├─ onboarding/
│  │  └─ api/                  # Better Auth, exportações, health, webhook (futuro)
│  ├─ modules/<domínio>/       # camada de serviços por domínio
│  │  ├─ schema.ts             #   validação Zod (compartilhada com formulários)
│  │  ├─ service.ts            #   regras de negócio + acesso a dados ("server-only")
│  │  └─ actions.ts            #   Server Actions: sessão → validação → serviço
│  ├─ server/                  # db, auth, sessão/tenant, erros, logger, e-mail
│  ├─ lib/                     # funções puras (datas, telefone, dinheiro, CSV, templates…)
│  ├─ components/              # ui/ (shadcn), app/, charts/, returns/, marketing/…
│  └─ proxy.ts                 # redireciona rotas privadas sem cookie de sessão
└─ tests/
   ├─ unit/                    # funções puras
   ├─ integration/             # serviços contra PostgreSQL real (isolamento, ciclo de vida)
   └─ e2e/                     # Playwright (fluxo principal, isolamento, responsividade)
```

Fluxo de uma operação: **interface → Server Action** (`actions.ts`: obtém o tenant da sessão e trata erros) **→ serviço** (`service.ts`: valida com Zod e aplica regras, sempre filtrando por `companyId`) **→ Prisma**.

### Modelo de dados

`User`, `Session`, `Account`, `Verification`, `RateLimit` (Better Auth) · `Company`, `Membership` (usuário ↔ empresa, papéis OWNER/ADMIN/MEMBER) · `Customer`, `Service`, `Appointment` · `ReturnReminder` (lembrete de retorno, 1 por atendimento) e `ReminderEvent` (histórico de ações) · `ContactLog` (histórico de contatos) · `MessageTemplate` · `Plan`, `Subscription`.

### Regras dos retornos

- Ao registrar um atendimento, o próximo retorno é `data + intervalo do serviço` (ou o padrão da empresa), com ajuste manual opcional.
- Um novo atendimento do mesmo serviço **converte** o lembrete aberto anterior (o cliente voltou) e cria o próximo; lembretes antigos duplicados são encerrados como “substituídos”. “Registrar retorno” converte o lembrete de origem mesmo com outro serviço.
- Atendimentos lançados retroativamente não criam lembretes nem convertem lembretes mais recentes.
- “Hoje” é calculado no **fuso horário da empresa**.
- Abrir o WhatsApp **não** marca o contato: só o registro manual (“Enviei — marcar como contatado”) conta. Envios duplicados em até 2 minutos são bloqueados.

## Rodar localmente (Windows / PowerShell)

Pré-requisitos: **Node.js 20.19+ (recomendado 22 LTS)** e **PostgreSQL 14+** (local, Docker ou um banco gratuito no Neon).

```powershell
cd voltacliente
npm install                       # também gera o Prisma Client

Copy-Item .env.example .env       # depois edite o .env
# Gere o BETTER_AUTH_SECRET:
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Banco local com Docker (opcional):

```powershell
docker run -d --name voltacliente-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=voltacliente -p 5432:5432 postgres:16
```

Aplicar as migrações e iniciar:

```powershell
npm run db:deploy                 # cria as tabelas e os 3 planos
npm run dev                       # http://localhost:3000
```

Sem serviço de e-mail configurado, em desenvolvimento o link de “Esqueci minha senha” aparece no terminal.

Scripts úteis: `npm run db:migrate` (nova migração após alterar o schema), `npm run db:studio` (Prisma Studio), `npm run format`.

## Banco de dados (Neon)

1. Crie um projeto em <https://neon.tech> (região sugerida: `AWS São Paulo (sa-east-1)`).
2. Em **Connection Details** copie:
   - a string **pooled** (host com `-pooler`) → `DATABASE_URL`;
   - a string **direct** (sem `-pooler`) → `DIRECT_URL` (usada apenas pelas migrações).
3. Acrescente `?sslmode=require` se a string não tiver.

## Deploy na Vercel

1. Importe o repositório na Vercel e defina **Root Directory = `voltacliente`** (Framework: Next.js).
2. Configure as variáveis de ambiente (Production e Preview) conforme o `.env.example`:
   `DATABASE_URL`, `DIRECT_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` e `NEXT_PUBLIC_APP_URL` (URL pública, ex.: `https://seu-dominio.com.br`). Opcionais: `RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_SUPPORT_EMAIL`.
3. A Vercel executa automaticamente o script `vercel-build`, que roda `prisma generate`, **`prisma migrate deploy`** e `next build`.
4. Para previews, use uma _branch_ do Neon com outra `DATABASE_URL`/`DIRECT_URL` no ambiente Preview, para não aplicar migrações de teste no banco de produção.
5. Recomenda-se a região de funções `gru1` (São Paulo) próxima ao banco.

Pela CLI no PowerShell (use `vercel.cmd` para evitar a política de execução de scripts):

```powershell
npm install -g vercel
vercel.cmd login
vercel.cmd link                   # escolha o projeto; Root Directory: voltacliente
vercel.cmd env add BETTER_AUTH_SECRET production
vercel.cmd --prod
```

Verificação pós-deploy: `GET /api/health` responde `{"status":"ok"}` quando a aplicação e o banco estão acessíveis.

## Testes e qualidade

```powershell
npm run typecheck                 # tipos (gera os tipos das rotas antes)
npm run lint                      # ESLint (regras Next + React Compiler)
npm test                          # unitários
npm run test:integration          # integração: requer TEST_DATABASE_URL (banco separado, nome com "test")
npm run test:e2e                  # Playwright; sobe "npm run dev" se não houver servidor
npm run build                     # build de produção
```

Para os testes E2E, instale o navegador uma vez: `npx playwright install chromium`. O limitador de tentativas permite 5 cadastros por minuto por IP; aguarde um minuto entre execuções repetidas da suíte.

Cobertura atual: **61 testes unitários** (datas e fuso, cálculo de retorno, telefone/WhatsApp, dinheiro, templates, CSV, política de contato, senha, assinatura de webhook), **31 de integração** (isolamento entre empresas em todos os módulos, FK composta no banco, ciclo de vida dos lembretes, limites de plano, importação, exclusões LGPD) e **4 E2E** (fluxo principal completo, isolamento por URL, rotas protegidas e ausência de rolagem horizontal no celular).

## Segurança, multiempresa e LGPD

- **Isolamento em duas camadas**: (1) o `companyId` vem sempre da sessão no servidor (`requireTenant`), nunca do navegador, e toda consulta filtra por ele; (2) relações entre clientes, serviços, atendimentos e lembretes usam **chaves estrangeiras compostas `(id, companyId)`**, então o próprio banco rejeita vínculos entre empresas.
- Validação com Zod no servidor em toda Server Action; erros inesperados são registrados sem dados pessoais e retornam mensagem genérica.
- Better Auth: hash scrypt, cookies httpOnly/secure, revogação de sessões ao redefinir senha, limite de tentativas persistido no banco, proteção contra enumeração de e-mails.
- Cabeçalhos de segurança (HSTS, `X-Frame-Options`, `nosniff`, CSP `frame-ancestors`), `poweredByHeader` desativado, proteção contra _open redirect_ no login e contra fórmulas em CSV exportado.
- LGPD: consentimento e “não contatar” com data de registro; envio bloqueado sem consentimento ou com opt-out; exclusão definitiva de cliente, empresa e conta; exportação completa (JSON) e de clientes (CSV); logs só com identificadores técnicos. Os textos de Privacidade e Termos são **modelos** e devem ser revisados por profissional jurídico.

## WhatsApp, planos e pagamentos

- **Envio assistido**: o sistema monta a mensagem a partir do modelo (variáveis `{primeiro_nome}`, `{empresa}`, `{servico}`, `{data_ultimo_atendimento}`, `{tempo_desde}`, `{data_recomendada}`…), mostra a pré-visualização e abre `wa.me` com o texto. Não há API paga nem disparo automático. A interface `MessageChannel` (`src/modules/messaging/channels.ts`) está pronta para uma futura integração com a API oficial do WhatsApp Business.
- **Planos** (preços de lançamento, sujeitos a confirmação): Inicial R$ 39 (100 clientes), Profissional R$ 79 (500 clientes + relatórios avançados), Business R$ 149 (ilimitado). Os limites são aplicados pelo servidor a partir da tabela `plans`. Toda empresa começa no plano Inicial em **período de lançamento sem cobrança** e pode trocar de plano livremente; nada é apresentado como assinatura paga.
- **Mercado Pago**: contrato `BillingProviderAdapter`, validação da assinatura `x-signature` e rota `/api/billing/mercadopago/webhook` preparados; a rota responde `501` e nenhuma cobrança é feita. Credenciais somente via variáveis de ambiente.

## Status: concluído × depende de configuração

**Concluído e testado**

- Todas as fases 1 a 4 descritas acima, com build de produção, tipos, lint, testes unitários, de integração e E2E passando.
- Isolamento entre duas empresas verificado em testes de integração (todos os módulos) e no navegador (acesso por URL e exportação).
- Responsividade (celular, tablet, desktop) e modo claro/escuro verificados no navegador.

**Depende de configuração externa**

| Item                            | O que fazer                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| Banco de produção               | Criar o projeto no Neon e definir `DATABASE_URL` e `DIRECT_URL`                      |
| Segredo de sessão               | Definir `BETTER_AUTH_SECRET` (a aplicação não inicia em produção sem ele)            |
| URL pública                     | Definir `BETTER_AUTH_URL` e `NEXT_PUBLIC_APP_URL` com o domínio final                |
| Recuperação de senha por e-mail | Criar conta no Resend, verificar o domínio e definir `RESEND_API_KEY` e `EMAIL_FROM` |
| E-mail de suporte               | Definir `NEXT_PUBLIC_SUPPORT_EMAIL`                                                  |
| Cobrança                        | Integração com o Mercado Pago a implementar quando os preços forem confirmados       |
| Textos legais                   | Revisão jurídica da Política de Privacidade e dos Termos de Uso                      |

**Fora do escopo do MVP (próximos passos sugeridos)**: convite de outros usuários para a mesma empresa (o modelo de dados e os papéis já suportam), verificação de e-mail no cadastro, envio automático via API oficial do WhatsApp Business e cobrança recorrente.
