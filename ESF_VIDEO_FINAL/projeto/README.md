# Projeto de edição — vídeo ESF (entrevista com Thais Marques)

Edição 100% reprodutível em Python + FFmpeg (ferramentas gratuitas). O "projeto editável" é texto:
**cortes, enquadramentos e legendas ficam em `plan.py`**; o resto são etapas automáticas.

## Como editar

| Quero mudar… | Arquivo |
|---|---|
| cortes, ordem dos trechos, zoom de cada plano, gancho, tarjas | `plan.py` (`VERSION_A`, `VERSION_B`) |
| texto/tempo das legendas e palavras em destaque | `plan.py` (`CAPTIONS`: `*laranja*`, `_rosa_`) |
| enquadramentos (zoom, posição do rosto na tela) | `camera.py` (`SHOTS`) |
| correção de cor | `grade.py` (`Grade`) |
| visual de legendas, tarjas, vinheta, encerramento | `graphics.py` |
| altura das legendas (folga acima das cabeças) | `placement.py` |
| regras de quebra de linha | `textbreak.py` |
| tratamento de voz, nível da trilha, efeitos | `audio.py` |
| trilha (acordes, andamento) | `music.py` |

As legendas são escritas no **tempo do vídeo original**; cada versão as herda pelos cortes. Se um corte
mudar, a legenda acompanha sozinha.

Para abrir os cortes num editor (DaVinci Resolve, Premiere): `edl/*.edl` (CMX 3600, apontando para o
arquivo original) + `../legendas/*.srt`.

## Como reproduzir (Linux/macOS, Python 3.11+, FFmpeg 6+)

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
ORIG=/caminho/1000077465.mp4          # vídeo original
# 0) fontes estáticas a partir das fontes oficiais do site (já incluídas em fonts/)
python fonts_from_site.py ../../esf fonts
# 1) origem: decodifica, corrige glitches, aplica a correção de cor, mede o movimento da câmera
python prepare_source.py $ORIG build
python faces.py $ORIG build                       # posições dos rostos (ou: cp recursos/faces_ref.json build/)
# 2) marca a partir dos arquivos oficiais do repositório (esf/brand)
python brand_assets.py ../../esf build/brand
# 3) áudio de cada versão
python audio.py A build && python audio.py B build
# 4) vídeo
python render.py A build ESF_Entrevista_Final.mp4
python render.py B build ESF_Reels_Impacto.mp4
# 5) legendas SRT + EDL, capas e controle de qualidade
python export.py saida 1000077465.mp4
python capas.py build capas
python verify.py A build ESF_Entrevista_Final.mp4 verificacao $ORIG
python verify.py B build ESF_Reels_Impacto.mp4 verificacao $ORIG
```

Tempo aproximado (4 núcleos): preparação ~4 min; cada versão 3–5 min.
Pré-visualizar quadros sem renderizar tudo: `python render.py A build pasta --stills 5.5 20 95`.

## Transcrição

`transcricao/` guarda as passadas do Whisper (modelo *small*, CTranslate2 int8) em português e espanhol,
a amostragem de variantes e as regiões de fala (VAD Silero). Atenção: `whisper_pt_passada1.json` usou
um texto de contexto que mencionava "bordado" e por isso **não** foi usado sozinho; a legenda final (em
`plan.py`) é o consenso das passadas sem contexto. Scripts: `transcribe.py`, `transcribe_multi.py`,
`sample_variants.py` (exigem o pacote `faster-whisper` e um modelo Whisper em formato CTranslate2).

## Licenças

* Fontes Manrope e Instrument Serif: SIL OFL 1.1 (as mesmas do site; ver `fonts/LICENSE-fonts.txt`).
* Trilha: composição original gerada por `music.py` para este projeto, sem restrição de uso
  (`trilha/` traz as versões sem *ducking*).
* Logo: arquivos oficiais do repositório (`esf/brand`), sem redesenho.
