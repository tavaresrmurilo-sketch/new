// Fundo cinematográfico do menu: céu em chamas, o Brasil dividido, holofotes,
// bandeiras fictícias tremulando, colunas de blindados, tropas e aviões.
import Phaser from 'phaser';
import { getMap } from '../sim/map';
import { DISTRIBUTIONS } from '../data/states';
import { FACTIONS } from '../data/factions';
import { createTextures } from '../render/textures';

interface Mover {
  obj: Phaser.GameObjects.Image;
  speed: number;
  bob: number;
}

export class MenuScene extends Phaser.Scene {
  private beams!: Phaser.GameObjects.Graphics;
  private flags!: Phaser.GameObjects.Graphics;
  private movers: Mover[] = [];
  private flashes!: Phaser.GameObjects.Graphics;
  private fire!: Phaser.GameObjects.Particles.ParticleEmitter;
  private nextFlash = 0;
  private flashList: { x: number; y: number; t: number }[] = [];

  constructor() {
    super('menu');
  }

  create(): void {
    createTextures(this);
    this.makeSilhouettes();
    this.movers = [];
    const W = this.scale.width, H = this.scale.height;

    // céu
    const sky = this.add.graphics();
    sky.fillGradientStyle(0x0a0f1c, 0x0a0f1c, 0x5a1a10, 0x3a1630, 1);
    sky.fillRect(0, 0, W, H);
    sky.fillStyle(0xff7a2a, 0.08);
    sky.fillEllipse(W * 0.5, H * 0.82, W * 1.4, H * 0.5);

    // Brasil dividido ao fundo
    const map = getMap();
    const box = Math.min(W * 0.62, H * 0.95);
    const scale = box / Math.max(map.width, map.height);
    const ox = W * 0.52 - (map.width * scale) / 2, oy = H * 0.46 - (map.height * scale) / 2;
    const g = this.add.graphics();
    const lula = new Set<string>(DISTRIBUTIONS.eleitoral.lula), bolso = new Set<string>(DISTRIBUTIONS.eleitoral.bolso);
    for (const s of map.states) {
      const col = lula.has(s.uf) ? FACTIONS.lula.color : bolso.has(s.uf) ? FACTIONS.bolso.color : 0x8a8468;
      g.fillStyle(col, 0.22);
      g.lineStyle(1.2, 0xffe2b0, 0.3);
      for (const r of s.rings) {
        const pts: Phaser.Math.Vector2[] = [];
        for (let i = 0; i < r.length; i += 4) pts.push(new Phaser.Math.Vector2(ox + r[i] * scale, oy + r[i + 1] * scale));
        g.fillPoints(pts, true);
        g.strokePoints(pts, true);
      }
    }
    this.tweens.add({ targets: g, alpha: { from: 0.75, to: 1 }, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.flashes = this.add.graphics();
    this.beams = this.add.graphics();

    // colinas
    const hills = this.add.graphics();
    hills.fillStyle(0x0d0d10, 1);
    hills.beginPath();
    hills.moveTo(0, H);
    for (let x = 0; x <= W + 20; x += 20) hills.lineTo(x, H * 0.8 + Math.sin(x * 0.006) * 22 + Math.sin(x * 0.017) * 9);
    hills.lineTo(W, H);
    hills.closePath();
    hills.fillPath();
    const front = this.add.graphics().setDepth(5);
    front.fillStyle(0x050506, 1);
    front.beginPath();
    front.moveTo(0, H);
    for (let x = 0; x <= W + 20; x += 20) front.lineTo(x, H * 0.9 + Math.sin(x * 0.004 + 1) * 12);
    front.lineTo(W, H);
    front.closePath();
    front.fillPath();

    this.add.particles(0, 0, 'p_smoke', {
      x: { min: 0, max: W }, y: H * 0.84, speedY: { min: -30, max: -12 }, speedX: { min: -6, max: 10 },
      scale: { start: 1.2, end: 4 }, alpha: { start: 0.22, end: 0 }, lifespan: 7000, frequency: 260, tint: 0x6b6258,
    }).setDepth(3);
    this.fire = this.add.particles(0, 0, 'p_fire', {
      speed: { min: 30, max: 110 }, scale: { start: 1.4, end: 0 }, lifespan: 600, blendMode: 'ADD', emitting: false,
    }).setDepth(2);

    // colunas de blindados e tropas (silhuetas)
    for (let i = 0; i < 5; i++) this.spawnMover('sil_tank', -i * 260 - 80, H * 0.8 - 14, 38, 0.9, 4);
    for (let i = 0; i < 14; i++) this.spawnMover('sil_soldier', W + i * 46, H * 0.885, -26, 0.75, 6, true);
    for (let i = 0; i < 2; i++) this.spawnMover('sil_heli', -400 - i * 700, H * 0.32 + i * 40, 70, 0.8, 4);
    this.spawnMover('sil_plane', W + 300, H * 0.18, -260, 0.9, 4, true);

    this.flags = this.add.graphics().setDepth(6);

    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize, this));
  }

  private onResize(): void {
    this.scene.restart();
  }

  private spawnMover(key: string, x: number, y: number, speed: number, scale: number, depth: number, flip = false): void {
    const obj = this.add.image(x, y, key).setScale(scale).setDepth(depth).setFlipX(flip);
    this.movers.push({ obj, speed, bob: Math.random() * 6 });
  }

  private makeSilhouettes(): void {
    const mk = (key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void) => {
      if (this.textures.exists(key)) return;
      const g = this.make.graphics({}, false);
      g.fillStyle(0x050506, 1);
      draw(g);
      g.generateTexture(key, w, h);
      g.destroy();
    };
    mk('sil_tank', 120, 50, (g) => {
      g.fillRoundedRect(6, 30, 108, 16, 8);
      g.fillRect(14, 20, 86, 12);
      g.fillRoundedRect(36, 8, 40, 16, 5);
      g.fillRect(74, 12, 46, 5);
    });
    mk('sil_soldier', 24, 46, (g) => {
      g.fillCircle(12, 6, 5);
      g.fillEllipse(12, 4, 14, 6);
      g.fillRect(8, 11, 9, 16);
      g.fillRect(8, 26, 4, 18);
      g.fillRect(13, 26, 4, 18);
      g.fillRect(14, 13, 10, 3);
      g.fillRect(2, 8, 2, 20);
    });
    mk('sil_heli', 120, 44, (g) => {
      g.fillEllipse(62, 24, 54, 22);
      g.fillRect(8, 20, 50, 6);
      g.fillRect(4, 10, 6, 18);
      g.fillRect(10, 4, 104, 3);
      g.fillRect(58, 4, 4, 10);
      g.fillRect(46, 36, 34, 3);
    });
    mk('sil_plane', 120, 40, (g) => {
      g.fillTriangle(0, 20, 120, 16, 120, 24);
      g.fillTriangle(50, 20, 80, 0, 90, 20);
      g.fillTriangle(50, 20, 80, 40, 90, 20);
      g.fillTriangle(100, 20, 116, 6, 118, 20);
    });
  }

  update(time: number, delta: number): void {
    const W = this.scale.width, H = this.scale.height;
    const dt = delta / 1000;
    for (const m of this.movers) {
      m.obj.x += m.speed * dt;
      m.obj.y += Math.sin(time / 180 + m.bob) * 0.08;
      if (m.speed > 0 && m.obj.x > W + 200) m.obj.x = -200 - Math.random() * 400;
      if (m.speed < 0 && m.obj.x < -200) m.obj.x = W + 200 + Math.random() * 400;
    }
    // holofotes
    const lg = this.beams;
    lg.clear();
    for (const [bx, ph] of [[W * 0.18, 0], [W * 0.82, 1.7], [W * 0.5, 3.1]] as [number, number][]) {
      const a = -Math.PI / 2 + Math.sin(time / 2600 + ph) * 0.55;
      const len = H * 1.1;
      lg.fillStyle(0xfff1c9, 0.06);
      lg.fillTriangle(bx, H * 0.86, bx + Math.cos(a - 0.07) * len, H * 0.86 + Math.sin(a - 0.07) * len, bx + Math.cos(a + 0.07) * len, H * 0.86 + Math.sin(a + 0.07) * len);
    }
    // clarões de explosões distantes
    if (time > this.nextFlash) {
      this.nextFlash = time + 500 + Math.random() * 1600;
      const x = Math.random() * W, y = H * (0.78 + Math.random() * 0.06);
      this.flashList.push({ x, y, t: 1 });
      this.fire.explode(14, x, y);
    }
    this.flashes.clear();
    for (let i = this.flashList.length - 1; i >= 0; i--) {
      const f = this.flashList[i];
      f.t -= dt * 1.6;
      if (f.t <= 0) { this.flashList.splice(i, 1); continue; }
      this.flashes.fillStyle(0xff9a3c, 0.18 * f.t);
      this.flashes.fillCircle(f.x, f.y, 140 * (1.2 - f.t));
    }
    // bandeiras tremulando
    const fg = this.flags;
    fg.clear();
    const fw = Math.min(120, W * 0.08);
    this.drawFlag(fg, W * 0.33, H * 0.73, fw, 'lula', time);
    this.drawFlag(fg, W * 0.985, H * 0.73, fw, 'bolso', time, true);
  }

  private drawFlag(g: Phaser.GameObjects.Graphics, poleX: number, topY: number, w: number, f: 'lula' | 'bolso', time: number, left = false): void {
    const H = this.scale.height;
    const h = w * 0.62;
    g.fillStyle(0x1a1a1a, 1);
    g.fillRect(poleX - 3, topY - 10, 6, H * 0.9 - topY + 10);
    g.fillStyle(0xcfa64a, 1);
    g.fillCircle(poleX, topY - 12, 6);
    const strips = 24;
    const dir = left ? -1 : 1;
    const def = FACTIONS[f];
    for (let i = 0; i < strips; i++) {
      const u0 = i / strips, u1 = (i + 1) / strips;
      const wave = (u: number) => Math.sin(time / 260 - u * 7) * 9 * u;
      const x0 = poleX + dir * u0 * w, x1 = poleX + dir * u1 * w;
      const y0 = topY + wave(u0), y1 = topY + wave(u1);
      const shade = 0.75 + 0.25 * Math.cos(time / 260 - u0 * 7);
      const col = Phaser.Display.Color.IntegerToColor(def.color);
      const c = Phaser.Display.Color.GetColor(col.red * shade, col.green * shade, col.blue * shade);
      g.fillStyle(c, 1);
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.lineTo(x1, y1 + h);
      g.lineTo(x0, y0 + h);
      g.closePath();
      g.fillPath();
    }
    // emblema fictício
    const cx = poleX + dir * w * 0.5, cy = topY + h / 2 + Math.sin(time / 260 - 3.5) * 4.5;
    g.lineStyle(4, 0xffd54a, 1);
    g.strokeCircle(cx, cy, h * 0.28);
    g.fillStyle(0xffd54a, 1);
    if (f === 'lula') {
      g.fillRect(cx - h * 0.1, cy - h * 0.16, h * 0.07, h * 0.3);
      g.fillRect(cx - h * 0.1, cy + h * 0.08, h * 0.2, h * 0.07);
    } else {
      g.fillRect(cx - h * 0.1, cy - h * 0.16, h * 0.07, h * 0.32);
      g.fillCircle(cx + h * 0.02, cy - h * 0.07, h * 0.08);
      g.fillCircle(cx + h * 0.03, cy + h * 0.08, h * 0.09);
    }
  }
}
