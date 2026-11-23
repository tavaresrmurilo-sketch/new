// HUD da partida (DOM sobre o canvas do Phaser).
import { FACTIONS, ABILITIES, NEUTRAL_COLOR, enemyOf, DIFFICULTY_LABEL } from '@shared/data/factions';
import { UNIT_DEFS, RECRUITABLE } from '@shared/data/units';
import { BUILDING_DEFS, BUILDING_ORDER } from '@shared/data/buildings';
import { OBJECTIVES } from '@shared/sim/objectives';
import { INCOME_SCALE, TRADE_RATE, type Game } from '@shared/sim/game';
import { newAIState } from '@shared/sim/setup';
import type { GameScene, SceneHooks } from '../scenes/GameScene';
import type { App } from '../app';
import type { BuildingType, Faction, Res, ResKey, SimEvent, Unit, UnitType } from '@shared/sim/types';
import { audio } from '../audio/audio';
import { deleteSave, recordResult } from '../persist/storage';
import { portraitURI, flagURI, ICON } from './art';
import { el, esc, fmt, fmtRate, fmtTime, modal } from './dom';
import { howToPlayHTML } from './help';

const RES_ICON: Record<ResKey, string> = { money: ICON.money, fuel: ICON.fuel, steel: ICON.steel, supplies: ICON.supplies };
const RES_NAME: Record<ResKey, string> = { money: 'Dinheiro', fuel: 'Combustível', steel: 'Aço', supplies: 'Suprimentos' };
const RES_KEYS: ResKey[] = ['money', 'fuel', 'steel', 'supplies'];
const ORDER_LABEL: Record<string, string> = { idle: 'Aguardando', hold: 'Mantendo posição', move: 'Em movimento', attack: 'Atacando alvo', rtb: 'Voltando à base' };
const PLANE_PHASE: Record<string, string> = { ready: 'Pronto na base', sortie: 'Em surtida', rtb: 'Retornando', rearm: 'Rearmando' };

function costHTML(c: Res, have?: Res, infinite = false): string {
  return RES_KEYS.filter((k) => c[k] > 0)
    .map((k) => `<span data-ck="${k}" class="${!infinite && have && have[k] < c[k] ? 'no' : ''}">${RES_ICON[k]}${c[k]}</span>`)
    .join('');
}

export class HUD {
  private root: HTMLElement;
  private scene!: GameScene;
  private timer = 0;
  private selSig = '';
  private ownersSig = '';
  private mmBg: HTMLCanvasElement;
  private toastsEl: HTMLElement;
  private handoffEl: HTMLElement | null = null;
  private pauseOpen = false;
  private endShown = false;
  private logSig = '';

  constructor(private app: App, private sim: Game) {
    this.mmBg = document.createElement('canvas');
    this.root = el(`<div class="hud">
      <div class="hud-top">
        <div class="fac" data-fac></div>
        <div class="res money" title="Dinheiro"><span class="ic">${ICON.money}</span><span class="v" data-r="money"></span><span class="d" data-d="money"></span></div>
        <div class="res fuel" title="Combustível — tanques e helicópteros consomem continuamente; aviões ao rearmar"><span class="ic">${ICON.fuel}</span><span class="v" data-r="fuel"></span><span class="d" data-d="fuel"></span></div>
        <div class="res steel" title="Aço"><span class="ic">${ICON.steel}</span><span class="v" data-r="steel"></span><span class="d" data-d="steel"></span></div>
        <div class="res supplies" title="Suprimentos — consumidos pelas tropas; sem estoque, todas ficam sem suprimento"><span class="ic">${ICON.supplies}</span><span class="v" data-r="supplies"></span><span class="d" data-d="supplies"></span></div>
        <div class="res industry" title="Capacidade industrial — multiplica a velocidade de produção"><span class="ic">${ICON.industry}</span><span class="v" data-industry></span></div>
        <div class="res troops" title="Tropas em campo e na fila / limite"><span class="ic">${ICON.troops}</span><span class="v" data-pop></span></div>
        <div class="res states" title="Estados dominados"><span class="ic">${ICON.map}</span><span class="v" data-states></span></div>
        <div class="res clock" title="Tempo de guerra"><span class="ic">${ICON.clock}</span><span class="v" data-time></span></div>
        <div class="spacer"></div>
        <div class="speed" data-speed>
          <button class="btn" data-spd="pause" title="Pausar (Espaço)">${ICON.pause}</button>
          <button class="btn" data-spd="0.5">0,5×</button><button class="btn" data-spd="1">1×</button>
          <button class="btn" data-spd="2">2×</button><button class="btn" data-spd="3">3×</button>
        </div>
        <button class="btn icon" data-act="trade" title="Mercado de recursos">${ICON.trade}</button>
        <button class="btn icon" data-act="report" title="Relatório de batalha">${ICON.report}</button>
        <button class="btn icon" data-act="pause" title="Menu (Esc)">${ICON.menu}</button>
      </div>
      <div class="hud-left">
        <div class="panel"><div class="ph">${ICON.star} Comando</div>
          <div class="cmd-portraits" data-portraits></div>
          <div class="abilities" data-abilities></div>
          <div class="buffs" data-buffs></div>
        </div>
      </div>
      <div class="hud-right">
        <div class="panel" data-objpanel><div class="ph">${ICON.flag} Objetivos</div><div class="objs" data-objs></div></div>
        <div class="panel"><div class="ph">${ICON.swords} Relatório de batalha</div><div class="log" data-log></div></div>
      </div>
      <div class="hud-bottom">
        <div class="panel minimap interactive"><canvas data-minimap width="416" height="428" aria-label="Minimapa"></canvas></div>
        <div class="panel selpanel" data-sel></div>
        <div class="panel actions" data-actions>
          <button class="btn" data-act="selscreen" title="Selecionar todas as suas unidades visíveis (E)">${ICON.select} Tela</button>
          <button class="btn" data-act="box" title="Próximo arraste vira seleção em área (para toque)">${ICON.focus} Área</button>
          <button class="btn" data-act="amove" title="Ataque-movimento (Q)">${ICON.attack} Atacar</button>
          <button class="btn" data-act="stop" title="Parar (X)">${ICON.stop} Parar</button>
          <button class="btn" data-act="hold" title="Manter posição (H)">${ICON.hold} Manter</button>
          <button class="btn" data-act="rtb" title="Aviões voltam à base (R)">${ICON.plane} Base</button>
          <button class="btn" data-act="hq" title="Ir para a sede (G)">${ICON.home} Sede</button>
          <button class="btn" data-act="desel" title="Limpar seleção (Esc)">${ICON.close} Limpar</button>
          <button class="btn" data-act="zin" title="Aproximar">＋ Zoom</button>
          <button class="btn" data-act="zout" title="Afastar">－ Zoom</button>
          <button class="btn hidden" data-act="swap" title="Sandbox: controlar o outro lado" style="grid-column: span 2">${ICON.trade} Trocar lado</button>
        </div>
      </div>
      <div class="toasts" data-toasts></div>
      <div class="banner hidden" data-banner></div>
      <div class="modeline hidden" data-modeline></div>
      <div class="paused-tag hidden" data-paused>PAUSADO</div>
    </div>`);
    this.toastsEl = this.root.querySelector('[data-toasts]')!;
    this.app.ui.appendChild(this.root);
    this.bind();
  }

  hooks(): SceneHooks {
    return {
      onEvent: (e) => this.onEvent(e),
      onSelection: () => { this.selSig = ''; this.renderSel(); },
      onModeChange: () => this.renderMode(),
      toast: (m, k) => this.toast(m, k ?? 'info'),
      autosave: () => { if (this.app.settings.autosave) this.app.save(true); },
      openPause: () => this.showPause(),
      settings: () => this.app.settings,
    };
  }

  attach(scene: GameScene): void {
    this.scene = scene;
    if (this.sim.w.settings.mode === 'sandbox') this.root.querySelector('[data-act="swap"]')!.classList.remove('hidden');
    if (this.sim.w.settings.mode === 'sandbox' || this.sim.w.settings.mode === 'local') this.root.querySelector<HTMLElement>('[data-objpanel]')!.classList.toggle('hidden', this.sim.w.settings.mode === 'sandbox');
    this.renderStatic();
    this.tick();
    this.timer = window.setInterval(() => this.tick(), 200);
    if (this.sim.w.turn && this.sim.w.turn.phase === 'plan') this.showHandoff(this.sim.w.turn.active);
  }

  destroy(): void {
    clearInterval(this.timer);
    this.root.remove();
    this.app.ui.querySelectorAll('.modal-back').forEach((n) => n.remove());
  }

  get me(): Faction {
    return this.scene.me;
  }

  // ================================================================== eventos
  private bind(): void {
    this.root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const spd = t.closest<HTMLElement>('[data-spd]')?.dataset.spd;
      if (spd) {
        if (spd === 'pause') this.scene.userPaused = !this.scene.userPaused;
        else { this.scene.speed = +spd; this.scene.userPaused = false; }
        this.renderMode();
        return;
      }
      const ab = t.closest<HTMLElement>('[data-ability]')?.dataset.ability;
      if (ab) { this.scene.useAbility(ab as never); return; }
      const logE = t.closest<HTMLElement>('[data-logs]');
      if (logE) { const c = this.sim.capital(+logE.dataset.logs!); this.scene.centerOn(c.x, c.y); return; }
      const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act) this.action(act, t.closest<HTMLElement>('[data-act]')!);
    });
    // painel de seleção: pointerdown evita perder cliques quando o painel é atualizado
    this.root.querySelector('[data-sel]')!.addEventListener('pointerdown', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-sa]');
      if (!t || (t as HTMLButtonElement).disabled) return;
      e.preventDefault();
      audio.play('click');
      this.selAction(t.dataset.sa!, t.dataset.arg ?? '');
    });
    const mm = this.root.querySelector<HTMLCanvasElement>('[data-minimap]')!;
    let dragging = false;
    const go = (ev: PointerEvent) => {
      const r = mm.getBoundingClientRect();
      const x = ((ev.clientX - r.left) / r.width) * this.sim.map.width;
      const y = ((ev.clientY - r.top) / r.height) * this.sim.map.height;
      this.scene.centerOn(x, y);
    };
    mm.addEventListener('pointerdown', (ev) => { dragging = true; mm.setPointerCapture(ev.pointerId); go(ev); });
    mm.addEventListener('pointermove', (ev) => { if (dragging) go(ev); });
    mm.addEventListener('pointerup', () => { dragging = false; });
    this.toastsEl.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-goto]');
      if (t) { const c = this.sim.capital(+t.dataset.goto!); this.scene.centerOn(c.x, c.y); t.remove(); }
    });
  }

  private action(act: string, btn: HTMLElement): void {
    const sc = this.scene;
    switch (act) {
      case 'pause': this.showPause(); break;
      case 'trade': this.showTrade(); break;
      case 'report': this.showReport(); break;
      case 'selscreen': sc.selectAllOnScreen(); break;
      case 'box': sc.touchBox = !sc.touchBox; btn.classList.toggle('active', sc.touchBox); if (sc.touchBox) this.toast('Arraste no mapa para selecionar em área.'); break;
      case 'amove':
        if (!sc.sel.size) { this.toast('Selecione tropas primeiro.', 'warn'); break; }
        sc.setMode({ kind: 'attackMove' }); break;
      case 'stop': sc.issueStop(); break;
      case 'hold': sc.issueStop(true); break;
      case 'rtb': sc.issueRTB(); break;
      case 'hq': { const c = this.sim.capital(this.sim.w.factions[this.me].hq); sc.centerOn(c.x, c.y); break; }
      case 'desel': sc.clearSelection(); break;
      case 'zin': sc.zoomBy(1.25); break;
      case 'zout': sc.zoomBy(0.8); break;
      case 'swap': this.swapSide(); break;
    }
  }

  private selAction(a: string, arg: string): void {
    const sim = this.sim, sc = this.scene, me = this.me;
    if (!sc.controllable && ['recruit', 'build', 'cancelq', 'cancelb', 'rally', 'clearrally'].includes(a)) {
      this.toast('Aguarde sua vez de dar ordens.', 'warn');
      return;
    }
    switch (a) {
      case 'recruit': {
        const err = sim.recruit(me, sc.selState, arg as UnitType);
        if (err) { this.toast(err, 'error'); audio.play('error'); } else audio.play('recruit');
        break;
      }
      case 'build': {
        const err = sim.build(me, sc.selState, arg as BuildingType);
        if (err) { this.toast(err, 'error'); audio.play('error'); } else audio.play('build');
        break;
      }
      case 'cancelq': sim.cancelRecruit(me, sc.selState, +arg); break;
      case 'cancelb': sim.cancelBuild(me, sc.selState); break;
      case 'rally': sc.setMode({ kind: 'rally' }); this.toast('Clique no mapa para definir o ponto de encontro das novas tropas.'); break;
      case 'clearrally': sim.setRally(me, sc.selState, null); break;
      case 'focus': sc.focusSelection(); break;
      case 'onlytype': sc.setSelection(sc.selectedUnits().filter((u) => u.type === arg).map((u) => u.id)); break;
      case 'state': sc.selectState(+arg); sc.focusSelection(); break;
    }
    this.selSig = '';
    this.renderSel();
  }

  private onEvent(e: SimEvent): void {
    const me = this.me;
    const name = (s: number) => this.sim.stateName(s);
    switch (e.k) {
      case 'alert':
        if (e.victim === me) this.toast(`⚠ Ataque em ${name(e.s)}!`, 'alert', e.s);
        break;
      case 'capture':
        if (e.f === me) this.toast(`Estado conquistado: ${name(e.s)}!`, 'good', e.s);
        else if (e.from === me) this.toast(`Perdemos ${name(e.s)}!`, 'error', e.s);
        this.ownersSig = '';
        break;
      case 'objective':
        if (e.f === me) { const o = OBJECTIVES.find((x) => x.id === e.id); if (o) this.toast(`Objetivo cumprido: ${o.name} — recompensa recebida!`, 'good'); audio.play('capture'); }
        break;
      case 'hqLost':
        if (e.f === me) this.toast(`Nossa sede caiu! Governo transferido para ${name(e.newHq)}.`, 'error', e.newHq);
        else this.toast(`A sede inimiga caiu! Crise no governo adversário.`, 'good', e.s);
        break;
      case 'ability':
        if (e.f !== me) this.toast(`Inteligência: ${e.f === 'bolso' ? 'Hitler' : 'Stalin'} ativou ${ABILITIES[e.id].name}!`, 'warn');
        break;
      case 'built':
        if (e.f === me) this.toast(`${BUILDING_DEFS[e.b].name} concluído(a) em ${name(e.s)}.`, 'good', e.s);
        break;
      case 'turn':
        if (e.phase === 'plan') {
          this.app.save(true);
          this.showHandoff(e.active);
        }
        this.renderMode();
        break;
      case 'gameover':
        this.showEnd(e.winner, e.reason);
        break;
      default:
        break;
    }
  }

  toast(msg: string, kind: 'info' | 'warn' | 'error' | 'alert' | 'good' = 'info', state?: number): void {
    const t = el(`<div class="toast ${kind}" ${state !== undefined ? `data-goto="${state}" title="Clique para ver no mapa"` : ''}>${esc(msg)}</div>`);
    this.toastsEl.prepend(t);
    while (this.toastsEl.children.length > 4) this.toastsEl.lastElementChild!.remove();
    setTimeout(() => t.remove(), kind === 'alert' ? 6000 : 3800);
  }

  // ================================================================== renderização
  private renderStatic(): void {
    const me = this.me;
    const d = FACTIONS[me];
    this.root.querySelector('[data-fac]')!.innerHTML = `<img src="${flagURI(me)}" alt=""><span>${esc(d.name)}</span>`;
    const [leader, cmd] = me === 'lula' ? (['lula', 'stalin'] as const) : (['bolsonaro', 'hitler'] as const);
    this.root.querySelector('[data-portraits]')!.innerHTML = `
      <div class="pt" title="${esc(d.leaderBio)}"><img src="${portraitURI(leader)}" alt="${esc(d.leader)}"><span>${esc(d.short)}</span></div>
      <div class="pt" title="${esc(d.commanderBio)}"><img src="${portraitURI(cmd)}" alt="${esc(d.commander)}"><span>${esc(d.commander)}</span></div>`;
    const keys = ['Z', 'C', 'V'];
    this.root.querySelector('[data-abilities]')!.innerHTML = d.abilities.map((a, i) => {
      const def = ABILITIES[a];
      return `<button class="btn ability" data-ability="${a}" title="${esc(def.desc)}\nCusto: ${RES_KEYS.filter((k) => def.cost[k]).map((k) => `${RES_NAME[k]} ${def.cost[k]}`).join(', ') || 'grátis'} · Recarga ${def.cooldown}s">
        <span class="cdv" data-cd="${a}"></span><span class="act" data-act-bar="${a}"></span><span class="lbl">${esc(def.name)}</span><span class="key">${keys[i]}</span></button>`;
    }).join('');
    this.renderMode();
  }

  private renderMode(): void {
    if (!this.scene) return;
    const sc = this.scene, w = this.sim.w;
    this.root.querySelectorAll<HTMLElement>('[data-spd]').forEach((b) => {
      const v = b.dataset.spd!;
      b.classList.toggle('active', v === 'pause' ? sc.userPaused : !sc.userPaused && +v === sc.speed);
    });
    const ml = this.root.querySelector<HTMLElement>('[data-modeline]')!;
    const m = sc.mode;
    ml.classList.toggle('hidden', m.kind === 'none');
    ml.textContent = m.kind === 'attackMove' ? 'ATAQUE-MOVIMENTO: clique no destino' : m.kind === 'ability' ? `${ABILITIES[m.id].name.toUpperCase()}: escolha o alvo` : m.kind === 'rally' ? 'PONTO DE ENCONTRO: clique no mapa' : '';
    this.root.querySelector('[data-paused]')!.classList.toggle('hidden', !sc.userPaused || !!w.winner);
    // modo local: faixa de turno
    const ban = this.root.querySelector<HTMLElement>('[data-banner]')!;
    if (w.turn) {
      ban.classList.remove('hidden', 'lula', 'bolso');
      if (w.turn.phase === 'plan') {
        ban.classList.add(w.turn.active);
        ban.innerHTML = `TURNO ${w.turn.n} — PLANEJAMENTO: ${esc(FACTIONS[w.turn.active].name.toUpperCase())} <button class="btn primary small" data-act="endplan">Concluir planejamento ▶</button>`;
        ban.querySelector('[data-act="endplan"]')!.addEventListener('click', () => {
          this.sim.endPlanning();
          this.scene.clearSelection();
          if (this.sim.w.turn?.phase === 'plan') this.showHandoff(this.sim.w.turn.active);
          this.renderMode();
        }, { once: true });
      } else {
        ban.innerHTML = `TURNO ${w.turn.n} — EXECUÇÃO SIMULTÂNEA <span data-exec></span>`;
      }
    } else ban.classList.add('hidden');
  }

  private tick(): void {
    if (!this.scene || !this.scene.sys.isActive()) return;
    const sim = this.sim, w = sim.w, me = this.me;
    const fr = w.factions[me];
    for (const k of RES_KEYS) {
      const v = this.root.querySelector(`[data-r="${k}"]`)!;
      v.textContent = fmt(fr.res[k]);
      v.parentElement!.classList.toggle('low', !fr.infinite && fr.res[k] < 40);
      const net = fr.income[k] - fr.upkeep[k];
      const d = this.root.querySelector(`[data-d="${k}"]`)!;
      d.textContent = fr.infinite ? '' : fmtRate(net);
      d.classList.toggle('neg', net < 0);
      v.parentElement!.title = `${RES_NAME[k]}: renda ${fmtRate(fr.income[k])}, manutenção ${fmtRate(-fr.upkeep[k])}`;
    }
    this.root.querySelector('[data-industry]')!.textContent = String(fr.industry);
    this.root.querySelector<HTMLElement>('[data-industry]')!.parentElement!.title = `Capacidade industrial ${fr.industry}: produção ${fr.prodMul.toFixed(2).replace('.', ',')}× mais rápida`;
    this.root.querySelector('[data-pop]')!.textContent = `${fr.pop}/${fr.infinite ? '∞' : fr.popCap}`;
    this.root.querySelector('[data-states]')!.textContent = `${sim.statesOf(me).length}/27`;
    this.root.querySelector('[data-time]')!.textContent = fmtTime(w.time);
    const ex = this.root.querySelector('[data-exec]');
    if (ex && w.turn) ex.textContent = `${Math.ceil(w.turn.t)} s`;

    // habilidades
    for (const a of fr.abilities) {
      const def = ABILITIES[a.id];
      const btn = this.root.querySelector<HTMLButtonElement>(`[data-ability="${a.id}"]`);
      if (!btn) continue;
      (btn.querySelector(`[data-cd="${a.id}"]`) as HTMLElement).style.width = `${(a.cd / def.cooldown) * 100}%`;
      (btn.querySelector(`[data-act-bar="${a.id}"]`) as HTMLElement).style.width = def.duration ? `${(a.active / def.duration) * 100}%` : '0';
      btn.classList.toggle('disabled', a.cd > 0 || !sim.canAfford(me, def.cost));
      const lbl = btn.querySelector('.key')!;
      lbl.textContent = a.cd > 0 ? `${Math.ceil(a.cd)}s` : ['Z', 'C', 'V'][FACTIONS[me].abilities.indexOf(a.id)];
    }
    const b = fr.buffs;
    const buffs: string[] = [];
    if (b.speedT > 0) buffs.push(`<span class="buff">Relâmpago ${Math.ceil(b.speedT)}s</span>`);
    if (b.coordT > 0) buffs.push(`<span class="buff">Coordenado ${Math.ceil(b.coordT)}s</span>`);
    if (b.prodT > 0) buffs.push(`<span class="buff">Esforço industrial ${Math.ceil(b.prodT)}s</span>`);
    if (b.defT > 0) buffs.push(`<span class="buff">Resistência ${Math.ceil(b.defT)}s</span>`);
    if (fr.crisisT > 0) buffs.push(`<span class="buff bad">Crise de governo ${Math.ceil(fr.crisisT)}s</span>`);
    if (!fr.infinite && fr.res.supplies <= 0) buffs.push(`<span class="buff bad">Sem suprimentos!</span>`);
    if (!fr.infinite && fr.res.fuel <= 0) buffs.push(`<span class="buff bad">Sem combustível!</span>`);
    const eb = w.factions[enemyOf(me)].buffs;
    if (eb.speedT > 0 || eb.prodT > 0 || eb.defT > 0 || eb.coordT > 0) buffs.push(`<span class="buff bad">Inimigo sob efeito de habilidade</span>`);
    this.root.querySelector('[data-buffs]')!.innerHTML = buffs.join('');

    this.renderObjectives();
    this.renderLog();
    this.renderSel();
    this.renderMinimap();
  }

  private renderObjectives(): void {
    const fr = this.sim.w.factions[this.me];
    const html = OBJECTIVES.map((o) => {
      const done = fr.objectives.includes(o.id);
      return `<div class="o ${done ? 'done' : ''}" title="${esc(o.desc)}"><span class="chk">${done ? '✔' : '◻'}</span><span><b>${esc(o.name)}</b> — ${esc(o.desc)}</span></div>`;
    }).join('') + `<div class="o"><span class="chk">★</span><span><b>Vitória</b> — domine os 27 territórios ou force a rendição (inimigo com ≤2 estados e você com ≥15).</span></div>`;
    const box = this.root.querySelector('[data-objs]')!;
    if (box.innerHTML !== html) box.innerHTML = html;
  }

  private renderLog(): void {
    const log = this.sim.w.log;
    const sig = `${log.length}:${log[log.length - 1]?.t ?? 0}`;
    if (sig === this.logSig) return;
    this.logSig = sig;
    const items = log.slice(-14).reverse().map((e) => {
      const cls = [e.kind, e.f && e.f !== 'neutral' ? e.f : ''].join(' ');
      return `<div class="e ${cls}" ${e.s !== undefined ? `data-logs="${e.s}"` : ''}><span class="t">${fmtTime(e.t)}</span>${esc(e.text)}</div>`;
    });
    this.root.querySelector('[data-log]')!.innerHTML = items.join('');
  }

  // ---------------------------------------------------------------- painel de seleção
  private renderSel(): void {
    if (!this.scene) return;
    const sc = this.scene;
    const box = this.root.querySelector<HTMLElement>('[data-sel]')!;
    const units = sc.selectedUnits();
    if (units.length) {
      const sig = 'u' + units.map((u) => u.id).join(',');
      if (sig !== this.selSig) { this.selSig = sig; box.innerHTML = this.unitsStatic(units); }
      this.unitsDynamic(box, units);
      return;
    }
    if (sc.selState >= 0) {
      const s = this.sim.w.states[sc.selState];
      const sig = `s${s.i}|${s.owner}|${this.me}|${BUILDING_ORDER.map((b) => s.b[b]).join('')}|${s.cons?.type ?? ''}|${s.queue.map((q) => q.type).join(',')}|${s.rally ? 1 : 0}`;
      if (sig !== this.selSig) { this.selSig = sig; box.innerHTML = this.stateStatic(s.i); }
      this.stateDynamic(box, s.i);
      return;
    }
    const sig = 'none' + this.sim.statesOf(this.me).join(',');
    if (sig !== this.selSig) { this.selSig = sig; box.innerHTML = this.overviewHTML(); }
  }

  private overviewHTML(): string {
    const sim = this.sim, me = this.me;
    const prod = sim.statesOf(me).filter((i) => { const b = sim.w.states[i].b; return b.barracks || b.factory || b.airbase; });
    return `<h3>${ICON.info} Centro de comando</h3>
      <div class="stat">Clique numa tropa ou <b>arraste</b> para selecionar; <b>botão direito</b> dá ordens. Clique num estado para construir e recrutar.</div>
      <div class="section-t">Estados produtores</div>
      <div class="row">${prod.map((i) => {
        const s = sim.w.states[i];
        const tags = [s.b.barracks && 'Q', s.b.factory && 'F', s.b.airbase && 'A'].filter(Boolean).join('·');
        return `<button class="btn small" data-sa="state" data-arg="${i}" title="${esc(sim.stateName(i))}">${esc(s.uf)} <span class="note">${tags}${s.queue.length ? ` (${s.queue.length})` : ''}</span></button>`;
      }).join('') || '<span class="note">Nenhum — construa um Quartel.</span>'}</div>`;
  }

  private unitsStatic(units: Unit[]): string {
    const app = this.app;
    if (units.length === 1) {
      const u = units[0], d = UNIT_DEFS[u.type];
      return `<h3><img src="${app.unitIcon(u.type, u.f)}" width="30" height="30" alt="">${esc(d.name)} <span class="owner-chip chip-${u.f}">${u.f === 'neutral' ? 'Neutro' : esc(FACTIONS[u.f].short)}</span></h3>
        <div class="stat" style="margin-bottom:6px">${esc(d.desc)}</div>
        <div class="bar"><i data-u="hpbar"></i></div>
        <div class="grid" style="margin-top:6px">
          <div class="stat">Vida: <b data-u="hp"></b></div>
          <div class="stat">Dano: <b>${d.damage}${d.splash ? ' (área)' : ''}</b> · Alcance: <b>${d.range}</b></div>
          <div class="stat">Velocidade: <b>${d.speed}</b> · Recarga: <b>${d.cooldown}s</b></div>
          <div class="stat">Abates: <b data-u="kills"></b></div>
          <div class="stat">Ordem: <b data-u="order"></b></div>
          <div class="stat">Suprimento: <b data-u="sup"></b></div>
          ${u.type === 'plane' ? `<div class="stat">Munição: <b data-u="ammo"></b> · Combustível: <b data-u="fuel"></b></div><div class="stat">Situação: <b data-u="phase"></b></div>` : ''}
        </div>`;
    }
    const counts = new Map<UnitType, number>();
    for (const u of units) counts.set(u.type, (counts.get(u.type) ?? 0) + 1);
    return `<h3>${units.length} unidades selecionadas</h3>
      <div class="bar"><i data-u="hpbar"></i></div>
      <div class="row">${[...counts].map(([t, n]) => `<span class="unit-chip" data-sa="onlytype" data-arg="${t}" title="Selecionar só ${esc(UNIT_DEFS[t].plural)}"><img src="${app.unitIcon(t, units[0].f)}" alt="">${n}× ${esc(UNIT_DEFS[t].plural)}</span>`).join('')}</div>
      <div class="stat" style="margin-top:6px">Vida total: <b data-u="hp"></b> · Poder estimado: <b data-u="power"></b> · Fora de suprimento: <b data-u="unsup"></b></div>
      <div class="row"><button class="btn small" data-sa="focus">${ICON.focus} Focar</button><span class="note">Dica: <span class="kbd">Ctrl</span>+<span class="kbd">1-9</span> cria um grupo.</span></div>`;
  }

  private unitsDynamic(box: HTMLElement, units: Unit[]): void {
    const set = (k: string, v: string) => { const n = box.querySelector(`[data-u="${k}"]`); if (n && n.textContent !== v) n.textContent = v; };
    const hp = units.reduce((s, u) => s + u.hp, 0), max = units.reduce((s, u) => s + u.maxHp, 0);
    const bar = box.querySelector<HTMLElement>('[data-u="hpbar"]');
    if (bar) bar.style.width = `${(hp / max) * 100}%`;
    if (units.length === 1) {
      const u = units[0], d = UNIT_DEFS[u.type];
      set('hp', `${Math.ceil(u.hp)}/${u.maxHp}`);
      set('kills', String(u.kills));
      set('order', u.type === 'plane' ? PLANE_PHASE[u.phase] : ORDER_LABEL[u.order.kind] ?? '');
      set('sup', u.supplied ? 'Abastecido' : 'SEM SUPRIMENTO (−40% dano, desgaste)');
      if (u.type === 'plane') { set('ammo', `${u.ammo}/${d.ammo}`); set('fuel', `${Math.ceil(u.fuel)}s`); set('phase', PLANE_PHASE[u.phase]); }
    } else {
      set('hp', `${Math.ceil(hp)}/${max}`);
      set('power', units.reduce((s, u) => s + UNIT_DEFS[u.type].power * (u.hp / u.maxHp), 0).toFixed(1));
      set('unsup', String(units.filter((u) => !u.supplied).length));
    }
  }

  private stateStatic(si: number): string {
    const sim = this.sim, me = this.me, app = this.app;
    const s = sim.w.states[si];
    const geo = sim.map.states[si];
    const info = geo.info;
    const owner = s.owner;
    const isHq = owner !== 'neutral' && sim.w.factions[owner].hq === si;
    const chip = `<span class="owner-chip chip-${owner}">${owner === 'neutral' ? 'Neutro' : esc(FACTIONS[owner].short)}</span>`;
    const yields = RES_KEYS.map((k) => `${RES_ICON[k]}${Math.round(info[k] * INCOME_SCALE[k] * 60)}`).join(' ');
    let html = `<h3>${esc(geo.name)} (${esc(s.uf)}) ${chip} ${isHq ? '<span class="owner-chip" style="background:#e3b84a;color:#000">★ Sede</span>' : ''}</h3>
      <div class="grid">
        <div class="stat">Capital: <b>${esc(info.capital)}</b> · Região: <b>${esc(info.region)}</b></div>
        <div class="stat">Guarnição: <b data-s="ghp"></b><div class="bar"><i data-s="gbar"></i></div></div>
        <div class="stat">Importância: <b>${info.imp}/10</b> · Indústria: <b>${info.industry}</b></div>
        <div class="stat">Rendimento/min: <b>${yields}</b></div>
        <div class="stat">Fortificação: <b>${s.b.fort}/3</b> · Espaços: <b>${sim.usedSlots(si)}/${sim.slots(si)}</b></div>
        <div class="stat">Situação: <b data-s="status"></b></div>
      </div>
      <div class="stat" style="margin-top:4px"><i>${esc(info.note)}</i></div>`;
    if (owner !== me) {
      const blds = BUILDING_ORDER.filter((b) => s.b[b] > 0).map((b) => BUILDING_DEFS[b].name + (b === 'fort' ? ` ${s.b.fort}` : '')).join(', ') || 'nenhuma';
      html += `<div class="section-t">Inteligência</div>
        <div class="grid"><div class="stat">Construções: <b>${esc(blds)}</b></div>
        <div class="stat">Forças hostis próximas: <b data-s="enemy"></b></div>
        <div class="stat">Ocupação: <b data-s="cap"></b></div></div>
        <div class="stat" style="margin-top:6px">Para conquistar: selecione tropas e clique com o botão direito na capital. Destrua a guarnição e mantenha Infantaria/Tanques na capital sem defensores.</div>`;
      return html;
    }
    html += `<div class="section-t">Construções</div><div class="recruit">${BUILDING_ORDER.map((b) => {
      const d = BUILDING_DEFS[b];
      const lvl = s.b[b];
      const c = sim.buildCost(si, b);
      return `<button class="btn rbtn" data-sa="build" data-arg="${b}" data-bk="${b}">
        <span class="top">${esc(d.name)}${d.maxLevel > 1 ? ` ${lvl}/${d.maxLevel}` : lvl ? ' ✔' : ''}</span>
        <span class="cost">${c ? costHTML(c, sim.w.factions[me].res, sim.w.factions[me].infinite) + ` <span>${ICON.clock}${d.time[lvl] ?? ''}s</span>` : 'Concluído'}</span></button>`;
    }).join('')}</div>`;
    if (s.cons) {
      html += `<div class="row"><span class="stat">Em obra: <b>${esc(BUILDING_DEFS[s.cons.type].name)}</b></span><div class="bar gold" style="flex:1"><i data-s="cons"></i></div><button class="btn small danger" data-sa="cancelb">Cancelar</button></div>`;
    }
    html += `<div class="section-t">Recrutamento</div><div class="recruit">${RECRUITABLE.map((t) => {
      const d = UNIT_DEFS[t];
      const c = sim.costOf(me, t);
      return `<button class="btn rbtn" data-sa="recruit" data-arg="${t}" data-rk="${t}">
        <span class="top"><img src="${app.unitIcon(t, me)}" alt="">${esc(d.name)}</span>
        <span class="cost">${costHTML(c, sim.w.factions[me].res, sim.w.factions[me].infinite)} <span>${ICON.clock}${d.buildTime}s</span> <span>${ICON.troops}${d.pop}</span></span></button>`;
    }).join('')}</div>`;
    html += `<div class="queue">${s.queue.map((q, i) => `<div class="qi" data-sa="cancelq" data-arg="${i}" title="${esc(UNIT_DEFS[q.type].name)} — clique para cancelar (reembolso total)"><img src="${app.unitIcon(q.type, me)}" alt=""><span class="p" data-q="${i}"></span></div>`).join('')}</div>
      <div class="row"><button class="btn small" data-sa="rally">${ICON.flag} Ponto de encontro</button>${s.rally ? `<button class="btn small" data-sa="clearrally">Remover ponto</button>` : ''}<button class="btn small" data-sa="focus">${ICON.focus} Focar</button></div>`;
    return html;
  }

  private stateDynamic(box: HTMLElement, si: number): void {
    const sim = this.sim, me = this.me;
    const s = sim.w.states[si];
    const set = (k: string, v: string) => { const n = box.querySelector(`[data-s="${k}"]`); if (n && n.textContent !== v) n.textContent = v; };
    set('ghp', `${Math.ceil(s.gHp)}/${s.gMax}${s.gHp <= 0 ? ' — NEUTRALIZADA' : ''}`);
    const gb = box.querySelector<HTMLElement>('[data-s="gbar"]');
    if (gb) gb.style.width = `${(s.gHp / s.gMax) * 100}%`;
    const fighting = sim.w.time - s.lastCombatT < 3;
    set('status', `${s.owner === 'neutral' ? 'Neutro' : s.connected ? 'Conectado à sede' : 'ISOLADO (rende 50%)'}${fighting ? ' · EM COMBATE' : ''}`);
    const c = sim.capital(si);
    set('enemy', sim.hostilePowerNear(c.x, c.y, 280, me).toFixed(1));
    set('cap', s.capF ? `${FACTIONS[s.capF as Faction]?.short ?? ''} ${Math.floor(s.capP)}%` : 'nenhuma');
    const cons = box.querySelector<HTMLElement>('[data-s="cons"]');
    if (cons && s.cons) cons.style.width = `${(s.cons.t / s.cons.total) * 100}%`;
    s.queue.forEach((q, i) => { const p = box.querySelector<HTMLElement>(`[data-q="${i}"]`); if (p) p.style.width = i === 0 ? `${(q.t / q.total) * 100}%` : '0'; });
    if (s.owner !== me) return;
    const fr = sim.w.factions[me];
    box.querySelectorAll<HTMLButtonElement>('[data-rk]').forEach((b) => {
      const err = sim.recruitCheck(me, si, b.dataset.rk as UnitType);
      b.disabled = !!err;
      b.title = err ?? UNIT_DEFS[b.dataset.rk as UnitType].desc;
      const cost = sim.costOf(me, b.dataset.rk as UnitType);
      b.querySelectorAll<HTMLElement>('[data-ck]').forEach((sp) => sp.classList.toggle('no', !fr.infinite && fr.res[sp.dataset.ck as ResKey] < cost[sp.dataset.ck as ResKey]));
    });
    box.querySelectorAll<HTMLButtonElement>('[data-bk]').forEach((b) => {
      const err = sim.buildCheck(me, si, b.dataset.bk as BuildingType);
      b.disabled = !!err;
      b.title = err ?? BUILDING_DEFS[b.dataset.bk as BuildingType].desc;
    });
  }

  // ---------------------------------------------------------------- minimapa
  private renderMinimap(): void {
    const cv = this.root.querySelector<HTMLCanvasElement>('[data-minimap]')!;
    if (!cv.offsetParent) return;
    const sim = this.sim, w = sim.w, map = sim.map;
    const W = cv.width, H = cv.height;
    const sx = W / map.width, sy = H / map.height;
    const ownersSig = w.states.map((s) => s.owner[0]).join('');
    if (ownersSig !== this.ownersSig) {
      this.ownersSig = ownersSig;
      this.mmBg.width = W;
      this.mmBg.height = H;
      const g = this.mmBg.getContext('2d')!;
      g.fillStyle = '#08121a';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#1c211d';
      for (const n of map.neighbors) { g.beginPath(); for (let i = 0; i < n.ring.length; i += 2) g.lineTo(n.ring[i] * sx, n.ring[i + 1] * sy); g.fill(); }
      const order = map.states.map((s) => s.i).sort((a, b) => map.states[b].area - map.states[a].area);
      for (const si of order) {
        const o = w.states[si].owner;
        const col = o === 'neutral' ? NEUTRAL_COLOR : FACTIONS[o].color;
        g.fillStyle = '#' + col.toString(16).padStart(6, '0');
        g.globalAlpha = 0.75;
        g.strokeStyle = 'rgba(0,0,0,.6)';
        g.lineWidth = 1;
        for (const r of map.states[si].rings) {
          g.beginPath();
          for (let i = 0; i < r.length; i += 2) g.lineTo(r[i] * sx, r[i + 1] * sy);
          g.closePath();
          g.fill();
          g.stroke();
        }
        g.globalAlpha = 1;
      }
    }
    const g = cv.getContext('2d')!;
    g.drawImage(this.mmBg, 0, 0);
    const t = performance.now() / 1000;
    for (const s of w.states) {
      const c = sim.capital(s.i);
      if (w.time - s.lastCombatT < 3) {
        g.strokeStyle = `rgba(255,80,60,${0.5 + 0.5 * Math.sin(t * 8)})`;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(c.x * sx, c.y * sy, 9, 0, Math.PI * 2);
        g.stroke();
      }
      g.fillStyle = '#f2ecd2';
      g.fillRect(c.x * sx - 1.5, c.y * sy - 1.5, 3, 3);
    }
    for (const u of w.units) {
      g.fillStyle = u.f === this.me ? '#9dffb8' : u.f === 'neutral' ? '#d9d2a8' : u.f === 'lula' ? '#ff6b5e' : '#6fb2ff';
      g.fillRect(u.x * sx - 1.5, u.y * sy - 1.5, 3, 3);
    }
    const v = this.scene.cameras.main.worldView;
    g.strokeStyle = '#fff';
    g.lineWidth = 2;
    g.strokeRect(v.x * sx, v.y * sy, v.width * sx, v.height * sy);
  }

  // ================================================================== modais
  intro(): void {
    const w = this.sim.w;
    const me = this.me;
    const d = FACTIONS[me];
    const isCamp = w.settings.mode === 'campanha';
    const body = `<div style="display:grid;grid-template-columns:120px 1fr;gap:14px;align-items:start">
      <img src="${portraitURI(me === 'lula' ? 'stalin' : 'hitler')}" style="width:120px;border-radius:6px;border:1px solid #000" alt="">
      <div><div class="briefing">${esc(d.commander)} (caricatura) se apresenta ao ${esc(d.leader)}: <i>${esc(d.motto)}</i></div>
      <p>Modo: <b>${isCamp ? 'Campanha' : w.settings.mode === 'sandbox' ? 'Sandbox' : 'Batalha rápida'}</b> · Dificuldade da IA: <b>${DIFFICULTY_LABEL[w.settings.difficulty]}</b> · Sua sede: <b>${esc(this.sim.stateName(w.factions[me].hq))}</b></p>
      <ul><li>Clique num <b>estado seu</b> para construir e recrutar.</li><li>Selecione tropas e use o <b>botão direito</b> numa capital inimiga ou neutra para atacá-la.</li>
      <li>Destrua a guarnição e ocupe a capital com Infantaria/Tanques para conquistar o estado.</li><li>Fique de olho nas <b>setas tracejadas</b>: são ofensivas inimigas detectadas.</li></ul></div></div>`;
    this.scene.userPaused = true;
    this.renderMode();
    const { back } = modal(this.app.ui, isCamp ? 'Briefing da campanha' : 'Ordens iniciais', body, `<button class="btn" data-help>Como jogar</button><button class="btn primary" data-close>Ao combate!</button>`);
    back.querySelector('[data-help]')!.addEventListener('click', () => modal(this.app.ui, 'Como jogar', howToPlayHTML(), `<button class="btn primary" data-close>Entendi</button>`));
    const obs = new MutationObserver(() => { if (!back.isConnected) { obs.disconnect(); this.scene.userPaused = false; this.renderMode(); } });
    obs.observe(this.app.ui, { childList: true });
  }

  private showPause(): void {
    if (this.pauseOpen || this.endShown) return;
    this.pauseOpen = true;
    const wasPaused = this.scene.userPaused;
    this.scene.userPaused = true;
    this.renderMode();
    const body = `<div style="display:flex;flex-direction:column;gap:8px">
      <button class="btn primary" data-close>${ICON.play} Continuar</button>
      <button class="btn" data-p="save">${ICON.save} Salvar partida</button>
      <button class="btn" data-p="report">${ICON.report} Relatório de batalha</button>
      <button class="btn" data-p="trade">${ICON.trade} Mercado de recursos</button>
      <button class="btn" data-p="settings">${ICON.gear} Configurações</button>
      <button class="btn" data-p="help">${ICON.info} Como jogar</button>
      <button class="btn danger" data-p="surrender">${ICON.flag} Render-se</button>
      <button class="btn" data-p="menu">${ICON.home} Sair para o menu</button></div>`;
    const { back, close } = modal(this.app.ui, 'Pausa', body, '', true);
    const done = () => { this.pauseOpen = false; this.scene.userPaused = wasPaused; this.renderMode(); };
    const obs = new MutationObserver(() => { if (!back.isConnected) { obs.disconnect(); done(); } });
    obs.observe(this.app.ui, { childList: true });
    back.addEventListener('click', (e) => {
      const p = (e.target as HTMLElement).closest<HTMLElement>('[data-p]')?.dataset.p;
      if (!p) return;
      if (p === 'save') this.app.save();
      if (p === 'report') this.showReport();
      if (p === 'trade') this.showTrade();
      if (p === 'settings') this.app.showSettings();
      if (p === 'help') modal(this.app.ui, 'Como jogar', howToPlayHTML(), `<button class="btn primary" data-close>Entendi</button>`);
      if (p === 'surrender') {
        if (confirm('Assinar a rendição? A partida termina em derrota.')) { close(); this.sim.surrender(this.me); }
      }
      if (p === 'menu') {
        if (this.sim.w.settings.mode !== 'sandbox' && !this.sim.w.winner) this.app.save(true);
        close();
        this.app.toMenu();
      }
    });
  }

  private showTrade(): void {
    const me = this.me;
    const fr = this.sim.w.factions[me];
    const state = { from: 'supplies' as ResKey, to: 'money' as ResKey };
    const opts = (name: string, cur: ResKey) => `<div class="seg" data-tr="${name}">${RES_KEYS.map((k) => `<button class="btn ${k === cur ? 'active' : ''}" data-v="${k}">${RES_ICON[k]} ${RES_NAME[k]}</button>`).join('')}</div>`;
    const body = `<p>Troque estoques parados pelo recurso que falta. Taxa: <b>${1 / TRADE_RATE} → 1</b>.</p>
      <div class="opts"><label>Vender</label>${opts('from', state.from)}<label>Comprar</label>${opts('to', state.to)}</div>
      <div class="row" style="margin-top:12px">${[50, 100, 250, 500].map((n) => `<button class="btn" data-amt="${n}">Vender ${n}</button>`).join('')}</div>
      <p class="note" data-trnote></p>`;
    const { back } = modal(this.app.ui, 'Mercado de recursos', body, `<button class="btn primary" data-close>Fechar</button>`, true);
    const note = () => { back.querySelector('[data-trnote]')!.textContent = `Estoque: ${RES_KEYS.map((k) => `${RES_NAME[k]} ${fmt(fr.res[k])}`).join(' · ')}`; };
    note();
    back.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const seg = t.closest<HTMLElement>('[data-tr] [data-v]');
      if (seg) {
        const name = seg.parentElement!.dataset.tr as 'from' | 'to';
        state[name] = seg.dataset.v as ResKey;
        seg.parentElement!.querySelectorAll('.btn').forEach((b) => b.classList.toggle('active', b === seg));
      }
      const amt = t.closest<HTMLElement>('[data-amt]')?.dataset.amt;
      if (amt) {
        const err = this.sim.trade(me, state.from, state.to, +amt);
        if (err) { this.toast(err, 'error'); audio.play('error'); }
        else { this.toast(`Vendido ${amt} de ${RES_NAME[state.from]} por ${Math.floor(+amt * TRADE_RATE)} de ${RES_NAME[state.to]}.`, 'good'); }
        note();
      }
    });
  }

  private statsTable(): string {
    const w = this.sim.w;
    const row = (label: string, f: (x: Faction) => string) => `<tr><td>${label}</td><td>${f('lula')}</td><td>${f('bolso')}</td></tr>`;
    const st = (x: Faction) => w.factions[x].stats;
    return `<table><tr><th></th><th style="color:#ff6b5e">${esc(FACTIONS.lula.name)}</th><th style="color:#6fb2ff">${esc(FACTIONS.bolso.name)}</th></tr>
      ${row('Estados dominados', (x) => String(this.sim.statesOf(x).length))}
      ${row('Tropas em campo', (x) => String(this.sim.unitsOf(x).length))}
      ${row('Unidades produzidas', (x) => String(st(x).produced))}
      ${row('Unidades perdidas', (x) => String(st(x).lost))}
      ${row('Abates', (x) => String(st(x).killed))}
      ${row('Estados capturados', (x) => String(st(x).captured))}
      ${row('Estados perdidos', (x) => String(st(x).statesLost))}
      ${row('Dano causado', (x) => fmt(st(x).damage))}
      ${row('Dinheiro investido', (x) => fmt(st(x).spent))}
      ${row('Objetivos cumpridos', (x) => `${w.factions[x].objectives.length}/${OBJECTIVES.length}`)}</table>`;
  }

  private showReport(): void {
    const w = this.sim.w;
    const log = w.log.slice(-40).reverse().map((e) => `<li><span class="note">${fmtTime(e.t)}</span> ${esc(e.text)}</li>`).join('');
    const regions = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'].map((r) => {
      const sts = this.sim.map.states.filter((s) => s.info.region === r);
      const cnt = (o: string) => sts.filter((s) => w.states[s.i].owner === o).length;
      return `<tr><td>${r}</td><td>${cnt('lula')}</td><td>${cnt('bolso')}</td><td>${cnt('neutral')}</td></tr>`;
    }).join('');
    const body = `<h3>Situação da guerra · ${fmtTime(w.time)}</h3>${this.statsTable()}
      <h3>Controle por região</h3><table><tr><th>Região</th><th>Lula</th><th>Bolsonaro</th><th>Neutros</th></tr>${regions}</table>
      <h3>Últimos acontecimentos</h3><ul>${log}</ul>`;
    modal(this.app.ui, 'Relatório de batalha', body, `<button class="btn primary" data-close>Fechar</button>`);
  }

  private showHandoff(f: Faction): void {
    this.handoffEl?.remove();
    const d = FACTIONS[f];
    const h = el(`<div class="handoff"><img class="f" src="${flagURI(f)}" alt="">
      <h1 style="color:${d.colorCss}">VEZ DO ${esc(d.name.toUpperCase())}</h1>
      <p>Turno ${this.sim.w.turn?.n ?? 1}. Passe o dispositivo para o comandante de ${esc(d.short)}.<br>O outro jogador não deve olhar a tela durante o planejamento.</p>
      <button class="btn primary">Estou pronto</button></div>`);
    h.querySelector('button')!.addEventListener('click', () => {
      h.remove();
      this.handoffEl = null;
      this.scene.me = f;
      this.scene.clearSelection();
      const c = this.sim.capital(this.sim.w.factions[f].hq);
      this.scene.centerOn(c.x, c.y);
      this.renderStatic();
      this.selSig = '';
      this.tick();
    });
    this.app.ui.appendChild(h);
    this.handoffEl = h;
  }

  private swapSide(): void {
    const w = this.sim.w;
    const old = this.me;
    const nf = enemyOf(old);
    w.factions[nf].infinite = true;
    w.factions[nf].control = 'human';
    w.factions[old].control = w.settings.enemyAI ? 'ai' : 'none';
    if (w.factions[old].control === 'ai' && !w.ai[old]) w.ai[old] = newAIState();
    w.ai[nf] = null;
    this.scene.me = nf;
    this.scene.clearSelection();
    this.renderStatic();
    this.toast(`Agora você controla o ${FACTIONS[nf].name}.`);
  }

  private showEnd(winner: Faction, reason: string): void {
    if (this.endShown) return;
    this.endShown = true;
    const w = this.sim.w;
    const mode = w.settings.mode;
    const local = mode === 'local';
    const won = local || winner === w.settings.player;
    if (mode === 'campanha' || mode === 'rapida') { recordResult(won); deleteSave(mode); }
    if (mode === 'local') deleteSave('local');
    audio.playMusic(null);
    audio.play(won ? 'victory' : 'defeat');
    const title = local ? `VITÓRIA DO ${FACTIONS[winner].name.toUpperCase()}` : won ? 'VITÓRIA' : 'DERROTA';
    const body = `<div class="end-hero ${won ? 'win' : 'lose'}"><img src="${flagURI(winner)}" width="120" style="border:2px solid #000" alt=""><h1>${esc(title)}</h1>
      <p>${esc(reason)}</p><p class="note">Duração: ${fmtTime(w.time)}</p></div>${this.statsTable()}`;
    const { back } = modal(this.app.ui, 'Fim da guerra', body, `<button class="btn" data-close>Ver o mapa</button><button class="btn primary" data-menu>${ICON.home} Menu principal</button>`);
    back.querySelector('[data-menu]')!.addEventListener('click', () => this.app.toMenu());
  }
}
