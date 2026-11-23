// Texturas geradas proceduralmente (nenhum arquivo de imagem externo).
// Todas as unidades são desenhadas vistas de cima, apontando para a direita (ângulo 0).
import Phaser from 'phaser';
import { FACTIONS, NEUTRAL_COLOR, NEUTRAL_DARK } from '../data/factions';
import type { Owner, UnitType } from '../sim/types';

export const UNIT_TEX_SIZE = 48;

export function unitKey(type: UnitType, f: Owner): string {
  return `u_${type}_${f}`;
}

function shade(color: number, k: number): number {
  const c = Phaser.Display.Color.IntegerToColor(color);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))));
  return Phaser.Display.Color.GetColor(f(c.red), f(c.green), f(c.blue));
}

function colorsOf(f: Owner) {
  if (f === 'neutral') return { main: NEUTRAL_COLOR, dark: NEUTRAL_DARK, light: shade(NEUTRAL_COLOR, 0.35) };
  const d = FACTIONS[f];
  return { main: d.color, dark: d.dark, light: d.light };
}

function drawUnit(g: Phaser.GameObjects.Graphics, type: UnitType, f: Owner): void {
  const { main, dark, light } = colorsOf(f);
  const S = UNIT_TEX_SIZE, c = S / 2;
  const outline = 0x0b0d0c;
  g.lineStyle(2, outline, 1);
  switch (type) {
    case 'infantry':
    case 'militia': {
      // pelotão: três soldados com capacete e fuzil
      const pos = [[c + 6, c], [c - 6, c - 8], [c - 6, c + 8]];
      for (const [x, y] of pos) {
        g.lineStyle(3, 0x2b2b25, 1);
        g.lineBetween(x, y, x + 11, y + 1);
        g.fillStyle(type === 'militia' ? 0x6d6a55 : dark, 1);
        g.fillEllipse(x - 1, y, 13, 11);
        g.lineStyle(2, outline, 1);
        g.strokeEllipse(x - 1, y, 13, 11);
        g.fillStyle(type === 'militia' ? light : main, 1);
        g.fillCircle(x, y, 4.6);
        g.lineStyle(1.5, outline, 1);
        g.strokeCircle(x, y, 4.6);
      }
      break;
    }
    case 'tank': {
      g.fillStyle(0x23241f, 1);
      g.fillRoundedRect(c - 17, c - 15, 34, 7, 2);
      g.fillRoundedRect(c - 17, c + 8, 34, 7, 2);
      g.fillStyle(0x5a5b52, 1);
      for (let i = 0; i < 6; i++) { g.fillRect(c - 15 + i * 6, c - 14, 2, 5); g.fillRect(c - 15 + i * 6, c + 9, 2, 5); }
      g.fillStyle(main, 1);
      g.fillRoundedRect(c - 15, c - 10, 30, 20, 4);
      g.strokeRoundedRect(c - 15, c - 10, 30, 20, 4);
      g.fillStyle(dark, 1);
      g.fillRect(c + 2, c - 2, 21, 4);
      g.strokeRect(c + 2, c - 2, 21, 4);
      g.fillStyle(light, 1);
      g.fillCircle(c - 1, c, 7.5);
      g.strokeCircle(c - 1, c, 7.5);
      g.fillStyle(dark, 1);
      g.fillCircle(c - 3, c - 2, 2.2);
      break;
    }
    case 'artillery': {
      g.fillStyle(0x23241f, 1);
      g.fillCircle(c - 6, c - 11, 5);
      g.fillCircle(c - 6, c + 11, 5);
      g.fillStyle(main, 1);
      g.fillTriangle(c - 18, c - 6, c - 18, c + 6, c - 2, c);
      g.strokeTriangle(c - 18, c - 6, c - 18, c + 6, c - 2, c);
      g.fillStyle(dark, 1);
      g.fillRect(c - 6, c - 3, 28, 6);
      g.strokeRect(c - 6, c - 3, 28, 6);
      g.fillStyle(light, 1);
      g.fillRoundedRect(c - 9, c - 8, 12, 16, 3);
      g.strokeRoundedRect(c - 9, c - 8, 12, 16, 3);
      break;
    }
    case 'heli': {
      g.fillStyle(dark, 1);
      g.fillRect(c - 20, c - 2, 18, 4);
      g.fillRect(c - 22, c - 7, 4, 14);
      g.fillStyle(main, 1);
      g.fillEllipse(c + 3, c, 24, 15);
      g.strokeEllipse(c + 3, c, 24, 15);
      g.fillStyle(0x9fd8ff, 0.9);
      g.fillEllipse(c + 10, c, 9, 9);
      g.fillStyle(dark, 1);
      g.fillRect(c - 2, c - 11, 6, 3);
      g.fillRect(c - 2, c + 8, 6, 3);
      break;
    }
    case 'plane': {
      g.fillStyle(main, 1);
      g.beginPath();
      g.moveTo(c + 22, c);
      g.lineTo(c + 2, c - 5);
      g.lineTo(c - 6, c - 20);
      g.lineTo(c - 11, c - 20);
      g.lineTo(c - 8, c - 5);
      g.lineTo(c - 19, c - 4);
      g.lineTo(c - 22, c - 11);
      g.lineTo(c - 24, c - 11);
      g.lineTo(c - 22, c);
      g.lineTo(c - 24, c + 11);
      g.lineTo(c - 22, c + 11);
      g.lineTo(c - 19, c + 4);
      g.lineTo(c - 8, c + 5);
      g.lineTo(c - 11, c + 20);
      g.lineTo(c - 6, c + 20);
      g.lineTo(c + 2, c + 5);
      g.closePath();
      g.fillPath();
      g.strokePath();
      g.fillStyle(0x9fd8ff, 0.95);
      g.fillEllipse(c + 9, c, 9, 4);
      g.fillStyle(dark, 1);
      g.fillRect(c - 8, c - 1, 14, 2);
      break;
    }
    case 'support': {
      g.fillStyle(0x23241f, 1);
      g.fillCircle(c - 10, c - 10, 3.5); g.fillCircle(c + 8, c - 10, 3.5);
      g.fillCircle(c - 10, c + 10, 3.5); g.fillCircle(c + 8, c + 10, 3.5);
      g.fillStyle(dark, 1);
      g.fillRoundedRect(c + 6, c - 9, 11, 18, 3);
      g.strokeRoundedRect(c + 6, c - 9, 11, 18, 3);
      g.fillStyle(0xe8e4d4, 1);
      g.fillRoundedRect(c - 17, c - 10, 22, 20, 2);
      g.strokeRoundedRect(c - 17, c - 10, 22, 20, 2);
      g.fillStyle(main, 1);
      g.fillRect(c - 9, c - 7, 6, 14);
      g.fillRect(c - 13, c - 3, 14, 6);
      break;
    }
  }
}

function makeTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

function softCircle(scene: Phaser.Scene, key: string, r: number, color: number): void {
  if (scene.textures.exists(key)) return;
  const canvas = scene.textures.createCanvas(key, r * 2, r * 2);
  if (!canvas) return;
  const ctx = canvas.getContext();
  const grd = ctx.createRadialGradient(r, r, 0, r, r, r);
  const col = Phaser.Display.Color.IntegerToColor(color);
  grd.addColorStop(0, `rgba(${col.red},${col.green},${col.blue},1)`);
  grd.addColorStop(0.45, `rgba(${col.red},${col.green},${col.blue},0.55)`);
  grd.addColorStop(1, `rgba(${col.red},${col.green},${col.blue},0)`);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, r * 2, r * 2);
  canvas.refresh();
}

export function createTextures(scene: Phaser.Scene): void {
  const types: UnitType[] = ['infantry', 'tank', 'artillery', 'heli', 'plane', 'support', 'militia'];
  for (const f of ['lula', 'bolso', 'neutral'] as Owner[]) {
    for (const t of types) {
      if (t === 'militia' && f !== 'neutral') continue;
      makeTexture(scene, unitKey(t, f), UNIT_TEX_SIZE, UNIT_TEX_SIZE, (g) => drawUnit(g, t, f));
    }
  }
  // rotor do helicóptero
  makeTexture(scene, 'rotor', 48, 48, (g) => {
    g.lineStyle(3, 0x15171a, 0.85);
    g.lineBetween(4, 24, 44, 24);
    g.lineBetween(24, 4, 24, 44);
    g.fillStyle(0x15171a, 1);
    g.fillCircle(24, 24, 3);
  });
  // sombra
  makeTexture(scene, 'shadow', 32, 32, (g) => {
    g.fillStyle(0x000000, 0.35);
    g.fillEllipse(16, 16, 28, 18);
  });
  // ícones de construções (16x16)
  const icon = (key: string, draw: (g: Phaser.GameObjects.Graphics) => void) =>
    makeTexture(scene, key, 32, 32, (g) => {
      g.fillStyle(0x101412, 0.9);
      g.fillRoundedRect(1, 1, 30, 30, 6);
      g.lineStyle(2, 0xd8d2b0, 1);
      g.strokeRoundedRect(1, 1, 30, 30, 6);
      draw(g);
    });
  icon('b_barracks', (g) => {
    g.fillStyle(0xd8d2b0, 1);
    g.fillTriangle(6, 15, 16, 7, 26, 15);
    g.fillRect(8, 15, 16, 10);
    g.fillStyle(0x101412, 1);
    g.fillRect(14, 19, 4, 6);
  });
  icon('b_factory', (g) => {
    g.fillStyle(0xd8d2b0, 1);
    g.fillRect(6, 16, 20, 10);
    g.fillTriangle(6, 16, 12, 11, 12, 16);
    g.fillTriangle(12, 16, 18, 11, 18, 16);
    g.fillRect(20, 6, 4, 10);
  });
  icon('b_airbase', (g) => {
    g.fillStyle(0xd8d2b0, 1);
    g.fillTriangle(16, 5, 13, 16, 19, 16);
    g.fillTriangle(5, 18, 16, 13, 27, 18);
    g.fillRect(14, 15, 4, 11);
    g.fillTriangle(10, 27, 16, 23, 22, 27);
  });
  icon('b_depot', (g) => {
    g.fillStyle(0xd8d2b0, 1);
    g.fillRect(7, 10, 18, 15);
    g.lineStyle(2, 0x101412, 1);
    g.lineBetween(7, 10, 25, 25);
    g.lineBetween(25, 10, 7, 25);
  });
  icon('b_fort', (g) => {
    g.fillStyle(0xd8d2b0, 1);
    g.fillRect(6, 13, 20, 13);
    for (let i = 0; i < 4; i++) g.fillRect(6 + i * 6, 8, 3, 6);
  });
  icon('b_build', (g) => {
    g.lineStyle(3, 0xffc94d, 1);
    g.lineBetween(9, 23, 21, 11);
    g.fillStyle(0xffc94d, 1);
    g.fillRect(18, 7, 8, 6);
  });
  // espadas cruzadas (combate)
  makeTexture(scene, 'battle', 32, 32, (g) => {
    g.lineStyle(4, 0x111111, 1);
    g.lineBetween(6, 6, 26, 26);
    g.lineBetween(26, 6, 6, 26);
    g.lineStyle(2.5, 0xffd54a, 1);
    g.lineBetween(6, 6, 26, 26);
    g.lineBetween(26, 6, 6, 26);
    g.fillStyle(0xffd54a, 1);
    g.fillRect(4, 20, 8, 3);
    g.fillRect(20, 20, 8, 3);
  });
  // bandeirola de ponto de encontro
  makeTexture(scene, 'rally', 24, 28, (g) => {
    g.lineStyle(2, 0xffffff, 1);
    g.lineBetween(4, 2, 4, 26);
    g.fillStyle(0x44ff88, 1);
    g.fillTriangle(5, 3, 21, 8, 5, 13);
  });
  // destroços
  makeTexture(scene, 'wreck', 24, 24, (g) => {
    g.fillStyle(0x1a1a18, 0.85);
    g.fillEllipse(12, 12, 20, 14);
    g.fillStyle(0x3a2a1a, 0.9);
    g.fillEllipse(10, 11, 9, 6);
  });
  softCircle(scene, 'p_fire', 16, 0xffa63d);
  softCircle(scene, 'p_spark', 6, 0xfff1b8);
  softCircle(scene, 'p_smoke', 20, 0x9a968c);
  softCircle(scene, 'p_dust', 12, 0xc8b88a);
  softCircle(scene, 'p_glow', 32, 0xffffff);
}
