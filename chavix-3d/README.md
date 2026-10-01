# CHAVIX 3D

**Sua ideia. Sua chave. Seu estilo.**

Loja virtual da CHAVIX 3D: chaveiros impressos em 3D, modelos prontos e personalizados, pagamento por **Pix direto** (QR Code BR Code gerado pela própria loja, sem intermediador) e **confirmação manual** pelo painel.

---

## 1. Arquitetura

```
chavix-3d/
├─ prisma/
│  ├─ schema.prisma          # modelos (dinheiro sempre em centavos, Int)
│  ├─ migrations/            # migration inicial
│  ├─ seed.ts                # admin (via .env), configurações, categorias, cupons inativos, demo
│  ├─ seed-data.ts           # produtos de demonstração (modelos originais)
│  └─ seed-art.ts            # arte dos produtos demo gerada em SVG → WebP (camadas FDM)
├─ scripts/
│  ├─ create-admin.ts        # cria/redefine administrador
│  └─ generate-brand.ts      # gera logo SVG, ícones e favicon
├─ public/brand/             # logo (SVG), símbolo e ícone 512 px
├─ src/
│  ├─ app/
│  │  ├─ (store)/            # loja: home, catálogo, produto, personalizar, carrinho, checkout,
│  │  │                      # pedido, pagamento Pix, acompanhar, páginas institucionais
│  │  ├─ admin/(auth)/login  # login do painel
│  │  ├─ admin/(panel)/      # dashboard, pedidos, produtos, categorias, clientes, cupons,
│  │  │                      # avaliações, analytics, configurações
│  │  ├─ admin/actions/      # Server Actions do painel (todas exigem requireAdmin())
│  │  ├─ actions/            # Server Actions da loja (carrinho, checkout, pedido)
│  │  ├─ api/                # carrinho, busca, CEP, uploads
│  │  ├─ files/[id]/         # entrega de imagens guardadas no banco (referências são privadas)
│  │  ├─ sitemap.ts, robots.ts, opengraph-image.tsx, icon.svg
│  ├─ components/            # ui/, store/, home/, admin/, brand/
│  ├─ lib/
│  │  ├─ pix/                # BR Code + CRC16, QR Code, leitura segura do .env
│  │  ├─ orders/             # criação do pedido (transação), máquina de status, acesso do cliente
│  │  ├─ cart/               # carrinho no banco + recálculo de preços
│  │  ├─ shipping/           # frete modular (retirada, local, nacional) + interface para transportadoras
│  │  ├─ auth/, security/    # sessão, senha (bcrypt), rate limit (Postgres), assinatura HMAC, CSRF
│  │  ├─ storage/            # upload validado por magic bytes, re-encode WebP (sharp), banco ou Vercel Blob
│  │  ├─ pricing.ts, coupons.ts, custom-builder.ts, order-code.ts, order-status.ts, analytics.ts
│  └─ proxy.ts               # checagem otimista de /admin (Next 16: antigo middleware)
└─ tests/
   ├─ unit/                  # Pix/CRC, QR decodificado, preços, cupons, frete, status, código do pedido
   ├─ integration/           # pedido de ponta a ponta em PostgreSQL real
   └─ e2e/                   # Playwright: compra, Pix, "Já fiz o pagamento", admin, mobile
```

**Stack:** Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS 4 · Prisma 7 (driver adapter `pg`) · PostgreSQL · Zod 4 · Radix UI · sharp · qrcode · Vitest · Playwright.

### Decisões importantes

- **O servidor recalcula tudo.** O carrinho guarda só IDs e escolhas; preço, adicionais, desconto, frete e total são sempre recalculados com os valores do banco, dentro de uma transação, no momento do pedido (`src/lib/orders/service.ts`).
- **Dinheiro em centavos (`Int`)**, nunca float. Percentuais arredondam para baixo.
- **Pix direto:** payload BR Code montado em `src/lib/pix/brcode.ts` (campos 00, 26, 52, 53, 54, 58, 59, 60, 62-05 e CRC16-CCITT). O `txid` é o código do pedido sem hífen (`CHX-A82F91` → `CHXA82F91`). O Pix Copia e Cola gerado fica gravado no pedido.
- **Sem confirmação automática.** O cliente só consegue mudar `PENDING_PAYMENT → PAYMENT_REVIEW`. Somente o admin marca `PAID`, e isso grava data, hora, administrador e histórico.
- **Código do pedido não sequencial:** `CHX-` + 6 caracteres aleatórios (`crypto.randomInt`, alfabeto sem 0/O/1/I).
- **Privacidade do pedido:** a página do pedido só mostra os dados a quem criou o pedido naquele navegador (cookie assinado) ou a quem confirma e-mail/telefone em `/acompanhar`. Endereço aparece resumido (bairro/cidade).
- **Imagens:** por padrão ficam no próprio PostgreSQL (funciona em qualquer lugar, sem configurar nada). Para escala, use `STORAGE_DRIVER=vercel-blob`. Referências enviadas por clientes ficam sempre no banco e só o dono do carrinho e o admin conseguem vê-las.

---

## 2. Funcionalidades

**Loja**
- Home: abertura com peça real do catálogo e cotas técnicas, lançamentos, categorias, mais vendidos, personalizados, como funciona, benefícios, avaliações (só reais e aprovadas), FAQ e CTA final.
- Catálogo com busca instantânea (atalho `/` ou Ctrl+K), filtros (categoria, preço, cor, disponibilidade, lançamentos, mais vendidos) e ordenação (relevância, menor/maior preço, mais vendidos, recentes).
- Página do produto: galeria com zoom (hover no desktop, tela cheia com ampliação no celular), cores, personalizações, quantidade, subtotal, adicionar ao carrinho, comprar agora, ficha técnica, prazo, relacionados, JSON-LD.
- `/personalizar`: formato → cor → texto → imagem de referência (opcional) → observações → quantidade → estimativa na hora → carrinho. Prévia ilustrativa ao vivo. Aviso de análise antes da produção.
- Carrinho persistente (cookie + banco), cupom, cálculo de frete por CEP, resumo com subtotal/frete/desconto/total.
- Checkout curto e mobile first, CEP automático (ViaCEP com fallback BrasilAPI), retirada sem endereço.
- Pagamento: QR Code Pix válido, valor exato, número do pedido, status, “Copiar código Pix”, “Copiar Pix Copia e Cola”, botão “Já fiz o pagamento”.
- Acompanhamento com linha do tempo; avaliação liberada após a entrega (moderada no painel).
- WhatsApp: “Falar com a CHAVIX”, “Tenho uma dúvida” (com o produto na mensagem), “Quero um personalizado”. Os botões só aparecem depois que o número é cadastrado no painel.
- SEO: metadata e títulos por página, OpenGraph (imagem gerada), sitemap, robots, URLs amigáveis, JSON-LD (loja, produto, FAQ).
- Navegação inferior no celular (Início, Buscar, Criar, Carrinho, Pedido).

**Painel `/admin`**
- Visão geral: faturamento confirmado, ticket médio, pedidos em análise/aguardando/pagos/em produção, conversão do checkout, gráfico de faturamento, mais vendidos, fila de Pix para conferir.
- Pedidos: busca (código, nome, e-mail, telefone), filtro por status e período, detalhe completo, ações (Confirmar pagamento, Pagamento não identificado, Iniciar produção, Marcar como pronto/enviado/entregue, Cancelar com motivo), rastreio, notas internas e histórico.
- Produtos: criar, editar, desativar/excluir, preço e promoção, estoque (inclusive direto na lista), fotos (upload múltiplo, ordem, texto alternativo), cores com adicional, personalizações (texto ou lista, com valor), destaques.
- Categorias ilimitadas, clientes (nome, pedidos, total comprado, último pedido), cupons (percentual/fixo, validade, limite, mínimo, primeira compra), avaliações, analytics (7/30/90 dias, 12 meses) e configurações (loja, WhatsApp, frete, tabela do personalizado, status do Pix, troca de senha).

---

## 3. Variáveis de ambiente

Copie `.env.example` para `.env`:

| Variável | Obrigatória | Para quê |
|---|---|---|
| `DATABASE_URL` | sim | PostgreSQL (em produção, a URL com pooling) |
| `DIRECT_URL` | não | URL direta sem pooler, usada só pelas migrations |
| `NEXT_PUBLIC_SITE_URL` | sim em produção | domínio público (SEO, sitemap, links) |
| `AUTH_SECRET` | sim | segredo aleatório ≥ 32 caracteres (assina cookies) |
| `PIX_KEY` | sim | chave Pix que recebe os pagamentos |
| `PIX_RECEIVER_NAME` | sim | nome do recebedor no QR (até 25 caracteres) |
| `PIX_CITY` | sim | cidade do recebedor no QR (até 15 caracteres) |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | para o seed | administrador inicial |
| `STORAGE_DRIVER` | não | `database` (padrão) ou `vercel-blob` |
| `BLOB_READ_WRITE_TOKEN` | com vercel-blob | criado ao conectar um Blob Store na Vercel |
| `SEED_DEMO_PRODUCTS` | não | `false` para não criar produtos de demonstração |
| `TEST_DATABASE_URL` | não | banco separado para os testes de integração |

Gerar `AUTH_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

No `.env` local:

```env
PIX_KEY=sua-chave-pix
PIX_RECEIVER_NAME="SEU NOME OU MARCA"
PIX_CITY="SUA CIDADE"
```

> O `.env` está no `.gitignore` e **nunca** vai para o GitHub. A chave Pix não fica no código nem no banco: é lida só de `process.env.PIX_KEY`. `PIX_RECEIVER_NAME` e `PIX_CITY` devem ser os dados reais do titular da chave — alguns bancos mostram esses campos na tela de confirmação do Pix.

---

## 4. Instalação

Requisitos: Node.js 20.19+ (recomendado 22) e PostgreSQL 14+.

```bash
cd chavix-3d
npm install
cp .env.example .env   # e preencha
```

## 5. Banco de dados

```bash
npm run db:deploy      # aplica as migrations (prisma migrate deploy)
npm run db:seed        # admin, configurações, categorias, cupons (inativos) e produtos demo
```

Outros comandos:

```bash
npm run db:migrate     # desenvolvimento: cria nova migration depois de alterar o schema
npm run db:studio      # abre o Prisma Studio
npm run admin:create -- --email voce@exemplo.com --name "Seu Nome" --password "SenhaForte123"
```

## 6. Desenvolvimento

```bash
npm run dev            # http://localhost:3000 · painel em /admin
```

## 7. Build

```bash
npm run build
npm start
```

Qualidade:

```bash
npm run typecheck
npm run lint
npm test               # unitários + integração (integração precisa de TEST_DATABASE_URL)
npm run test:e2e       # Playwright (sobe o `npm run dev` se nada estiver rodando)
```

---

## 8. Publicar na Vercel

O script `vercel-build` (`scripts/vercel-build.mjs`) confere as variáveis, aplica as migrations, roda o seed e compila. Na **primeira** publicação em um banco vazio ele cria o admin, as configurações, as categorias, os cupons (inativos) e os produtos de demonstração. Nos deploys seguintes só cria o admin se ele ainda não existir: o que você mudar ou apagar pelo painel não volta.

1. **Importar:** vercel.com → *Add New → Project* → escolha o repositório → **Root Directory = `chavix-3d`** → em *Environment Variables* cadastre:
   - `AUTH_SECRET` — texto aleatório com 32+ caracteres
   - `PIX_KEY`, `PIX_RECEIVER_NAME`, `PIX_CITY`
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD` (10+ caracteres, letras e números), `ADMIN_NAME`
   - `SEED_DEMO_PRODUCTS=false` se não quiser os produtos de demonstração
2. **Deploy.** O primeiro deploy vai parar com a mensagem “Banco de dados não conectado” — é esperado, o banco vem a seguir.
3. **Banco:** no projeto, aba *Storage* → *Create Database* → **Neon** (Postgres, plano gratuito) → conecte ao projeto. Isso cria `DATABASE_URL` sozinho.
4. **Branch de produção:** se o código não estiver na `main`, vá em *Settings → Git → Production Branch* e informe a branch onde ele está.
5. *Deployments* → **⋯ → Redeploy**. Pronto: a loja abre no endereço `*.vercel.app` e o painel em `/admin/login`.
6. **Opcional:** *Settings → Domains* para usar seu domínio (depois defina `NEXT_PUBLIC_SITE_URL=https://seudominio.com.br` e faça Redeploy). Para muitas fotos, crie um Blob Store em *Storage* e defina `STORAGE_DRIVER=vercel-blob`.

Também funciona com a integração Supabase da Vercel (`POSTGRES_URL` / `POSTGRES_URL_NON_POOLING` são reconhecidas).

---

## 9. Administrador inicial

O admin é criado pelo seed (inclusive no deploy da Vercel) a partir de `ADMIN_EMAIL`, `ADMIN_PASSWORD` e `ADMIN_NAME` (senha mínima de 10 caracteres com letras e números; nenhuma senha está no código). Acesse `/admin/login`.

- Troque a senha em **Configurações → Sua senha** depois do primeiro acesso.
- 5 senhas erradas seguidas bloqueiam o acesso por 15 minutos; há limite por IP e por e-mail.
- Esqueceu a senha? `npm run admin:create -- --email ... --password ...` redefine e encerra as sessões.

Primeiros passos no painel: **Configurações** (WhatsApp, e-mail, Instagram, frete, cidades de entrega local, tabela do personalizado) → **Produtos** (cadastre os seus e desative/exclua os de demonstração) → **Cupons** (ative se quiser).

---

## 10. Checklist do que foi testado

- [x] `npm install` / `npm ci` em cópia limpa, sem `.env` (gera o Prisma Client no postinstall)
- [x] Prisma: migration aplicada, seed executado e reexecutado (idempotente)
- [x] `npm run typecheck` sem erros
- [x] `npm run lint` sem erros nem avisos
- [x] `npm test`: 50 testes (43 unitários + 7 de integração em PostgreSQL real)
- [x] `npm run build` sem erros (inclusive sem `DATABASE_URL`)
- [x] Pix: CRC16 bate com o valor de referência do algoritmo (`29B1`) e com o exemplo do manual do BR Code do Banco Central (`1D3D`); o QR Code gerado é decodificado de volta para o payload exato; valor, txid, nome e cidade conferidos campo a campo; payload adulterado é detectado
- [x] Cálculo de valores: promoção, cor com adicional, personalização paga, cupom percentual, frete e frete grátis; preço alterado depois de ir para o carrinho usa o valor atual do banco
- [x] Checkout (desktop e celular): pedido criado, estoque reservado, cupom contabilizado, carrinho esvaziado; estoque insuficiente bloqueia
- [x] “Já fiz o pagamento” → `PAYMENT_REVIEW`; cliente não consegue marcar `PAID`
- [x] Admin: redirecionamento sem login, senha errada rejeitada, login, confirmação de pagamento com nome/data/hora no histórico, avanço de status sem pular etapas, cancelamento devolvendo estoque e uso do cupom
- [x] Acesso ao pedido exige cookie de quem comprou ou e-mail/telefone corretos
- [x] Segurança: headers (CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy), upload sem origem/origem externa bloqueado (403), arquivo falso e imagem corrompida rejeitados, referência privada inacessível sem o cookie do dono, upload do admin sem sessão (401)
- [x] Mobile: fluxo de compra no perfil Pixel 7, sem rolagem horizontal nas páginas principais; E2E também contra o build de produção (`next start`)

### Antes de abrir as vendas

- Cadastre `PIX_RECEIVER_NAME` e `PIX_CITY` reais e faça **um Pix de teste de valor baixo** para você mesmo, escaneando o QR com o app do seu banco.
- Revise os textos legais (termos, privacidade, trocas) com um profissional; eles foram escritos como ponto de partida.
- Substitua os produtos de demonstração pelas fotos e descrições reais (as descrições demo citam materiais e acabamentos como exemplo).
