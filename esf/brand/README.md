# Marca da ESF

Arquivos da logo oficial da ESF — Empreendendo Sem Fronteiras.

```
brand/
├─ original/esf-logo-original.jpg      logo enviada pela ESF (referência, 624 × 624)
├─ variacoes/                          recolor com a nova paleta roxa/quente (fundo preto, 1248 × 1248)
│  ├─ esf-logo-v1-institucional.png    equilibrada e institucional
│  ├─ esf-logo-v2-roxo-intenso.png     roxo mais forte e marcante
│  ├─ esf-logo-v3-premium.png          premium, sofisticada  ← versão usada no site
│  └─ comparativo.png                  original + as três variações lado a lado
└─ scripts/
   ├─ recolor_logo.py                  gera as variações
   └─ export_site_assets.py            gera os arquivos usados pelo site a partir de uma variação
```

## O que mudou (e o que não mudou)

Só as **cores**. Símbolo, texto, composição, tipografia e fundo preto são os do original, pixel a pixel.

O recolor é feito no espaço perceptual **OKLCH**: cada pixel mantém sua luminosidade relativa (gradientes,
profundidade e o antisserrilhado contra o preto são preservados), enquanto matiz e saturação são trocadas
por família de cor:

| No original | Nas variações |
|---|---|
| Ameixa apagado (figuras laterais, "EMPREENDENDO") | Roxo — `#2E1065` · `#4A1D96` · `#6F2DBD` |
| Carmim (globo, figura central, arco) | Magenta / rosa — `#C2185B` · `#D81B60` · `#E91E63` |
| Laranja avermelhado (arcos do globo) | Laranja quente — `#F97316` · `#FB923C` |

Os textos ganharam luminosidade própria: no original, "EMPREENDENDO" era quase da cor do fundo; agora fica
legível no preto (roxo claro na v1/v2, lavanda `#F5F3FF` na v3) e "SEM FRONTEIRAS" ganha rosa (v1), magenta
(v2) ou laranja suave (v3).

## Arquivos usados pelo site (gerados)

| Arquivo | Uso |
|---|---|
| `src/assets/brand/esf-selo.png` | **selo**: símbolo sobre o disco preto da marca — cabeçalho, abertura, capa do material, 404, imagem de compartilhamento. Funciona em fundo claro e escuro |
| `src/assets/brand/esf-logo.png` | logo completa com fundo transparente — rodapé (fundo escuro) |
| `src/assets/brand/esf-simbolo.png` | símbolo com fundo transparente (base das partículas da abertura) |
| `src/app/icon.png`, `src/app/favicon.ico` | ícone do navegador |
| `src/app/apple-icon.png`, `public/icons/icon-192.png`, `icon-512.png` | ícones iOS e do app (manifest) |
| `src/components/intro/globe/logo-points.ts` | pontos e cores do símbolo: na abertura, as partículas formam a logo real |

## Regenerar

Requisitos: Python 3.10+, Pillow e NumPy. A partir da pasta `esf/`:

```bash
python3 brand/scripts/recolor_logo.py                    # recria as três variações
python3 brand/scripts/export_site_assets.py v3-premium   # recria os arquivos do site (ou v1-institucional / v2-roxo-intenso)
```

Para trocar a variação usada no site, basta rodar o segundo comando com outra variação — os componentes
leem os arquivos gerados, sem outras mudanças de código.

> Observação: o original tem 624 × 624 px. As variações foram ampliadas para 1248 px para uso em materiais;
> para impressão em grande formato, o ideal é obter da ESF o arquivo vetorial da logo e aplicar a mesma paleta.
