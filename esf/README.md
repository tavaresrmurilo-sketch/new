# ESF — Empreendendo Sem Fronteiras · site institucional

Site institucional da ESF, projeto que apoia a integração de refugiados e imigrantes no Brasil por meio do
empreendedorismo, da educação, do voluntariado, da conscientização e da colaboração.

O destaque é a **abertura "Uma jornada sem fronteiras"**, uma história em cinco cenas controlada exclusivamente
pela rolagem (mouse, trackpad, barra de rolagem ou toque):

1. **O mundo** — um planeta pontilhado gira enquanto a câmera se aproxima da superfície.
2. **As fronteiras** — o planeta se desdobra em um mapa; as fronteiras surgem como linhas luminosas e se
   dissolvem trecho a trecho, enquanto conexões atravessam o mapa.
3. **O recomeço** — a câmera acompanha um caminho de luz que parte de Brasília; o mapa se reorganiza em um campo
   de luz e, no horizonte, uma passagem se abre e deixa a luz atravessar.
4. **A transformação** — da passagem surgem educação, empreendedorismo, inclusão e colaboração, e uma rede de
   conexões é construída ligação por ligação.
5. **A ESF** — a câmera atravessa a luz, a rede converge na marca da ESF e surgem título, subtítulo e o botão
   "Conheça nossa missão".

Quando a rolagem para, a cena para; ao voltar, tudo acontece ao contrário — o mesmo progresso sempre gera o mesmo
quadro.

> Este app vive na pasta `esf/` de um repositório que também contém outro projeto. Ele é **totalmente
> independente** (dependências, configuração e build próprios).

---

## Stack

| Camada | Escolha | Por quê |
|---|---|---|
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript | Página 100% estática (SSG), metadata e imagens otimizadas |
| Estilo | Tailwind CSS 4 + CSS de componentes (`src/app/globals.css`) | Tokens da identidade em `@theme`; componentes em `@layer components` |
| Scroll | GSAP 3 + ScrollTrigger (carregados sob demanda) | Scrub suave, reversível, uma única timeline para toda a abertura |
| Cena 3D | **WebGL puro** (código próprio, carregado sob demanda) | Ver "Decisões técnicas" |
| Fontes | Manrope (variável) + Instrument Serif, auto-hospedadas | Sem requisições a terceiros; licença OFL (`src/app/fonts/LICENSE-fonts.txt`) |

### Decisões técnicas

- **WebGL próprio em vez de Three.js/React Three Fiber.** A cena usa uma câmera em perspectiva (matrizes próprias
  em `globe/math.ts`) e 11 shaders pequenos: céu/planeta/chão traçados por raio, pontos que passam de planeta a
  mapa e a campo de luz, linhas (fronteiras e conexões), o caminho, a passagem, raios de luz e a camada 2D da rede.
  Isso evita ~150 kB de JavaScript de uma biblioteca 3D e mantém a página leve no celular.
- **Sem Framer Motion.** As microinterações usam CSS (transições/`@keyframes`) e GSAP, que já está na página.
  Uma segunda biblioteca de animação só aumentaria o bundle.
- **Sticky em vez de `pin`.** A cena fica presa com `position: sticky` (seção de 560vh no desktop, 480vh no
  celular). Não há espaçadores injetados nem saltos ao redimensionar; o scroll é sempre nativo
  (mouse, touchpad e toque), sem "scroll-jacking".
- **Tudo é função do progresso — nada depende do tempo.** `src/components/intro/globe/scene.ts` define as janelas
  (`T`), a trajetória da câmera e os parâmetros visuais. O mesmo progresso (suavizado pelo scrub do GSAP) alimenta
  o WebGL e a timeline dos textos; um quadro só é desenhado quando o progresso muda.

---

## Estrutura

```
esf/
├─ scripts/build-globe-data.mjs     # gera a máscara terra/Brasil a partir do Natural Earth (world-atlas)
├─ src/
│  ├─ app/                          # layout, página, metadata, OG image, ícones, robots, sitemap, 404/erro
│  ├─ assets/                       # imagens otimizadas pelo next/image
│  ├─ content/site.ts               # ★ todo o texto e todos os links do site
│  ├─ components/
│  │  ├─ intro/Intro.tsx            # abertura: marcação, timeline GSAP, indicador de progresso
│  │  ├─ intro/globe/               # WebGL: dados, shaders, coreografia (scene.ts) e renderizador
│  │  ├─ sections/                  # Quem somos, Propósito, Iniciativas, História, Material, Faça parte, Contato
│  │  ├─ layout/                    # cabeçalho (com menu mobile) e rodapé
│  │  ├─ brand/Logo.tsx             # marca da ESF (SVG)
│  │  └─ icons/Art.tsx              # ilustrações de traço próprias (sem emojis/bibliotecas)
│  └─ lib/shapes.ts                 # geometria compartilhada: ícones SVG = destinos das partículas
```

**Para editar textos ou links, altere apenas `src/content/site.ts`.**

---

## Rodando localmente

Requisitos: Node.js 20.9+ (testado com 22).

```bash
cd esf
npm install
npm run dev          # http://localhost:3000
```

| Script | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` / `npm start` | build de produção e servidor |
| `npm run lint` | ESLint (config oficial do Next.js) |
| `npm run typecheck` | tipos de rotas + `tsc --noEmit` |
| `npm run check` | lint + typecheck + build |
| `npm run globe:data` | regenera `land-mask.ts` (só se mudar a resolução/fonte do mapa) |

---

## Deploy na Vercel

1. Importe o repositório na Vercel.
2. Em **Settings → General → Root Directory**, selecione `esf`.
3. Framework: Next.js (detectado). Build: `npm run build` (padrão).
4. Variáveis de ambiente (opcionais — veja `.env.example`):
   - `NEXT_PUBLIC_SITE_URL` — domínio final (ex.: `https://www.esf.org.br`). Sem ela, a Vercel usa o domínio de
     produção do projeto automaticamente em metadata, Open Graph, `robots.txt` e `sitemap.xml`.
   - `NEXT_PUBLIC_DONATION_URL` — link de doação. Sem a variável, usa o link atualmente divulgado; **vazia**, oculta
     o botão de pagamento e direciona para o e-mail.

`next.config.ts` fixa `turbopack.root` nesta pasta, porque o repositório contém outro `package-lock.json` na raiz.

---

## ✅ Checklist antes da publicação

- [ ] **Link de doação:** confirmar com a ESF a titularidade do recebimento do link Nubank em
      `src/content/site.ts` (ou definir `NEXT_PUBLIC_DONATION_URL`). O site **não** afirma que o recebedor foi
      validado e orienta o visitante a conferir os dados antes de pagar.
- [ ] **Marca:** a marca (círculo aberto + meridiano + ponto laranja) foi desenhada para este site, pois o site
      atual não tem um logotipo em arquivo. Se a ESF tiver um logotipo oficial, substitua
      `src/components/brand/Logo.tsx` e `src/app/icon.svg` (e ajuste `LOGO_*` em `src/lib/shapes.ts`, que define o
      desenho formado pelas partículas na abertura).
- [ ] **Imagem do mural** (`src/assets/mural-refugees-welcome.jpg`): veio do site atual da ESF; a autoria/licença
      não está indicada lá. Confirme os direitos de uso ou substitua por fotos da própria ESF.
- [ ] **Redes sociais:** não foram incluídas porque os links do site atual apontam para `#`. Quando houver perfis
      oficiais, adicione-os em `links` (`src/content/site.ts`) e no rodapé.
- [ ] Definir `NEXT_PUBLIC_SITE_URL` com o domínio final.

### Conteúdo do site atual que não foi reaproveitado (de propósito)

- **"Do Recomeço ao Sucesso"** (histórias de David Smolansky, Carlos Slim e "Maria Fernanda Rojas"): são pessoas
  sem vínculo declarado com a ESF e uma história não verificável; o briefing pede para não apresentar histórias
  como fatos sem confirmação.
- **Foto com colete do ACNUR/UNHCR** (`pic10.jpg`): a marca de outra organização sugeriria uma parceria não
  confirmada.
- **Telefone `(000) 000-0000`** e ícones de redes sociais com links vazios.

Nenhum número, data, depoimento ou parceria foi inventado. A seção "Nossa história" é narrada em capítulos, sem datas.

---

## Abertura: como ajustar

- **Duração:** altura da seção em `globals.css` (`[data-motion="full"] .intro { height: 560vh }` e `480vh` no
  celular).
- **Ritmo das cenas:** janelas em `T` (`scene.ts`) — valores de 0 a 1 do progresso.
- **Câmera:** `cameraAt` em `scene.ts` — órbita sobre o planeta (`ORBIT_LANDSCAPE`/`ORBIT_PORTRAIT`), acompanhamento
  do caminho (`follow`), aproximação da passagem e travessia da luz.
- **Caminho e passagem:** `heroPath`, `DOOR_Z`, `DOOR_W`, `DOOR_H` em `scene.ts`.
- **Elementos da cena 4 e rede:** desenhos em `src/lib/shapes.ts`; posições e rede em `computeLayout` (`scene.ts`).
- **Conexões do mapa:** sorteadas entre pontos de terra; não representam rotas reais (`buildLinks` em `globe/data.ts`).
- **Dados do mapa:** `npm run globe:data` regenera `land-mask.ts` e `borders.ts` (Natural Earth 1:50m).

### Desempenho e acessibilidade

- O globo carrega depois da primeira pintura, em etapas curtas (compilação de shaders em paralelo quando suportado).
- Nenhuma animação roda sozinha: sem rolagem, nenhum quadro é desenhado (custo zero em repouso).
- Em navegadores **sem aceleração de GPU** (WebGL emulado em software), um globo em CSS ocupa o lugar e o WebGL
  assume em modo econômico quando o visitante começa a rolar.
- `prefers-reduced-motion`: composição estática (globo parado + frases em sequência), sem scroll longo.
- Sem JavaScript: o mesmo layout estático, com todo o conteúdo visível.
- Link "Pular introdução", indicador de cenas navegável por teclado, menu mobile com foco preso e `Esc`.
- Seções fora da tela usam `content-visibility: auto`.

Medições locais (Lighthouse 13, build de produção):

| Perfil | Desempenho | Acessibilidade | Boas práticas | SEO |
|---|---|---|---|---|
| Mobile (simulado) | 95–99 | 100 | 100 | 100 |
| Desktop | 100 | 100 | 100 | 100 |

CLS = 0 em ambos. Os valores variam conforme a máquina; meça novamente após mudanças relevantes.

---

## Créditos

- Dados do mapa: [Natural Earth](https://www.naturalearthdata.com/) (domínio público) via `world-atlas`.
- Fontes: Manrope e Instrument Serif (SIL Open Font License 1.1).
