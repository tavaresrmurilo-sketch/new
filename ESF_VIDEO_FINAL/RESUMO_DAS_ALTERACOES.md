# ESF — Reedição do vídeo da entrevista (Thais Marques)

**Empreendendo Sem Fronteiras · reedição profissional para Reels, Stories e WhatsApp**

## Entregas

| Arquivo | O que é |
|---|---|
| `ESF_Entrevista_Final.mp4` | **Versão A — entrevista reeditada** · 1:40 · narrativa completa |
| `ESF_Reels_Impacto.mp4` | **Versão B — Reels de destaque** · 0:55 · as falas de maior impacto |
| `legendas/*.srt` | legendas em português (Brasil) de cada versão — para subir como legenda/closed caption |
| `capas/*.jpg` | capas 1080×1920 para escolher como thumbnail do Reels |
| `projeto/` | projeto reprodutível: scripts, EDL (DaVinci/Premiere), fontes, marca, transcrição, trilha |
| `verificacao/` | relatórios de controle de qualidade + conferência visual do desfoque da criança |

Ambas: MP4 · H.264 High 4.1 · 1080×1920 (9:16) · 30 fps constantes · yuv420p BT.709 · AAC 48 kHz estéreo
256 kb/s · *faststart* · −14 LUFS.

---

## 1. Diagnóstico do material original

* **Arquivo recebido:** `VID-20261105-WA0006.mp4` (o pedido citava `1000077465.mp4`; é a mesma entrevista,
  1:55). 464×816, ~30 quadros/s variáveis (passou pelo WhatsApp), AAC de 58 kb/s.
* **Gráficos antigos gravados na imagem** (não dá para "desligar"): título "Entrevista" (0,3–2,9 s), tarjas de
  nome (0,7–3,2 s e 4,1–6,7 s), selo da ESF no canto superior direito **durante toda a entrevista** e a
  cartela final antiga (a partir de 1:46,8). O título antigo dizia "EMPREENDENDO SEM FRONTEIRA" (sem o S) —
  na nova edição o nome aparece correto.
  → Resolvido com a câmera virtual: todo recorte da nova edição deixa esses elementos **fora do quadro**
  (verificado quadro a quadro).
* **8 quadros com falha** ("piscadas" de 1 quadro) em 8,01 · 9,90 · 10,93 · 25,97–26,00 · 39,00 · 40,07 ·
  51,74 s → substituídos pelo quadro anterior.
* **Câmera com deriva lenta** (até ~50 px na horizontal, ~80 px na vertical e ~3 % de zoom ao longo do
  vídeo) → a câmera virtual acompanha a cena (enquadramento estável) e só se vê o movimento planejado.
* **Contraluz forte da janela**, rostos escuros e dominante amarelada.
* **Áudio:** banda até ~12 kHz, ruído já cortado por *gate* (silêncio digital nas pausas). O microfone
  estava com a Manuela: a voz da Thais chegava **3,4 dB mais baixa e 6–7 dB mais abafada** (2–8 kHz).
* **Criança:** o desfoque original do rosto foi conferido em toda a entrevista (3 quadros/s, mais 15
  quadros/s nos momentos de movimento rápido). O rosto aparece desfocado ou virado para a mãe em todos os
  quadros verificados.

## 2. Transcrição e roteiro (sem inventar falas)

* Transcrição automática com Whisper em várias passadas, em **português e em espanhol**, mais amostragem
  de variantes e detecção de fala (VAD). A versão final é o consenso dessas passadas, revisado.
* A Thais fala uma **mistura de espanhol e português**. A legenda traz o conteúdo **em português do Brasil,
  fiel ao que foi dito**. Ex.: *"Estuve en México, estuve trabajando de camarera en un hotel de gringos"* →
  "Estive no México. Trabalhei como camareira num hotel de gringos."
* **Trecho deixado de fora por incerteza:** final da fala da Manuela (1:41,3–1:45,5 do original) —
  *"…pra conseguir cada vez mais ajudar vocês a se [?] no Brasil"*. A palavra depois de "se" não pôde ser
  confirmada; o corte acontece numa pausa natural logo após "pra você e pra todas as pessoas." Para
  incluí-lo, basta confirmar a palavra e acrescentar o trecho em `projeto/plan.py`.
* Também ficaram de fora: o "Sim" da Manuela entre perguntas, um "Bom…" de hesitação e o agradecimento
  duplicado do fim ("É isso, muito obrigada. Muito obrigada por isso…"), que repetia o "Muito obrigada!"
  final. Nenhuma declaração teve o sentido alterado.
* Pausas longas encurtadas; hesitações mantidas quando carregam emoção (na Versão A, a pausa antes de
  "Muitas coisas." permanece).

### Versão A — Entrevista reeditada (1:40)

| Tempo | Conteúdo | Origem |
|---|---|---|
| 0:00–0:05 | **Gancho:** *"Me parece que Brasília é uma cidade espetacular, de muita oportunidade"* — tipografia animada | 1:11,6 |
| 0:05–0:07 | Vinheta ESF (1,3 s): faixa diagonal na paleta + selo com anel de pontos | — |
| 0:05–0:13 | Apresentação: Manuela, Thais, idade (tarjas novas) | 0:00–0:09 |
| 0:13–0:28 | Trabalho no México: camareira, um ano e meio | 0:09–0:25 |
| 0:28–0:58 | Chegada ao Brasil → "ainda não pensei em trabalhar, por causa do bebê. Mas a minha expectativa é ter o meu próprio negócio, seja de bordado, de manicure…" | 0:26–0:59 |
| 0:58–1:21 | Acolhimento → "Brasília é uma cidade espetacular… para nós, os venezuelanos, como para outras pessoas também." | 0:59–1:22 |
| 1:21–1:27 | "O que você espera do Brasil?" — "O que eu espero?… Muitas coisas." | 1:22–1:30 |
| 1:27–1:33 | "E a gente espera contribuir cada vez mais, pra você e pra todas as pessoas." · "Muito obrigada!" | 1:36–1:47 |
| 1:33–1:40 | Encerramento institucional | — |

### Versão B — Reels de impacto (0:55)

| Tempo | Conteúdo |
|---|---|
| 0:00–0:05 | **Gancho:** "O que você **espera** do Brasil?" — "O que eu espero? **Muitas coisas.**" |
| 0:05–0:06 | Vinheta ESF |
| 0:05–0:16 | Passado: "Estive no México. Trabalhei como camareira num hotel de gringos." |
| 0:16–0:34 | Presente e sonho: o bebê, o próprio negócio, bordado e manicure |
| 0:34–0:44 | Esperança: "Brasília é uma cidade espetacular, de muita oportunidade…" |
| 0:44–0:49 | Compromisso da ESF: "E a gente espera contribuir cada vez mais, pra você e pra todas as pessoas." |
| 0:49–0:55 | Encerramento institucional |

## 3. Identidade visual aplicada

* **Paleta oficial** (`esf/src/lib/palette.ts`): roxo profundo `#2E1065`, roxos `#4A1D96` / `#6F2DBD`,
  magenta `#C2185B`, rosa `#E91E63`, laranja `#F97316` / `#FB923C`, noite `#0B0614` / `#170D2B`,
  lavanda `#F5F3FF`. O "vinho" do degradê (`#70103B`) é derivado da paleta (magenta + noite), não é uma cor
  nova.
* **Tipografia oficial do site** (licença OFL): **Manrope** (legendas, tarjas, chamada) e
  **Instrument Serif Itálico** (frase institucional). Poppins/Montserrat não foram usadas porque a Manrope
  já é a fonte da marca e tem o mesmo caráter geométrico e legível.
* **Logo oficial:** `esf/brand/variacoes/esf-logo-v3-premium.png` (a mesma do site), processada pelas
  funções do próprio projeto (`esf/brand/scripts/export_site_assets.py`). Sem redesenho, sem distorção
  (escala sempre proporcional). Na logo completa, o recorte do fundo preto usa um limiar um pouco mais alto
  que o do site, para eliminar o ruído de compressão JPEG em volta do símbolo, visível sobre o roxo.
* **Elemento gráfico do vídeo — o "ponto de bordado":** um pesponto tracejado que se desenha na tela:
  sublinha palavras-chave, forma o anel (bastidor) em volta do selo e da logo e a linha sob a frase final.
  Conecta a mensagem "Cada ponto, um futuro sendo bordado." ao bastidor bordado que aparece na entrevista.
* **Assinatura discreta:** selo da ESF pequeno no canto superior direito durante a entrevista (no lugar do
  selo antigo).

## 4. Legendas

* Português do Brasil, sincronizadas pela fala (cada palavra "acende" no momento em que é dita), no máximo
  2 linhas, quebra de linha profissional (nunca termina linha em artigo/preposição).
* Caixa de vidro fosco na cor da marca; palavras-chave em **laranja** e **rosa/magenta**.
* Posição: terço médio-superior, **sempre acima das cabeças**. Quando a câmera original "sobe", a legenda
  sobe junto para manter folga. Nunca cobre rostos, a criança ou o bastidor (checado quadro a quadro).
* Dentro da zona segura de Reels/Stories (nada essencial acima de 220 px nem abaixo de 1500 px).

## 5. Imagem

* **Sombras/realces locais** (separação iluminação × detalhe com filtro que respeita bordas): as pessoas a
  contraluz clareiam e a janela estourada desce, sem halos e com detalhe de ganho 1,0 (nada é "inventado").
* Balanço de branco moderado (menos amarelo, mantendo o calor do sol), contraste suave, ponto de preto,
  *vibrance* com proteção de tons de pele.
* Redimensionamento Lanczos a partir da resolução original e nitidez leve com limiar (sem exagero).
* **Câmera virtual:** planos conjunto e médios de cada pessoa, *push-ins* lentos (zoom 1,16–1,42×) e
  mudança de enquadramento a cada corte, para que os cortes de pausa não pareçam "pulos".

## 6. Desfoque do rosto da criança (regra obrigatória)

* Nenhuma restauração facial, reconstrução ou ferramenta de IA de imagem foi usada.
* A região da cabeça da criança **não recebe nitidez** (máscara suave que acompanha a cena): ali o quadro é
  apenas redimensionado.
* **Medição** (índice de alta frequência normalizado, que não muda com brilho/contraste), vídeo final ×
  ORIGINAL, na região da cabeça da criança:
  * Versão B: mediana **1,06×**, máximo 1,14× (46 amostras)
  * Versão A: mediana **1,07×**, máximo 1,18× (74 amostras)
  Valores ≈ 1,0 = mesmo grau de desfoque do original. A pequena diferença vem da curva de contraste da
  correção de cor, não de recuperação de detalhe. Conferência visual lado a lado em
  `verificacao/*_conferencia_desfoque_crianca.png`.

## 7. Áudio

* Cadeia de voz por pessoa: passa-alta, redução de ruído leve, corte de embolamento (~280 Hz), presença
  (~3 kHz), de-esser e compressão suave. A Thais recebeu +3,5 dB e mais presença; depois do tratamento as
  duas vozes ficam com equilíbrio espectral equivalente (diferença de 1–2 dB por banda).
* Equilíbrio de volume por trecho, cortes com micro-*fades* (sem cliques), silêncios desnecessários
  removidos.
* **Trilha instrumental original**, composta por código para este projeto (piano suave + pad + baixo, Ré
  maior, 72 bpm). **Não há questão de licença.** Fica cerca de 18–21 dB abaixo da voz enquanto alguém fala
  (*ducking* automático) e cresce no encerramento, com o acorde final caindo na entrada da logo.
* Efeitos sutis: um *whoosh* na vinheta e na transição para o encerramento e um brilho suave na logo.
* Masterização: **−14 LUFS** integrados, pico real ≤ −1,9 dBTP, faixa de loudness 2,5–2,7 LU (boa
  inteligibilidade no celular).

## 8. Encerramento institucional

Cortina no degradê roxo profundo → vinho → magenta, com pontos de luz suaves → logo oficial entra com
escala suave enquanto o anel de pontos (bastidor) se desenha → **"Cada ponto, um futuro sendo bordado."** →
linha de pontos → **"Venha fazer parte dessa história com a gente."** → botão com o endereço
**esf-site-gray.vercel.app** (exibido sem o "https://", como é usual em peças visuais). Duração: 7 s (A) e
6 s (B).

## 9. Controle de qualidade (resultado)

| Verificação | Versão A | Versão B |
|---|---|---|
| Formato H.264/AAC, 1080×1920, 30 fps CFR, BT.709, faststart | ok | ok |
| Duração vídeo = áudio (sincronia) | 100,20 s = 100,20 s | 55,10 s = 55,10 s |
| Quadros pretos inesperados | nenhum | nenhum |
| Falhas de 1 quadro | nenhuma | nenhuma |
| Gráficos antigos visíveis | nenhum quadro | nenhum quadro |
| Texto sobre rosto | nenhum (folga mín. 16,7 px além da margem da cabeça) | nenhum (folga mín. 16,8 px além da margem da cabeça) |
| Loudness / pico real | −14,0 LUFS / −2,0 dBTP | −14,0 LUFS / −1,9 dBTP |
| Desfoque da criança (final ÷ original) | 1,07× (máx. 1,18×) | 1,06× (máx. 1,14×) |
| Tamanho / taxa | 67,1 MB / 5,4 Mb/s | 36,2 MB / 5,2 Mb/s |

A sincronia é garantida por construção: áudio e imagem de cada trecho saem do mesmo ponto do EDL.

## 10. Pendências e recomendações

1. **Confirmar grafias:** "Thais Marques" (usei a mesma da tarja original) e "Manuela Cruvinel".
2. **Trecho incerto** da fala final da Manuela (ver item 2), caso queiram incluí-lo.
3. **Logo vetorial:** não há SVG da marca no repositório, só PNG/JPG (original de 624 px). Para peças
   grandes, vale pedir o vetor à ESF. No vídeo, a resolução disponível é suficiente.
4. A frase da cartela antiga *"Obrigada a todas as voluntárias e a quem bordou com a gente!"* não entrou no
   novo encerramento, que segue a sequência pedida. Pode ser acrescentada em `projeto/graphics.py`.
5. A transcrição foi feita com o modelo Whisper *small* (o disponível no ambiente) e revisada por
   consenso. Uma escuta humana rápida das legendas antes de publicar é recomendada.
6. Instagram e WhatsApp recomprimem o vídeo no envio; os arquivos foram entregues com folga de qualidade.
