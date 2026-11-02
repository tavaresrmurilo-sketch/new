/**
 * Cores da abertura 3D — todas derivadas da paleta oficial (src/lib/palette.ts).
 *
 * As luzes da cena somam cor sobre o fundo escuro (mistura aditiva). Por isso as linhas e os
 * pontos usam versões "acesas" das cores da marca: o mesmo matiz, com mais luminosidade.
 * Para mudar a iluminação da abertura, ajuste aqui — shaders e renderizador só leem estes valores.
 */
import { mixRgb, rgb, type RGB } from "@/lib/palette";

const scale = (c: RGB, k: number): RGB => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];

const purple = rgb("purple");
const purpleDark = rgb("purpleDark");
const purpleDeep = rgb("purpleDeep");
const magenta = rgb("magenta");
const rose = rgb("rose");
const orangeSoft = rgb("orangeSoft");
const night = rgb("night");
const night2 = rgb("night2");
const lavender = rgb("lavender");

/** Versões luminosas (luz emitida) das cores da marca. */
const violetLight = mixRgb(scale(purple, 1.55), lavender, 0.22);
const roseLight = mixRgb(rose, lavender, 0.18);
const orangeLight = mixRgb(orangeSoft, lavender, 0.1);
/** branco quente (núcleo das luzes): lavanda com um toque de laranja */
const warmWhite = mixRgb(lavender, orangeSoft, 0.22);
/** halo do portal: magenta, contido para não saturar (a soma com o céu violeta já é intensa) */
const portalHalo = scale(mixRgb(magenta, rose, 0.5), 0.72);

export const sceneColors = {
  /* espaço / céu */
  space: night,
  spaceHigh: night2,
  /** horizonte ao amanhecer: magenta aquecido por laranja (roxo → rosa → laranja, de cima para baixo) */
  horizon: scale(mixRgb(magenta, orangeSoft, 0.3), 0.8),
  /** céu violeta logo acima do horizonte */
  dusk: scale(purpleDark, 0.55),
  /** luz que vem da passagem: halo largo e núcleo quente */
  portalHalo,
  portalCore: warmWhite,

  /* planeta */
  oceanDark: scale(mixRgb(night, purpleDeep, 0.4), 0.72),
  oceanLit: scale(purpleDeep, 0.9),
  /** borda (fresnel) do planeta */
  rim: mixRgb(purple, lavender, 0.25),
  /** atmosfera ao redor do planeta: detalhe magenta */
  halo: mixRgb(purple, magenta, 0.55),
  /** paralelos, meridianos e grade do chão */
  grid: mixRgb(lavender, purple, 0.3),

  /* mapa / chão */
  mapBase: mixRgb(night, purpleDeep, 0.25),
  floorBase: scale(night, 0.9),

  /* pontos de terra */
  dotCool: mixRgb(lavender, purple, 0.18),
  dotDawn: mixRgb(lavender, rose, 0.25),
  dotLit: mixRgb(orangeSoft, lavender, 0.2),
  /** Brasil em destaque (magenta) no planeta e no mapa */
  dotHome: roseLight,

  /* linhas */
  border: violetLight,
  borderHot: roseLight,
  /** conexões: gradiente roxo → rosa → laranja do início ao fim de cada trajeto */
  linkStart: violetLight,
  linkMid: roseLight,
  linkEnd: orangeLight,
  linkHead: warmWhite,
  frame: mixRgb(roseLight, warmWhite, 0.25),
  frameHot: warmWhite,

  /* caminho de luz e passagem */
  pathGlow: roseLight,
  pathCore: warmWhite,
  doorEdge: mixRgb(rose, lavender, 0.35),
  doorCore: warmWhite,
  doorPanel: scale(purpleDeep, 0.3),
  rays: mixRgb(mixRgb(rose, lavender, 0.35), warmWhite, 0.5),

  /* travessia para a luz do dia */
  dayBloom: mixRgb(lavender, orangeSoft, 0.12),
  day: lavender,

  /* camada 2D: partículas, rede, poeira */
  violetLight,
  roseLight,
  orangeLight,
  sparkWhite: mixRgb(lavender, warmWhite, 0.5),
  /** "tinta" da rede quando o fundo fica claro */
  ink: purpleDeep,
  dust: mixRgb(lavender, purple, 0.15),
} satisfies Record<string, RGB>;

/** `vec3(...)` GLSL para uma cor da cena. */
export function v3(c: RGB): string {
  return `vec3(${c[0].toFixed(4)}, ${c[1].toFixed(4)}, ${c[2].toFixed(4)})`;
}
