// Cena principal: renderiza o mapa real do Brasil, as unidades e os efeitos,
// e traduz mouse/teclado/toque em comandos para a simulação.
import Phaser from 'phaser';
import { FACTIONS, NEUTRAL_COLOR, enemyOf } from '../data/factions';
import { UNIT_DEFS } from '../data/units';
import { ABILITIES } from '../data/factions';
import type { Game } from '../sim/game';
import type { AbilityId, BuildingType, Faction, Owner, SimEvent, Unit } from '../sim/types';
import { createTextures, unitKey, UNIT_TEX_SIZE } from '../render/textures';
import { audio, type Sfx } from '../audio/audio';

export interface SceneHooks {
  onEvent(e: SimEvent): void;
  onSelection(): void;
  onModeChange(): void;
  toast(msg: string, kind?: 'info' | 'warn' | 'error'): void;
  autosave(): void;
  openPause(): void;
  settings(): { edgeScroll: boolean; showAllHp: boolean; particles: boolean };
}

export type CommandMode = { kind: 'none' } | { kind: 'attackMove' } | { kind: 'ability'; id: AbilityId } | { kind: 'rally' } | { kind: 'box' };

interface UnitView {
  body: Phaser.GameObjects.Image;
  rotor?: Phaser.GameObjects.Image;
  shadow?: Phaser.GameObjects.Image;
  type: string;
}

interface Tracer {
  x1: number; y1: number; x2: number; y2: number; life: number; max: number; color: number; width: number;
}

interface Pulse {
  x: number; y: number; r: number; max: number; life: number; total: number; color: number;
}

const BUILD_ICONS: BuildingType[] = ['barracks', 'factory', 'airbase', 'depot', 'fort'];

function ownerColor(o: Owner): number {
  return o === 'neutral' ? NEUTRAL_COLOR : FACTIONS[o].color;
}

export class GameScene extends Phaser.Scene {
  sim!: Game;
  hooks!: SceneHooks;
  me: Faction = 'lula';
  sel = new Set<number>();
  selState = -1;
  hoverState = -1;
  mode: CommandMode = { kind: 'none' };
  speed = 1;
  userPaused = false;
  touchBox = false;
  groups: Record<number, number[]> = {};

  private fills: Phaser.GameObjects.Polygon[][] = [];
  private frontG!: Phaser.GameObjects.Graphics;
  private overlay!: Phaser.GameObjects.Graphics;
  private fxG!: Phaser.GameObjects.Graphics;
  private boxG!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private capLabels: Phaser.GameObjects.Text[] = [];
  private bIcons: Phaser.GameObjects.Image[][] = [];
  private battleIcons: Phaser.GameObjects.Image[] = [];
  private rallyIcon!: Phaser.GameObjects.Image;
  private units = new Map<number, UnitView>();
  private tracers: Tracer[] = [];
  private pulses: Pulse[] = [];
  private wrecks: { img: Phaser.GameObjects.Image; t: number }[] = [];
  private fire!: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private ownersKey = '';
  private nextIconSync = 0;
  private nextAutosave = 60;
  private lastClick = { t: 0, id: -1 };
  private drag: { button: number; sx: number; sy: number; moved: boolean; camX: number; camY: number } | null = null;
  private pinch: { d: number; zoom: number } | null = null;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  constructor() {
    super('game');
  }

  init(data: { sim: Game; hooks: SceneHooks; me: Faction }): void {
    this.sim = data.sim;
    this.hooks = data.hooks;
    this.me = data.me;
    this.sel.clear();
    this.selState = -1;
    this.mode = { kind: 'none' };
    this.units = new Map();
    this.tracers = [];
    this.pulses = [];
    this.wrecks = [];
    this.fills = [];
    this.labels = [];
    this.capLabels = [];
    this.bIcons = [];
    this.battleIcons = [];
    this.ownersKey = '';
    this.groups = {};
    this.userPaused = false;
    this.nextAutosave = this.sim.w.time + 60;
  }

  create(): void {
    createTextures(this);
    const map = this.sim.map;
    const cam = this.cameras.main;
    cam.setBackgroundColor('#0b1822');
    cam.setBounds(-600, -500, map.width + 1200, map.height + 1000);

    // grade tática de fundo
    const bg = this.add.graphics().setDepth(0);
    bg.lineStyle(1, 0x15303f, 0.6);
    for (let x = -600; x < map.width + 600; x += 120) bg.lineBetween(x, -500, x, map.height + 500);
    for (let y = -500; y < map.height + 500; y += 120) bg.lineBetween(-600, y, map.width + 600, y);

    // países vizinhos
    const nb = this.add.graphics().setDepth(1);
    nb.fillStyle(0x1c211d, 1);
    nb.lineStyle(2, 0x2b3329, 1);
    for (const n of map.neighbors) {
      const pts = [];
      for (let i = 0; i < n.ring.length; i += 2) pts.push(new Phaser.Math.Vector2(n.ring[i], n.ring[i + 1]));
      nb.fillPoints(pts, true);
      nb.strokePoints(pts, true);
    }

    // estados (polígonos reais)
    const order = map.states.map((s) => s.i).sort((a, b) => map.states[b].area - map.states[a].area);
    for (const si of order) {
      const s = map.states[si];
      this.fills[si] = s.rings.map((r) =>
        this.add.polygon(0, 0, r, ownerColor(this.sim.w.states[si].owner), 0.55).setOrigin(0, 0).setDepth(2),
      );
    }
    const borders = this.add.graphics().setDepth(3);
    borders.lineStyle(2, 0x0d1210, 0.75);
    for (const b of map.borders) for (const l of b.lines) this.strokeLine(borders, l);
    borders.lineStyle(3.5, 0xe9e1c2, 0.55);
    for (const l of map.outline) this.strokeLine(borders, l);

    this.frontG = this.add.graphics().setDepth(4);

    // rótulos
    for (const s of map.states) {
      const t = this.add.text(s.label.x, s.label.y, s.uf, {
        fontFamily: 'Oswald, Impact, sans-serif', fontSize: '22px', color: '#f5efd6', stroke: '#0b0d0c', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(5).setAlpha(0.85).setResolution(2);
      this.labels[s.i] = t;
      const c = s.capital;
      const cl = this.add.text(c.x, c.y + 15, s.info.capital, {
        fontFamily: 'Inter, Arial, sans-serif', fontSize: '11px', color: '#e8e2c8', stroke: '#0b0d0c', strokeThickness: 3,
      }).setOrigin(0.5, 0).setDepth(5).setResolution(2);
      this.capLabels[s.i] = cl;
      this.bIcons[s.i] = BUILD_ICONS.map((b) => this.add.image(c.x, c.y, 'b_' + b).setDepth(5).setVisible(false));
      this.battleIcons[s.i] = this.add.image(c.x, c.y - 30, 'battle').setDepth(9).setVisible(false);
    }
    this.rallyIcon = this.add.image(0, 0, 'rally').setOrigin(0.15, 1).setDepth(7).setVisible(false);

    this.overlay = this.add.graphics().setDepth(7);
    this.fxG = this.add.graphics().setDepth(8);
    this.boxG = this.add.graphics().setDepth(20);

    // partículas
    this.fire = this.add.particles(0, 0, 'p_fire', {
      speed: { min: 20, max: 90 }, scale: { start: 0.9, end: 0 }, lifespan: { min: 250, max: 550 },
      blendMode: 'ADD', emitting: false,
    }).setDepth(10);
    this.smoke = this.add.particles(0, 0, 'p_smoke', {
      speed: { min: 5, max: 25 }, scale: { start: 0.6, end: 1.8 }, alpha: { start: 0.45, end: 0 },
      lifespan: { min: 1200, max: 2600 }, gravityY: -12, emitting: false,
    }).setDepth(9);
    this.sparks = this.add.particles(0, 0, 'p_spark', {
      speed: { min: 30, max: 120 }, scale: { start: 0.8, end: 0 }, lifespan: 220, blendMode: 'ADD', emitting: false,
    }).setDepth(10);
    this.dust = this.add.particles(0, 0, 'p_dust', {
      speed: { min: 8, max: 30 }, scale: { start: 0.5, end: 1.2 }, alpha: { start: 0.5, end: 0 }, lifespan: 700, emitting: false,
    }).setDepth(6);

    // câmera inicial na sede do jogador
    const hq = this.sim.capital(this.sim.w.factions[this.me].hq);
    cam.setZoom(0.62);
    cam.centerOn(hq.x, hq.y);

    this.setupInput();
    this.redrawOwners(true);
  }

  private strokeLine(g: Phaser.GameObjects.Graphics, l: number[]): void {
    g.beginPath();
    g.moveTo(l[0], l[1]);
    for (let i = 2; i < l.length; i += 2) g.lineTo(l[i], l[i + 1]);
    g.strokePath();
  }

  // ================================================================== API usada pela interface
  get controllable(): boolean {
    return this.sim.canCommand(this.me);
  }

  setMode(m: CommandMode): void {
    this.mode = m;
    this.input.setDefaultCursor(m.kind === 'none' ? 'default' : 'crosshair');
    this.hooks.onModeChange();
  }

  selectedUnits(): Unit[] {
    const out: Unit[] = [];
    for (const id of this.sel) {
      const u = this.sim.unit(id);
      if (u) out.push(u);
    }
    return out;
  }

  setSelection(ids: number[], add = false): void {
    if (!add) this.sel.clear();
    for (const id of ids) this.sel.add(id);
    if (ids.length) this.selState = -1;
    this.hooks.onSelection();
  }

  clearSelection(): void {
    this.sel.clear();
    this.selState = -1;
    this.hooks.onSelection();
  }

  selectState(i: number): void {
    this.selState = i;
    this.sel.clear();
    this.hooks.onSelection();
  }

  selectAllOnScreen(): void {
    const v = this.cameras.main.worldView;
    const ids = this.sim.unitsOf(this.me).filter((u) => v.contains(u.x, u.y) && u.type !== 'militia').map((u) => u.id);
    this.setSelection(ids);
    if (ids.length) audio.play('select');
  }

  centerOn(x: number, y: number): void {
    this.cameras.main.centerOn(x, y);
  }

  zoomBy(f: number): void {
    const cam = this.cameras.main;
    cam.setZoom(Phaser.Math.Clamp(cam.zoom * f, this.minZoom(), 2.6));
  }

  minZoom(): number {
    const cam = this.cameras.main;
    return Math.min(cam.width / (this.sim.map.width + 300), cam.height / (this.sim.map.height + 300));
  }

  issueStop(hold = false): void {
    if (!this.controllable) return;
    this.sim.commandStop(this.me, [...this.sel], hold);
    audio.play('order');
  }

  issueRTB(): void {
    if (!this.controllable) return;
    this.sim.commandRTB(this.me, [...this.sel]);
    audio.play('order');
  }

  useAbility(id: AbilityId): void {
    if (!this.controllable) { this.hooks.toast('Aguarde sua vez de dar ordens.', 'warn'); return; }
    const def = ABILITIES[id];
    const err = this.sim.abilityCheck(this.me, id, this.selState >= 0 ? this.selState : undefined);
    if (err) { this.hooks.toast(err, 'error'); audio.play('error'); return; }
    if (def.targeted) {
      this.setMode({ kind: 'ability', id });
      this.hooks.toast(`${def.name}: clique no mapa para escolher o alvo (botão direito cancela).`);
      return;
    }
    const e = this.sim.useAbility(this.me, id, { s: this.selState >= 0 ? this.selState : undefined });
    if (e) { this.hooks.toast(e, 'error'); audio.play('error'); }
  }

  // ================================================================== entrada
  private setupInput(): void {
    this.input.mouse?.disableContextMenu();
    this.input.addPointer(1);
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT,CTRL') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown', (ev: KeyboardEvent) => this.onKey(ev));

    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      const cam = this.cameras.main;
      const before = cam.getWorldPoint(p.x, p.y);
      const z = Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.88 : 1.14), this.minZoom(), 2.6);
      cam.setZoom(z);
      cam.preRender();
      const after = cam.getWorldPoint(p.x, p.y);
      cam.scrollX += before.x - after.x;
      cam.scrollY += before.y - after.y;
    });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      audio.unlock();
      const touches = this.input.manager.pointers.filter((pp) => pp.isDown && pp.wasTouch);
      if (touches.length >= 2) {
        const [a, b] = touches;
        this.pinch = { d: Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y), zoom: this.cameras.main.zoom };
        this.drag = null;
        this.boxG.clear();
        return;
      }
      const button = p.wasTouch ? 0 : p.button;
      this.drag = { button, sx: p.x, sy: p.y, moved: false, camX: this.cameras.main.scrollX, camY: this.cameras.main.scrollY };
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const cam = this.cameras.main;
      const wp = cam.getWorldPoint(p.x, p.y);
      this.hoverState = this.sim.map.stateAtPrecise(wp.x, wp.y);
      if (this.pinch) {
        const touches = this.input.manager.pointers.filter((pp) => pp.isDown && pp.wasTouch);
        if (touches.length >= 2) {
          const [a, b] = touches;
          const d = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
          cam.setZoom(Phaser.Math.Clamp(this.pinch.zoom * (d / this.pinch.d), this.minZoom(), 2.6));
        }
        return;
      }
      const d = this.drag;
      if (!d || !p.isDown) return;
      if (Math.hypot(p.x - d.sx, p.y - d.sy) > 7) d.moved = true;
      if (!d.moved) return;
      const panning = d.button === 1 || d.button === 2 || (p.wasTouch && !this.touchBox);
      if (panning) {
        cam.scrollX = d.camX - (p.x - d.sx) / cam.zoom;
        cam.scrollY = d.camY - (p.y - d.sy) / cam.zoom;
      } else if (d.button === 0) {
        this.boxG.clear();
        const a = cam.getWorldPoint(d.sx, d.sy);
        this.boxG.lineStyle(1.5 / cam.zoom, 0x7dffb0, 1);
        this.boxG.fillStyle(0x7dffb0, 0.12);
        this.boxG.fillRect(Math.min(a.x, wp.x), Math.min(a.y, wp.y), Math.abs(wp.x - a.x), Math.abs(wp.y - a.y));
        this.boxG.strokeRect(Math.min(a.x, wp.x), Math.min(a.y, wp.y), Math.abs(wp.x - a.x), Math.abs(wp.y - a.y));
      }
    });

    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.pinch) {
        if (!this.input.manager.pointers.some((pp) => pp.isDown && pp.wasTouch)) this.pinch = null;
        return;
      }
      const d = this.drag;
      this.drag = null;
      this.boxG.clear();
      if (!d) return;
      const cam = this.cameras.main;
      const wp = cam.getWorldPoint(p.x, p.y);
      const panned = d.moved && (d.button === 1 || d.button === 2 || (p.wasTouch && !this.touchBox));
      if (panned) return;
      if (d.button === 0 && d.moved) {
        const a = cam.getWorldPoint(d.sx, d.sy);
        this.boxSelect(Math.min(a.x, wp.x), Math.min(a.y, wp.y), Math.max(a.x, wp.x), Math.max(a.y, wp.y), this.keys.SHIFT.isDown);
        return;
      }
      if (d.button === 2) { this.rightClick(wp.x, wp.y); return; }
      if (d.button === 0) this.leftClick(wp.x, wp.y, p.wasTouch);
    });
  }

  private onKey(ev: KeyboardEvent): void {
    const k = ev.key.toLowerCase();
    if ((ev.target as HTMLElement)?.tagName === 'INPUT') return;
    if (k === ' ') { this.userPaused = !this.userPaused; this.hooks.onModeChange(); ev.preventDefault(); return; }
    if (k === 'escape') {
      if (this.mode.kind !== 'none') this.setMode({ kind: 'none' });
      else if (this.sel.size || this.selState >= 0) this.clearSelection();
      else this.hooks.openPause();
      return;
    }
    if (/^[1-9]$/.test(k)) {
      const n = +k;
      if (ev.ctrlKey || ev.metaKey) {
        this.groups[n] = [...this.sel];
        this.hooks.toast(`Grupo ${n} definido (${this.sel.size} unidades).`);
        ev.preventDefault();
      } else if (this.groups[n]?.length) {
        const ids = this.groups[n].filter((id) => this.sim.unit(id));
        const again = this.sel.size === ids.length && ids.every((id) => this.sel.has(id));
        this.setSelection(ids);
        if (again) this.focusSelection();
      }
      return;
    }
    if (ev.ctrlKey || ev.metaKey) return;
    if (k === 'q') { this.setMode({ kind: 'attackMove' }); return; }
    if (k === 'x') { this.issueStop(); return; }
    if (k === 'h') { this.issueStop(true); return; }
    if (k === 'f') { this.focusSelection(); return; }
    if (k === 'g') { const hq = this.sim.capital(this.sim.w.factions[this.me].hq); this.centerOn(hq.x, hq.y); return; }
    if (k === 'r') { this.issueRTB(); return; }
    if (k === 'e') { this.selectAllOnScreen(); return; }
    if (k === '+' || k === '=') { this.speed = Math.min(3, this.speed + (this.speed < 1 ? 0.5 : 1)); this.hooks.onModeChange(); return; }
    if (k === '-') { this.speed = Math.max(0.5, this.speed - (this.speed <= 1 ? 0.5 : 1)); this.hooks.onModeChange(); return; }
    if (k === 'z') { this.useAbility(FACTIONS[this.me].abilities[0]); return; }
    if (k === 'c') { this.useAbility(FACTIONS[this.me].abilities[1]); return; }
    if (k === 'v') { this.useAbility(FACTIONS[this.me].abilities[2]); return; }
  }

  focusSelection(): void {
    const us = this.selectedUnits();
    if (us.length) {
      const x = us.reduce((s, u) => s + u.x, 0) / us.length, y = us.reduce((s, u) => s + u.y, 0) / us.length;
      this.centerOn(x, y);
    } else if (this.selState >= 0) {
      const c = this.sim.capital(this.selState);
      this.centerOn(c.x, c.y);
    }
  }

  private pickUnit(x: number, y: number, pred: (u: Unit) => boolean): Unit | null {
    const r = Math.max(12, 14 / this.cameras.main.zoom);
    let best: Unit | null = null, bd = r;
    for (const u of this.sim.w.units) {
      if (u.hp <= 0 || !pred(u)) continue;
      const d = Math.hypot(u.x - x, u.y - y);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  }

  private pickCapital(x: number, y: number): number {
    const r = Math.max(18, 20 / this.cameras.main.zoom);
    for (const s of this.sim.map.states) if (Math.hypot(s.capital.x - x, s.capital.y - y) < r) return s.i;
    return -1;
  }

  private boxSelect(x0: number, y0: number, x1: number, y1: number, add: boolean): void {
    const ids = this.sim.unitsOf(this.me).filter((u) => u.x >= x0 && u.x <= x1 && u.y >= y0 && u.y <= y1).map((u) => u.id);
    this.setSelection(ids, add);
    if (ids.length) audio.play('select');
    if (this.touchBox) { this.touchBox = false; this.hooks.onModeChange(); }
  }

  private leftClick(x: number, y: number, touch: boolean): void {
    const m = this.mode;
    if (m.kind === 'ability') {
      const err = this.sim.useAbility(this.me, m.id, { x, y });
      if (err) { this.hooks.toast(err, 'error'); audio.play('error'); }
      this.setMode({ kind: 'none' });
      return;
    }
    if (m.kind === 'attackMove') {
      this.commandTo(x, y, true);
      this.setMode({ kind: 'none' });
      return;
    }
    if (m.kind === 'rally') {
      if (this.selState >= 0) {
        this.sim.setRally(this.me, this.selState, x, y);
        this.hooks.toast('Ponto de encontro definido.');
        audio.play('order');
      }
      this.setMode({ kind: 'none' });
      return;
    }
    const mine = this.pickUnit(x, y, (u) => u.f === this.me && u.type !== 'militia');
    if (mine) {
      const now = this.time.now;
      if (now - this.lastClick.t < 350 && this.lastClick.id === mine.id) {
        const v = this.cameras.main.worldView;
        this.setSelection(this.sim.unitsOf(this.me).filter((u) => u.type === mine.type && v.contains(u.x, u.y)).map((u) => u.id));
      } else if (this.keys.SHIFT.isDown && this.sel.has(mine.id)) {
        this.sel.delete(mine.id);
        this.hooks.onSelection();
      } else {
        this.setSelection([mine.id], this.keys.SHIFT.isDown);
      }
      this.lastClick = { t: now, id: mine.id };
      audio.play('select');
      return;
    }
    // toque com unidades selecionadas: dá a ordem (não há botão direito)
    if (touch && this.sel.size) {
      this.rightClick(x, y);
      return;
    }
    const st = this.sim.map.stateAtPrecise(x, y);
    if (st >= 0) {
      this.selectState(st);
      audio.play('click');
    } else this.clearSelection();
  }

  private rightClick(x: number, y: number): void {
    if (this.mode.kind !== 'none') { this.setMode({ kind: 'none' }); return; }
    if (!this.sel.size) {
      if (this.selState >= 0 && this.sim.w.states[this.selState].owner === this.me && this.controllable) {
        this.sim.setRally(this.me, this.selState, x, y);
        this.hooks.toast('Ponto de encontro definido.');
        audio.play('order');
      }
      return;
    }
    this.commandTo(x, y, false);
  }

  private commandTo(x: number, y: number, forceAttack: boolean): void {
    if (!this.controllable) { this.hooks.toast('Aguarde sua vez de dar ordens.', 'warn'); return; }
    const ids = [...this.sel];
    const enemy = this.pickUnit(x, y, (u) => u.f !== this.me);
    if (enemy) {
      this.sim.commandAttack(this.me, ids, { t: 'u', id: enemy.id });
      this.pulse(enemy.x, enemy.y, 0xff5252, 18);
      audio.play('order');
      return;
    }
    const cap = this.pickCapital(x, y);
    if (cap >= 0 && this.sim.w.states[cap].owner !== this.me) {
      const c = this.sim.capital(cap);
      this.sim.commandMove(this.me, ids, c.x, c.y, true);
      this.pulse(c.x, c.y, 0xff5252, 26);
      audio.play('order');
      return;
    }
    const st = this.sim.map.stateAt(x, y);
    const hostileGround = st >= 0 && this.sim.w.states[st].owner !== this.me;
    this.sim.commandMove(this.me, ids, x, y, forceAttack || hostileGround);
    this.pulse(x, y, forceAttack || hostileGround ? 0xff8a50 : 0x7dffb0, 14);
    audio.play('order');
  }

  pulse(x: number, y: number, color: number, r: number, total = 0.45): void {
    this.pulses.push({ x, y, r: r * 0.3, max: r, life: total, total, color });
  }

  // ================================================================== laço
  update(_t: number, deltaMs: number): void {
    const dt = Math.min(0.1, deltaMs / 1000);
    const sim = this.sim;
    if (!this.userPaused && !sim.paused) sim.advance(dt * this.speed);
    this.updateCamera(dt);
    this.consumeEvents();
    this.redrawOwners(false);
    this.renderUnits();
    this.renderOverlay(dt);
    this.renderFx(dt);
    if (sim.w.time >= this.nextIconSync) { this.nextIconSync = sim.w.time + 0.5; this.syncIcons(); }
    if (sim.w.time >= this.nextAutosave) { this.nextAutosave = sim.w.time + 60; this.hooks.autosave(); }
  }

  private updateCamera(dt: number): void {
    const cam = this.cameras.main;
    const k = this.keys;
    const sp = 700 / cam.zoom * dt;
    if (k.A.isDown || k.LEFT.isDown) cam.scrollX -= sp;
    if (k.D.isDown || k.RIGHT.isDown) cam.scrollX += sp;
    if (k.W.isDown || k.UP.isDown) cam.scrollY -= sp;
    if (k.S.isDown || k.DOWN.isDown) cam.scrollY += sp;
    if (this.hooks.settings().edgeScroll && this.input.activePointer && !this.drag && document.hasFocus()) {
      const p = this.input.activePointer;
      const m = 8;
      if (p.x < m) cam.scrollX -= sp;
      if (p.x > cam.width - m) cam.scrollX += sp;
      if (p.y < m) cam.scrollY -= sp;
      if (p.y > cam.height - m) cam.scrollY += sp;
    }
    if (cam.zoom < this.minZoom()) cam.setZoom(this.minZoom());
    // rótulos mantêm tamanho legível na tela
    const z = cam.zoom;
    const ls = Phaser.Math.Clamp(0.9 / z, 0.8, 2.6);
    for (const t of this.labels) { t.setScale(ls); t.setAlpha(z < 1.2 ? 0.85 : 0.35); }
    const cs = Phaser.Math.Clamp(1 / z, 0.7, 1.6);
    for (const t of this.capLabels) { t.setScale(cs); t.setVisible(z > 0.55); }
  }

  /** Atualiza cores dos estados e linhas de frente quando o domínio muda. */
  private redrawOwners(force: boolean): void {
    const w = this.sim.w;
    const key = w.states.map((s) => s.owner[0]).join('');
    const t = this.time.now / 1000;
    for (const s of w.states) {
      const base = ownerColor(s.owner);
      let alpha = 0.5;
      if (s.i === this.hoverState) alpha = 0.62;
      if (s.i === this.selState) alpha = 0.72;
      const attacked = w.time - s.lastCombatT < 3 && s.owner === this.me;
      if (attacked) alpha += 0.12 * Math.sin(t * 8);
      for (const p of this.fills[s.i]) {
        p.setFillStyle(base, alpha);
        if (s.i === this.selState) p.setStrokeStyle(4, 0xffffff, 0.95);
        else if (p.isStroked) p.isStroked = false;
      }
    }
    this.frontG.setAlpha(0.65 + 0.35 * Math.sin(t * 3));
    if (!force && key === this.ownersKey) return;
    this.ownersKey = key;
    this.frontG.clear();
    for (const b of this.sim.map.borders) {
      const oa = w.states[b.a].owner, ob = w.states[b.b].owner;
      const front = oa !== ob && oa !== 'neutral' && ob !== 'neutral';
      if (!front) continue;
      this.frontG.lineStyle(14, 0xff6a1a, 0.18);
      for (const l of b.lines) this.strokeLine(this.frontG, l);
      this.frontG.lineStyle(4, 0xffb347, 0.9);
      for (const l of b.lines) this.strokeLine(this.frontG, l);
    }
  }

  private unitScale(): number {
    const z = this.cameras.main.zoom;
    // tamanho na tela entre ~17 px (afastado) e ~42 px (aproximado)
    return (Phaser.Math.Clamp(z, 0.6, 1.4) / z) * (30 / UNIT_TEX_SIZE);
  }

  private renderUnits(): void {
    const sim = this.sim;
    const a = sim.alpha;
    const sc = this.unitScale();
    const now = sim.w.time;
    const seen = new Set<number>();
    for (const u of sim.w.units) {
      if (u.hp <= 0) continue;
      seen.add(u.id);
      let v = this.units.get(u.id);
      const def = UNIT_DEFS[u.type];
      if (!v) {
        const body = this.add.image(u.x, u.y, unitKey(u.type, u.f)).setDepth(def.air ? 12 : 6);
        v = { body, type: u.type };
        if (u.type === 'heli') v.rotor = this.add.image(u.x, u.y, 'rotor').setDepth(13);
        if (def.air) v.shadow = this.add.image(u.x, u.y, 'shadow').setDepth(5.5);
        this.units.set(u.id, v);
      }
      const x = u.px + (u.x - u.px) * a, y = u.py + (u.y - u.py) * a;
      const lift = def.air ? 10 * sc * 2 : 0;
      v.body.setPosition(x, y - lift).setScale(sc).setRotation(u.angle);
      if (now - u.lastHitT < 0.1) v.body.setTintFill(0xffffff); else v.body.clearTint();
      if (u.type === 'plane' && u.phase === 'rearm') v.body.setAlpha(0.55); else v.body.setAlpha(1);
      if (v.rotor) v.rotor.setPosition(x, y - lift).setScale(sc * 1.1).setRotation(this.time.now / 40);
      if (v.shadow) v.shadow.setPosition(x + 4 * sc, y + 6 * sc).setScale(sc * 1.2);
    }
    for (const [id, v] of this.units) {
      if (seen.has(id)) continue;
      v.body.destroy();
      v.rotor?.destroy();
      v.shadow?.destroy();
      this.units.delete(id);
      if (this.sel.delete(id)) this.hooks.onSelection();
    }
  }

  private renderOverlay(dt: number): void {
    const g = this.overlay;
    const sim = this.sim, w = sim.w;
    const cam = this.cameras.main;
    const z = cam.zoom;
    const view = cam.worldView;
    const px = 1 / z;
    const sc = this.unitScale();
    g.clear();
    const t = this.time.now / 1000;

    // capitais, guarnições e captura
    for (const s of w.states) {
      const c = sim.capital(s.i);
      if (!view.contains(c.x, c.y) && !Phaser.Geom.Rectangle.Overlaps(view, new Phaser.Geom.Rectangle(c.x - 60, c.y - 60, 120, 120))) continue;
      const col = ownerColor(s.owner);
      const isHq = s.owner !== 'neutral' && w.factions[s.owner].hq === s.i;
      const r = (isHq ? 11 : 8) * Math.max(1, px * 0.8);
      if (w.time - s.lastAttackT < 2.5 && s.gHp > 0) {
        g.lineStyle(3 * px, 0xff3b3b, 0.5 + 0.5 * Math.sin(t * 10));
        g.strokeCircle(c.x, c.y, r + 8 * px);
      }
      g.fillStyle(0x0b0d0c, 0.9);
      g.fillCircle(c.x, c.y, r + 2.5 * px);
      g.fillStyle(col, 1);
      if (isHq) this.star(g, c.x, c.y, r * 1.25, r * 0.55);
      else g.fillCircle(c.x, c.y, r);
      g.lineStyle(1.5 * px, isHq ? 0xffd54a : 0xf2ecd2, 1);
      g.strokeCircle(c.x, c.y, r + 2.5 * px);
      // barra da guarnição
      const bw = 40 * Math.max(1, px * 0.8), bh = 5 * Math.max(1, px * 0.8);
      const by = c.y - r - 10 * Math.max(1, px * 0.8);
      g.fillStyle(0x000000, 0.75);
      g.fillRect(c.x - bw / 2 - px, by - px, bw + 2 * px, bh + 2 * px);
      const f = s.gHp / s.gMax;
      g.fillStyle(f > 0.5 ? 0x6ad04f : f > 0.25 ? 0xf2c230 : 0xe53935, 1);
      g.fillRect(c.x - bw / 2, by, bw * f, bh);
      // progresso de captura
      if (s.capF && s.capP > 0) {
        g.lineStyle(5 * Math.max(1, px * 0.8), ownerColor(s.capF), 1);
        g.beginPath();
        g.arc(c.x, c.y, r + 9 * Math.max(1, px * 0.8), -Math.PI / 2, -Math.PI / 2 + (s.capP / 100) * Math.PI * 2);
        g.strokePath();
      }
      if (s.gHp <= 0) {
        g.lineStyle(2.5 * px, 0xff3b3b, 1);
        g.lineBetween(c.x - r, c.y - r, c.x + r, c.y + r);
        g.lineBetween(c.x + r, c.y - r, c.x - r, c.y + r);
      }
      // obra em andamento
      if (s.cons && s.owner === this.me) {
        g.fillStyle(0x000000, 0.7);
        g.fillRect(c.x - bw / 2, by - bh - 3 * px, bw, bh * 0.7);
        g.fillStyle(0xffc94d, 1);
        g.fillRect(c.x - bw / 2, by - bh - 3 * px, bw * (s.cons.t / s.cons.total), bh * 0.7);
      }
      // ícone de batalha
      const bi = this.battleIcons[s.i];
      const fighting = w.time - s.lastCombatT < 2.5;
      bi.setVisible(fighting);
      if (fighting) bi.setPosition(c.x + 26 * Math.max(1, px * 0.8), c.y - 22 * Math.max(1, px * 0.8)).setScale(Math.max(0.6, px * 0.7) * (1 + 0.15 * Math.sin(t * 9)));
    }

    // indicadores de ofensivas inimigas (inteligência)
    const enemy = enemyOf(this.me);
    const eai = w.ai[enemy];
    if (eai) {
      for (const gr of eai.groups) {
        if (gr.task !== 'attack' || gr.units.length < 3) continue;
        let cx = 0, cy = 0, n = 0;
        for (const id of gr.units) { const u = sim.unit(id); if (u) { cx += u.x; cy += u.y; n++; } }
        if (!n) continue;
        cx /= n; cy /= n;
        const tc = sim.capital(gr.target);
        this.arrow(g, cx, cy, tc.x, tc.y, FACTIONS[enemy].color, gr.phase === 'attack' ? 0.9 : 0.45, px);
      }
    }

    // unidades: seleção, vida, ordens
    const showAll = this.hooks.settings().showAllHp;
    for (const u of w.units) {
      if (u.hp <= 0 || !view.contains(u.x, u.y)) continue;
      const def = UNIT_DEFS[u.type];
      const x = u.px + (u.x - u.px) * sim.alpha, y = u.py + (u.y - u.py) * sim.alpha - (def.air ? 20 * sc : 0);
      const selected = this.sel.has(u.id);
      const rad = 13 * sc * 2;
      if (selected) {
        g.lineStyle(2 * px, 0x7dffb0, 1);
        g.strokeCircle(x, y, rad);
        // linha da ordem
        if (u.order.kind === 'move' || u.order.kind === 'attack') {
          const tx = u.order.kind === 'move' ? u.order.x : sim.resolve(u.order.target)?.x;
          const ty = u.order.kind === 'move' ? u.order.y : sim.resolve(u.order.target)?.y;
          if (tx !== undefined && ty !== undefined) {
            const aggressive = u.order.kind === 'attack' || (u.order.kind === 'move' && u.order.aggressive);
            g.lineStyle(1.2 * px, aggressive ? 0xff7a50 : 0x7dffb0, 0.45);
            g.lineBetween(x, y, tx, ty);
          }
        }
      }
      if (showAll || selected || u.hp < u.maxHp) {
        const bw = 22 * sc * 2, bh = Math.max(2.5 * px, 3 * sc);
        const f = u.hp / u.maxHp;
        g.fillStyle(0x000000, 0.7);
        g.fillRect(x - bw / 2 - px, y - rad - bh - px * 2, bw + 2 * px, bh + 2 * px);
        g.fillStyle(u.f === this.me ? (f > 0.5 ? 0x6ad04f : f > 0.25 ? 0xf2c230 : 0xe53935) : u.f === 'neutral' ? 0xc9c19c : 0xff5a5a, 1);
        g.fillRect(x - bw / 2, y - rad - bh - px, bw * f, bh);
        if (u.type === 'plane' && u.f === this.me) {
          g.fillStyle(0x4fc3f7, 1);
          g.fillRect(x - bw / 2, y - rad - px * 0.5 + 1, bw * (u.ammo / def.ammo), bh * 0.6);
        }
      }
      if (!u.supplied && u.f === this.me) {
        g.fillStyle(0xffb300, 0.9 * (0.6 + 0.4 * Math.sin(t * 6)));
        g.fillTriangle(x + rad, y - rad, x + rad + 6 * px, y - rad - 10 * px, x + rad + 12 * px, y - rad);
      }
    }

    // ponto de encontro do estado selecionado
    const st = this.selState >= 0 ? w.states[this.selState] : null;
    if (st && st.owner === this.me && st.rally) {
      const c = sim.capital(st.i);
      g.lineStyle(1.5 * px, 0x44ff88, 0.6);
      g.lineBetween(c.x, c.y, st.rally.x, st.rally.y);
      this.rallyIcon.setVisible(true).setPosition(st.rally.x, st.rally.y).setScale(Math.max(1, px));
    } else this.rallyIcon.setVisible(false);

    // área de efeito do Ataque Coordenado
    for (const f of ['lula', 'bolso'] as Faction[]) {
      const b = w.factions[f].buffs;
      if (b.coordT > 0) {
        g.lineStyle(3 * px, FACTIONS[f].color, 0.35 + 0.25 * Math.sin(t * 5));
        g.strokeCircle(b.coordX, b.coordY, 280);
      }
    }

    // pulsos (ordens, capturas, habilidades)
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i];
      p.life -= dt;
      if (p.life <= 0) { this.pulses.splice(i, 1); continue; }
      const k = 1 - p.life / p.total;
      g.lineStyle(2.5 * px, p.color, 1 - k);
      g.strokeCircle(p.x, p.y, p.r + (p.max - p.r) * k);
    }
  }

  private star(g: Phaser.GameObjects.Graphics, x: number, y: number, ro: number, ri: number): void {
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? ri : ro;
      pts.push(new Phaser.Math.Vector2(x + Math.cos(a) * r, y + Math.sin(a) * r));
    }
    g.fillPoints(pts, true);
  }

  private arrow(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, color: number, alpha: number, px: number): void {
    const d = Math.hypot(x1 - x0, y1 - y0);
    if (d < 40) return;
    const a = Math.atan2(y1 - y0, x1 - x0);
    const ex = x1 - Math.cos(a) * 26, ey = y1 - Math.sin(a) * 26;
    const dash = 18, gap = 10;
    g.lineStyle(5 * px, color, alpha);
    for (let s = 0; s < d - 40; s += dash + gap) {
      const e = Math.min(s + dash, d - 40);
      g.lineBetween(x0 + Math.cos(a) * s, y0 + Math.sin(a) * s, x0 + Math.cos(a) * e, y0 + Math.sin(a) * e);
    }
    const hs = 16 * px;
    g.fillStyle(color, alpha);
    g.fillTriangle(
      ex + Math.cos(a) * hs, ey + Math.sin(a) * hs,
      ex + Math.cos(a + 2.5) * hs, ey + Math.sin(a + 2.5) * hs,
      ex + Math.cos(a - 2.5) * hs, ey + Math.sin(a - 2.5) * hs,
    );
  }

  private renderFx(dt: number): void {
    const g = this.fxG;
    g.clear();
    const px = 1 / this.cameras.main.zoom;
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.life -= dt;
      if (tr.life <= 0) { this.tracers.splice(i, 1); continue; }
      g.lineStyle(tr.width * Math.max(1, px * 0.7), tr.color, tr.life / tr.max);
      g.lineBetween(tr.x1, tr.y1, tr.x2, tr.y2);
    }
    // projéteis de artilharia em arco
    for (const sh of this.sim.w.shells) {
      const k = Math.min(1, sh.t / sh.dur);
      const d = Math.hypot(sh.x1 - sh.x0, sh.y1 - sh.y0);
      const x = sh.x0 + (sh.x1 - sh.x0) * k, y = sh.y0 + (sh.y1 - sh.y0) * k - Math.sin(Math.PI * k) * d * 0.22;
      g.fillStyle(0xffe08a, 0.9);
      g.fillCircle(x, y, 2.6 * Math.max(1, px * 0.6));
      g.fillStyle(0xffffff, 0.25);
      g.fillCircle(x, y, 5 * Math.max(1, px * 0.6));
    }
    for (let i = this.wrecks.length - 1; i >= 0; i--) {
      const wr = this.wrecks[i];
      wr.t -= dt;
      if (wr.t <= 0) { wr.img.destroy(); this.wrecks.splice(i, 1); }
      else if (wr.t < 3) wr.img.setAlpha(wr.t / 3);
    }
  }

  // ================================================================== eventos da simulação
  private visible(x: number, y: number, margin = 80): boolean {
    const v = this.cameras.main.worldView;
    return x > v.x - margin && x < v.right + margin && y > v.y - margin && y < v.bottom + margin;
  }

  private sfxAt(name: Sfx, x: number, y: number, vol = 1): void {
    if (!this.visible(x, y, 150)) return;
    const cam = this.cameras.main;
    const pan = (x - cam.midPoint.x) / (cam.worldView.width / 2);
    const zv = Phaser.Math.Clamp(cam.zoom * 1.4, 0.35, 1);
    audio.play(name, vol * zv, pan);
  }

  private consumeEvents(): void {
    const ev = this.sim.events;
    if (!ev.length) return;
    const particles = this.hooks.settings().particles;
    for (const e of ev) {
      switch (e.k) {
        case 'shot': {
          if (!this.visible(e.x1, e.y1) && !this.visible(e.x2, e.y2)) break;
          const col = e.f === 'neutral' ? 0xf0e6b0 : e.f === 'lula' ? 0xffb199 : 0xa8d0ff;
          const heavy = e.ut === 'tank' || e.ut === 'plane' || e.ut === 'heli';
          this.tracers.push({ x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, life: heavy ? 0.16 : 0.09, max: heavy ? 0.16 : 0.09, color: heavy ? 0xfff3c4 : col, width: heavy ? 2.6 : 1.4 });
          if (particles) this.sparks.explode(heavy ? 5 : 2, e.x2, e.y2);
          if (heavy && particles) this.dust.explode(2, e.x2, e.y2);
          this.sfxAt(e.ut === 'tank' ? 'cannon' : e.ut === 'base' ? 'base' : e.ut === 'plane' ? 'cannon' : 'rifle', e.x1, e.y1, e.ut === 'tank' ? 0.7 : 0.5);
          break;
        }
        case 'shell':
          this.sfxAt('artillery', e.x1, e.y1, 0.6);
          break;
        case 'boom':
          if (this.visible(e.x, e.y)) {
            if (particles) {
              this.fire.explode(Math.round(8 * e.size), e.x, e.y);
              this.smoke.explode(Math.round(3 * e.size), e.x, e.y);
              this.sparks.explode(Math.round(6 * e.size), e.x, e.y);
            }
            this.sfxAt(e.size >= 1.5 ? 'bigExplosion' : 'explosion', e.x, e.y, 0.7);
          }
          break;
        case 'death':
          if (this.visible(e.x, e.y)) {
            if (e.ut === 'infantry' || e.ut === 'militia' || e.ut === 'support') { if (particles) this.dust.explode(4, e.x, e.y); }
            else {
              const img = this.add.image(e.x, e.y, 'wreck').setDepth(5.2).setRotation(Math.random() * 6).setScale(this.unitScale() * 2);
              this.wrecks.push({ img, t: 25 });
              if (particles) this.smoke.explode(6, e.x, e.y);
            }
          }
          break;
        case 'capture': {
          const c = this.sim.capital(e.s);
          this.pulse(c.x, c.y, ownerColor(e.f), 140, 1.4);
          this.pulse(c.x, c.y, 0xffffff, 80, 0.9);
          if (e.f === this.me) audio.play('capture');
          else if (e.from === this.me) audio.play('lost');
          break;
        }
        case 'garrisonDown': {
          const c = this.sim.capital(e.s);
          if (particles && this.visible(c.x, c.y)) this.smoke.explode(10, c.x, c.y);
          break;
        }
        case 'spawn': {
          const u = this.sim.unit(e.id);
          if (u && particles && this.visible(u.x, u.y)) this.dust.explode(5, u.x, u.y);
          if (u && u.f === this.me && UNIT_DEFS[u.type].air) this.sfxAt(u.type === 'heli' ? 'heli' : 'jet', u.x, u.y, 0.6);
          break;
        }
        case 'built':
          if (e.f === this.me) audio.play('build');
          break;
        case 'ability':
          this.pulse(e.x, e.y, FACTIONS[e.f].color, 320, 1.6);
          this.pulse(e.x, e.y, 0xffffff, 200, 1.0);
          audio.play('ability');
          break;
        case 'alert':
          if (e.victim === this.me) audio.play('alert', 0.8);
          break;
        default:
          break;
      }
      this.hooks.onEvent(e);
    }
    ev.length = 0;
  }

  /** Ícones de construções nas capitais (atualizados duas vezes por segundo). */
  private syncIcons(): void {
    const w = this.sim.w;
    const px = Math.max(1, (1 / this.cameras.main.zoom) * 0.8);
    for (const s of w.states) {
      const c = this.sim.capital(s.i);
      const present = BUILD_ICONS.filter((b) => s.b[b] > 0);
      const icons = this.bIcons[s.i];
      BUILD_ICONS.forEach((b, k) => {
        const idx = present.indexOf(b);
        const img = icons[k];
        if (idx < 0) { img.setVisible(false); return; }
        const n = present.length;
        img.setVisible(this.cameras.main.zoom > 0.42)
          .setScale(0.42 * px)
          .setPosition(c.x + (idx - (n - 1) / 2) * 15 * px, c.y + 34 * px);
      });
      this.capLabels[s.i].setPosition(c.x, c.y + (present.length ? 44 : 15) * px);
    }
  }
}
