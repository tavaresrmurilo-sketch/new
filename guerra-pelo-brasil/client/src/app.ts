// Controlador da aplicação: menus, início/carregamento de partidas, salvamento.
import Phaser from 'phaser';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { Game } from '@shared/sim/game';
import { defaultSettings } from '@shared/sim/setup';
import { FACTIONS, ABILITIES, DIFFICULTY_LABEL } from '@shared/data/factions';
import { DISTRIBUTIONS, DISTRIBUTION_KEYS } from '@shared/data/states';
import { unitKey } from './render/textures';
import { audio } from './audio/audio';
import {
  loadSettings, saveSettings, readSave, readMeta, writeSave, deleteSave, readRecord, effectiveQuality, type Settings,
} from './persist/storage';
import { portraitURI, flagURI, ICON } from './ui/art';
import { el, esc, fmtTime, modal } from './ui/dom';
import { howToPlayHTML, SATIRE_NOTE } from './ui/help';
import { HUD } from './ui/hud';
import { LocalDriver, type Driver } from './driver';
import { Online } from './online/online';
import type { OnlineMatch } from './online/match';
import type { Difficulty, Distribution, Faction, GameMode, MatchSettings, Owner, UnitType } from '@shared/sim/types';

const MODE_LABEL: Record<GameMode, string> = { campanha: 'Campanha', rapida: 'Batalha rápida', local: 'Dois jogadores', sandbox: 'Sandbox', online: 'Online' };

const BRIEFING: Record<Faction, string> = {
  lula: `Num universo paralelo e absurdo, a eleição mais polarizada da história rachou o Brasil ao meio.
    Do Nordeste, o <b>Exército Lula</b> ergue fábricas e trincheiras. No comando militar, uma caricatura ressuscitada de
    <b>Josef Stalin</b> promete “planos quinquenais em cinco minutos” e fuma o cachimbo mais exagerado do continente.
    Sua sede é <b>Recife</b>. Expanda-se pelos estados neutros, garanta o aço de Minas e do Pará, tome <b>Brasília</b>
    e derrube a sede inimiga em <b>Curitiba</b>.`,
  bolso: `Num universo paralelo e absurdo, a eleição mais polarizada da história rachou o Brasil ao meio.
    Do Sul e do Centro-Oeste, o <b>Exército Bolsonaro</b> mobiliza blindados e o agronegócio. No comando militar, uma caricatura
    ressuscitada de <b>Adolf Hitler</b> grita ordens incompreensíveis e insiste que o mapa do Brasil é a Europa.
    Sua sede é <b>Curitiba</b>. Seus tanques precisam de combustível: tome o petróleo do Rio e de São Paulo, capture
    <b>Brasília</b> e derrube a sede inimiga em <b>Recife</b>.`,
};

export class App {
  phaser!: Phaser.Game;
  settings: Settings = loadSettings();
  ui: HTMLElement;
  faction: Faction = 'lula';
  difficulty: Difficulty = 'normal';
  sim: Game | null = null;
  hud: HUD | null = null;
  private menuEl: HTMLElement | null = null;
  private iconCache = new Map<string, string>();
  private splashShown = false;
  readonly online: Online;
  /** código de convite recebido pela URL (?sala=BR-XXXXX) */
  private inviteCode = new URLSearchParams(location.search).get('sala')?.toUpperCase() ?? '';

  constructor() {
    this.ui = document.getElementById('ui')!;
    this.online = new Online(this);
    audio.setVolumes(this.settings.music, this.settings.sfx);
    document.body.classList.toggle('hc', !!this.settings.highContrast);
    const unlock = () => { audio.unlock(); };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    // sons de interface em todos os botões
    this.ui.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('button')) audio.play('click'); });
    this.ui.addEventListener('pointerover', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b && !(e.relatedTarget as HTMLElement | null)?.closest?.('button')) audio.play('hover');
    });
  }

  boot(): void {
    // limite de quadros: qualidade baixa = 30 fps; ?fps=N força um valor (PCs fracos e testes automatizados)
    const fpsParam = Number(new URLSearchParams(location.search).get('fps'));
    const fpsLimit = fpsParam > 0 ? Math.min(60, fpsParam) : effectiveQuality(this.settings) === 'baixo' ? 30 : 0;
    // ?renderer=canvas força o Canvas 2D (fallback para PCs/navegadores sem WebGL)
    const canvasOnly = new URLSearchParams(location.search).get('renderer') === 'canvas';
    this.phaser = new Phaser.Game({
      type: canvasOnly ? Phaser.CANVAS : Phaser.AUTO,
      fps: fpsLimit ? { limit: fpsLimit, target: fpsLimit } : undefined,
      parent: 'game',
      backgroundColor: '#0b100e',
      scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
      render: { antialias: true, powerPreference: 'default' },
      input: { activePointers: 3 },
      scene: [MenuScene, GameScene],
      banner: false,
    });
    this.phaser.events.once(Phaser.Core.Events.READY, () => this.showMainMenu());
  }

  // ================================================================== utilidades
  unitIcon(type: UnitType, f: Owner): string {
    const key = unitKey(type, f);
    let v = this.iconCache.get(key);
    if (!v) {
      if (!this.phaser.textures.exists(key)) return '';
      v = this.phaser.textures.getBase64(key) as string;
      this.iconCache.set(key, v);
    }
    return v;
  }

  applySettings(): void {
    saveSettings(this.settings);
    audio.setVolumes(this.settings.music, this.settings.sfx);
    document.body.classList.toggle('hc', !!this.settings.highContrast);
  }

  private clearMenu(): void {
    this.menuEl?.remove();
    this.menuEl = null;
    this.ui.querySelectorAll('.modal-back, .splash').forEach((n) => n.remove());
  }

  // ================================================================== menu principal
  showMainMenu(): void {
    this.clearMenu();
    if (this.phaser?.scene.isPaused('menu')) this.phaser.scene.resume('menu');
    audio.playMusic('menu');
    const meta = readMeta('campanha');
    const rec = readRecord();
    const card = (f: Faction) => {
      const d = FACTIONS[f];
      const [leader, cmd] = f === 'lula' ? (['lula', 'stalin'] as const) : (['bolsonaro', 'hitler'] as const);
      return `<div class="fcard ${f} ${this.faction === f ? 'sel' : ''}" data-faction="${f}" role="button" tabindex="0" aria-label="Escolher ${esc(d.name)}">
        <div class="tag">SELECIONADO</div>
        <div class="portraits">
          <div class="portrait"><img src="${portraitURI(leader)}" alt="Caricatura de ${esc(d.leader)}"><div class="cap"><b>${esc(d.leader)}</b>${esc(d.leaderTitle)}</div></div>
          <div class="portrait"><img src="${portraitURI(cmd)}" alt="Caricatura de ${esc(d.commander)}"><div class="cap"><b>${esc(d.commander)}</b>Comandante (caricatura)</div></div>
        </div>
        <div class="info">
          <div class="fname"><img src="${flagURI(f)}" alt="">${esc(d.name)}</div>
          <div class="doct">${esc(d.doctrine)}</div>
          <ul>${d.passives.map((p) => `<li>${esc(p)}</li>`).join('')}<li>Habilidades: ${d.abilities.map((a) => esc(ABILITIES[a].name)).join(', ')}</li></ul>
        </div>
      </div>`;
    };
    const root = el(`<div class="menu-root">
      <div class="menu-left">
        <div class="logo"><div class="t1">GUERRA <span class="r">PELO</span><br><span class="b">BRASIL</span></div>
          <div class="t2">CONQUISTA TOTAL</div><div class="t3">Estratégia militar em tempo real · sátira política fictícia</div></div>
        <button class="btn menu-btn primary" data-act="campaign" style="animation-delay:.05s">${ICON.play} Jogar campanha <span class="sub">${meta ? `salva: ${esc(meta.label)}` : 'nova guerra contra a IA'}</span></button>
        <button class="btn menu-btn" data-act="quick" style="animation-delay:.1s">${ICON.swords} Batalha rápida <span class="sub">partida configurável</span></button>
        <button class="btn menu-btn online" data-act="online" style="animation-delay:.15s">${ICON.map} Multiplayer online <span class="sub">até 5v5 · <span data-netstatus data-s="${this.online.net.status}">${esc(this.online.statusText())}</span></span></button>
        <button class="btn menu-btn" data-act="local" style="animation-delay:.2s">${ICON.troops} Multiplayer local <span class="sub">2 jogadores · turnos</span></button>
        <button class="btn menu-btn" data-act="sandbox" style="animation-delay:.25s">${ICON.flag} Sandbox <span class="sub">recursos ilimitados</span></button>
        <button class="btn menu-btn" data-act="help" style="animation-delay:.3s">${ICON.info} Como jogar</button>
        <button class="btn menu-btn" data-act="settings" style="animation-delay:.35s">${ICON.gear} Configurações</button>
        <button class="btn small exit-link" data-act="exit">${ICON.close} Sair</button>
      </div>
      <div class="menu-right">
        <div class="faction-cards">${card('lula')}${card('bolso')}</div>
        <div class="disclaimer-line">Sátira fictícia — não glorifica nazismo, stalinismo ou qualquer político. · Recorde: ${rec.wins} vitória(s), ${rec.losses} derrota(s)</div>
      </div>
    </div>`);
    root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const fc = t.closest<HTMLElement>('[data-faction]');
      if (fc) {
        this.faction = fc.dataset.faction as Faction;
        root.querySelectorAll('.fcard').forEach((c) => c.classList.toggle('sel', c === fc));
        audio.play('select');
        return;
      }
      const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'campaign') this.showPlay('campanha');
      else if (act === 'quick') this.showPlay('rapida');
      else if (act === 'sandbox') this.showPlay('sandbox');
      else if (act === 'online') this.online.openMenu();
      else if (act === 'local') this.showLocal();
      else if (act === 'settings') this.showSettings();
      else if (act === 'help') this.showHelp();
      else if (act === 'exit') this.exitGame();
    });
    root.addEventListener('keydown', (e) => {
      const fc = (e.target as HTMLElement).closest<HTMLElement>('[data-faction]');
      if (fc && (e.key === 'Enter' || e.key === ' ')) fc.click();
    });
    this.ui.appendChild(root);
    this.menuEl = root;
    this.online.probe();
    if (!this.splashShown) this.showSplash();
    else if (this.inviteCode) { const c = this.inviteCode; this.inviteCode = ''; this.online.openMenu('entrar', c); }
  }

  hideMainMenu(): void {
    this.menuEl?.remove();
    this.menuEl = null;
    // o fundo animado do menu fica coberto pelo lobby: pausa para poupar CPU
    if (this.phaser.scene.isActive('menu')) this.phaser.scene.pause('menu');
  }

  scene(): GameScene | null {
    return this.sim || this.online.match ? (this.phaser.scene.getScene('game') as GameScene) : null;
  }

  private showSplash(): void {
    this.splashShown = true;
    const s = el(`<div class="splash"><div class="box">
      <h1>GUERRA PELO BRASIL</h1>
      <p><b>Aviso:</b> ${esc(SATIRE_NOTE)}</p>
      <button class="btn primary" data-ok>Entendi — ir para o menu</button></div></div>`);
    s.querySelector('[data-ok]')!.addEventListener('click', () => {
      audio.unlock();
      audio.playMusic('menu');
      s.remove();
      if (this.inviteCode) { const c = this.inviteCode; this.inviteCode = ''; this.online.openMenu('entrar', c); }
    });
    this.ui.appendChild(s);
  }

  // ================================================================== telas
  private seg<T extends string>(name: string, options: [T, string][], current: T): string {
    return `<div class="seg" data-seg="${name}">${options.map(([v, l]) => `<button class="btn ${v === current ? 'active' : ''}" data-v="${v}">${esc(l)}</button>`).join('')}</div>`;
  }

  private bindSegs(root: HTMLElement, onChange: (name: string, v: string) => void): void {
    root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-seg] [data-v]');
      if (!b) return;
      const seg = b.parentElement!;
      seg.querySelectorAll('.btn').forEach((x) => x.classList.toggle('active', x === b));
      onChange(seg.dataset.seg!, b.dataset.v!);
    });
  }

  showPlay(initial: 'campanha' | 'rapida' | 'sandbox' = 'campanha'): void {
    const diffOpts: [Difficulty, string][] = (['facil', 'normal', 'dificil', 'insano'] as Difficulty[]).map((d) => [d, DIFFICULTY_LABEL[d]]);
    const distOpts: [Distribution, string][] = DISTRIBUTION_KEYS.map((d) => [d, DISTRIBUTIONS[d].label]);
    const state = {
      mode: initial as 'campanha' | 'rapida' | 'sandbox',
      fog: 'nao',
      extras: 'sim',
      faction: this.faction,
      difficulty: this.difficulty,
      distribution: 'eleitoral' as Distribution,
      startRes: 'normais' as MatchSettings['startRes'],
      income: '1',
      sandboxAI: 'off',
    };
    const body = `
      <div class="mode-cards">
        <div class="mode-card sel" data-mode="campanha"><h4>Campanha</h4><p>Conquiste o Brasil estado por estado contra a IA, com objetivos e salvamento automático.</p></div>
        <div class="mode-card" data-mode="rapida"><h4>Batalha rápida</h4><p>Partida avulsa com dificuldade, mapa inicial, recursos e ritmo configuráveis.</p></div>
        <div class="mode-card" data-mode="sandbox"><h4>Sandbox</h4><p>Recursos ilimitados e produção acelerada para testar unidades e batalhas.</p></div>
      </div>
      <h3>Facção</h3>${this.seg('faction', [['lula', FACTIONS.lula.name], ['bolso', FACTIONS.bolso.name]], state.faction)}
      <div data-pane="campanha">
        <h3>Dificuldade da IA</h3>${this.seg('difficulty', diffOpts, state.difficulty)}
        <h3>Briefing</h3><div class="briefing" data-brief>${BRIEFING[state.faction]}</div>
      </div>
      <div data-pane="rapida" class="hidden"><div class="opts" style="margin-top:12px">
        <label>Dificuldade</label>${this.seg('difficulty', diffOpts, state.difficulty)}
        <label>Distribuição territorial</label>${this.seg('distribution', distOpts, state.distribution)}
        <label>Recursos iniciais</label>${this.seg('startRes', [['baixos', 'Baixos'], ['normais', 'Normais'], ['altos', 'Altos']], state.startRes)}
        <label>Ritmo da economia</label>${this.seg('income', [['0.75', 'Lento'], ['1', 'Normal'], ['1.5', 'Rápido']], state.income)}
        <label>Névoa de guerra</label>${this.seg('fog', [['nao', 'Desligada'], ['sim', 'Ligada']], state.fog)}
        <label>Eventos e moral</label>${this.seg('extras', [['sim', 'Ligados'], ['nao', 'Desligados']], state.extras)}
      </div></div>
      <div data-pane="sandbox" class="hidden"><div class="opts" style="margin-top:12px">
        <label>IA do oponente</label>${this.seg('sandboxAI', [['off', 'Desligada'], ['facil', 'Fácil'], ['normal', 'Normal'], ['dificil', 'Difícil'], ['insano', 'Insano']], state.sandboxAI)}
        <label>Distribuição territorial</label>${this.seg('distribution', distOpts, state.distribution)}
      </div><p class="note">No sandbox seus recursos são ilimitados e a produção é 6× mais rápida. Use “Trocar lado” no jogo para posicionar tropas inimigas.</p></div>`;
    const foot = `<span class="note" data-savednote style="margin-right:auto"></span>
      <button class="btn" data-continue>Continuar salva</button><button class="btn primary" data-start>${ICON.play} Iniciar</button>`;
    const { back, close } = modal(this.ui, 'Jogar', body, foot);
    const refresh = () => {
      back.querySelectorAll<HTMLElement>('[data-pane]').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== state.mode));
      back.querySelectorAll<HTMLElement>('.mode-card').forEach((c) => c.classList.toggle('sel', c.dataset.mode === state.mode));
      back.querySelector('[data-brief]')!.innerHTML = BRIEFING[state.faction];
      const meta = readMeta(state.mode);
      (back.querySelector('[data-continue]') as HTMLButtonElement).classList.toggle('hidden', !meta);
      back.querySelector('[data-savednote]')!.textContent = meta ? `Salva: ${meta.label}` : '';
      const start = back.querySelector('[data-start]')!;
      start.innerHTML = `${ICON.play} ${state.mode === 'campanha' ? 'Iniciar campanha' : state.mode === 'rapida' ? 'Iniciar batalha' : 'Abrir sandbox'}`;
    };
    back.addEventListener('click', (e) => {
      const mc = (e.target as HTMLElement).closest<HTMLElement>('[data-mode]');
      if (mc) { state.mode = mc.dataset.mode as typeof state.mode; refresh(); }
      if ((e.target as HTMLElement).closest('[data-continue]')) { close(); this.continueMode(state.mode); }
      if ((e.target as HTMLElement).closest('[data-start]')) {
        if (state.mode === 'campanha' && readMeta('campanha') && !confirm('Iniciar uma nova campanha substituirá a campanha salva. Continuar?')) return;
        close();
        this.faction = state.faction;
        this.difficulty = state.difficulty;
        const s = defaultSettings({
          mode: state.mode,
          player: state.faction,
          difficulty: state.mode === 'sandbox' ? (state.sandboxAI === 'off' ? 'normal' : (state.sandboxAI as Difficulty)) : state.difficulty,
          distribution: state.mode === 'campanha' ? 'eleitoral' : state.distribution,
          startRes: state.mode === 'rapida' ? state.startRes : 'normais',
          incomeMul: state.mode === 'rapida' ? +state.income : 1,
          enemyAI: state.mode !== 'sandbox' || state.sandboxAI !== 'off',
          fog: state.mode === 'rapida' && state.fog === 'sim',
          events: state.mode !== 'rapida' || state.extras === 'sim',
          morale: state.mode !== 'rapida' || state.extras === 'sim',
        });
        this.startMatch(s);
      }
    });
    this.bindSegs(back, (name, v) => {
      if (name === 'faction') state.faction = v as Faction;
      if (name === 'difficulty') {
        state.difficulty = v as Difficulty;
        back.querySelectorAll<HTMLElement>('[data-seg="difficulty"] [data-v]').forEach((b) => b.classList.toggle('active', b.dataset.v === v));
      }
      if (name === 'distribution') {
        state.distribution = v as Distribution;
        back.querySelectorAll<HTMLElement>('[data-seg="distribution"] [data-v]').forEach((b) => b.classList.toggle('active', b.dataset.v === v));
      }
      if (name === 'startRes') state.startRes = v as MatchSettings['startRes'];
      if (name === 'income') state.income = v;
      if (name === 'sandboxAI') state.sandboxAI = v;
      if (name === 'fog') state.fog = v;
      if (name === 'extras') state.extras = v;
      refresh();
    });
    refresh();
  }

  showLocal(): void {
    const distOpts: [Distribution, string][] = DISTRIBUTION_KEYS.map((d) => [d, DISTRIBUTIONS[d].label]);
    const state = { distribution: 'eleitoral' as Distribution, startRes: 'normais' as MatchSettings['startRes'] };
    const meta = readMeta('local');
    const body = `
      <p>Dois comandantes no mesmo dispositivo. Para manter a disputa justa, a guerra acontece em <b>turnos simultâneos</b>:</p>
      <ol><li><b>Planejamento do Exército Lula</b> — o tempo para; dê ordens, recrute, construa e ative habilidades.</li>
      <li><b>Passe o dispositivo</b> — a tela é ocultada para que o outro jogador não veja suas ordens.</li>
      <li><b>Planejamento do Exército Bolsonaro</b>.</li>
      <li><b>Execução</b> — as ordens dos dois lados acontecem ao mesmo tempo por 15 segundos de batalha.</li></ol>
      <div class="opts"><label>Distribuição territorial</label>${this.seg('distribution', distOpts, state.distribution)}
      <label>Recursos iniciais</label>${this.seg('startRes', [['baixos', 'Baixos'], ['normais', 'Normais'], ['altos', 'Altos']], state.startRes)}</div>`;
    const foot = `${meta ? `<button class="btn" data-continue>Continuar (${esc(meta.label)})</button>` : ''}<button class="btn primary" data-start>${ICON.play} Iniciar partida local</button>`;
    const { back, close } = modal(this.ui, 'Multijogador local', body, foot);
    this.bindSegs(back, (n, v) => { if (n === 'distribution') state.distribution = v as Distribution; if (n === 'startRes') state.startRes = v as MatchSettings['startRes']; });
    back.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-continue]')) { close(); this.continueMode('local'); }
      if ((e.target as HTMLElement).closest('[data-start]')) {
        close();
        this.startMatch(defaultSettings({ mode: 'local', player: 'lula', distribution: state.distribution, startRes: state.startRes, enemyAI: false }));
      }
    });
  }

  showSettings(onClose?: () => void): void {
    const s = this.settings;
    const body = `<div class="opts">
      <label>Volume da música</label><input type="range" min="0" max="1" step="0.05" value="${s.music}" data-k="music">
      <label>Volume dos efeitos</label><input type="range" min="0" max="1" step="0.05" value="${s.sfx}" data-k="sfx">
      <label>Velocidade inicial</label>${this.seg('defaultSpeed', [['0.5', '0,5×'], ['1', '1×'], ['2', '2×'], ['3', '3×']], String(s.defaultSpeed))}
      <label>Rolagem pela borda da tela</label><input type="checkbox" data-k="edgeScroll" ${s.edgeScroll ? 'checked' : ''}>
      <label>Barras de vida sempre visíveis</label><input type="checkbox" data-k="showAllHp" ${s.showAllHp ? 'checked' : ''}>
      <label>Partículas e efeitos</label><input type="checkbox" data-k="particles" ${s.particles ? 'checked' : ''}>
      <label>Qualidade gráfica</label>${this.seg('quality', [['auto', 'Automática'], ['baixo', 'Baixa'], ['medio', 'Média'], ['alto', 'Alta']], s.quality)}
      <label>Alto contraste</label><input type="checkbox" data-k="highContrast" ${s.highContrast ? 'checked' : ''}>
      <label>Servidor online</label><input class="inp" data-srv value="${esc(s.serverUrl)}" placeholder="automático (${esc(this.online.url)})">
      <label>Salvamento automático</label><input type="checkbox" data-k="autosave" ${s.autosave ? 'checked' : ''}>
    </div>
    <h3>Dados</h3><p class="note">O progresso fica salvo neste navegador (localStorage).</p>
    <button class="btn danger small" data-wipe>Apagar todas as partidas salvas</button>`;
    const { back, close } = modal(this.ui, 'Configurações', body, `<button class="btn primary" data-close>Pronto</button>`, true);
    back.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      const k = t.dataset.k as keyof Settings | undefined;
      if (!k) return;
      if (t.type === 'range') (s[k] as number) = +t.value;
      else (s[k] as boolean) = t.checked;
      this.applySettings();
    });
    this.bindSegs(back, (n, v) => {
      if (n === 'defaultSpeed') { s.defaultSpeed = +v; this.applySettings(); }
      if (n === 'quality') { s.quality = v as Settings['quality']; this.applySettings(); this.toast('Qualidade aplicada. O limite de quadros vale a partir da próxima abertura do jogo.'); }
    });
    back.querySelector<HTMLInputElement>('[data-srv]')?.addEventListener('change', (e) => {
      s.serverUrl = (e.target as HTMLInputElement).value.trim();
      this.applySettings();
      this.online.net.disconnect();
      this.online.probe();
    });
    back.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-wipe]') && confirm('Apagar todas as partidas salvas?')) {
        (['campanha', 'rapida', 'local', 'sandbox'] as GameMode[]).forEach(deleteSave);
        this.toast('Partidas salvas apagadas.');
      }
    });
    const obs = new MutationObserver(() => { if (!back.isConnected) { obs.disconnect(); onClose?.(); } });
    obs.observe(this.ui, { childList: true });
    back.querySelector('.foot [data-close]')?.addEventListener('click', close);
  }

  showHelp(): void {
    modal(this.ui, 'Como jogar', howToPlayHTML(), `<button class="btn primary" data-close>Entendi</button>`);
  }

  private exitGame(): void {
    this.clearMenu();
    audio.playMusic(null);
    try { window.close(); } catch { /* navegadores só fecham abas abertas por script */ }
    const s = el(`<div class="splash"><div class="box"><h1>ATÉ A PRÓXIMA, COMANDANTE</h1>
      <p>Seu progresso está salvo neste navegador. Você já pode fechar esta aba.</p>
      <button class="btn primary" data-back>Voltar ao menu</button></div></div>`);
    s.querySelector('[data-back]')!.addEventListener('click', () => { s.remove(); this.showMainMenu(); });
    this.ui.appendChild(s);
  }

  toast(msg: string): void {
    const t = el(`<div class="toasts"><div class="toast">${esc(msg)}</div></div>`);
    this.ui.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

  // ================================================================== partidas
  continueMode(mode: GameMode): void {
    const json = readSave(mode);
    if (!json) {
      this.toast(mode === 'campanha' ? 'Nenhuma campanha salva. Comece uma em “Jogar”.' : 'Nenhuma partida salva neste modo.');
      audio.play('error');
      return;
    }
    try {
      const sim = Game.fromJSON(json);
      this.launch(sim);
    } catch (err) {
      console.error(err);
      this.toast('Não foi possível carregar o save (versão incompatível ou corrompido).');
      deleteSave(mode);
    }
  }

  startMatch(settings: MatchSettings): void {
    this.launch(Game.create(settings));
  }

  private launch(sim: Game): void {
    this.clearMenu();
    this.sim = sim;
    const me: Faction = sim.w.settings.mode === 'local' ? (sim.w.turn?.active ?? 'lula') : sim.w.settings.player;
    let scene: GameScene | null = null;
    const driver: Driver = new LocalDriver(sim, () => scene?.me ?? me);
    scene = this.startScene(sim, driver, me, null);
    scene.speed = this.settings.defaultSpeed;
    if (sim.w.settings.mode !== 'local' && sim.w.time < 1) this.hud!.intro();
  }

  private startScene(sim: Game, driver: Driver, me: Faction, online: OnlineMatch | null): GameScene {
    this.phaser.scene.stop('menu');
    if (this.phaser.scene.isActive('game')) this.phaser.scene.stop('game');
    const hud = new HUD(this, sim, online ? this.online : null);
    this.hud = hud;
    this.phaser.scene.start('game', { sim, hooks: hud.hooks(), me, driver });
    const scene = this.phaser.scene.getScene('game') as GameScene;
    hud.attach(scene);
    audio.playMusic('battle');
    return scene;
  }

  /** Começa (ou retoma após reconexão) uma partida online. */
  launchOnline(online: Online, match: OnlineMatch): void {
    this.clearMenu();
    this.hud?.destroy();
    this.sim = null;
    const scene = this.startScene(match.sim, match, match.me, match);
    scene.speed = 1;
    this.hud!.toast(match.spectator ? 'Você está assistindo à partida.' : `Você comanda: ${match.roles.join(', ')}.`, 'good');
    void online;
  }

  save(silent = false): boolean {
    const sim = this.sim;
    if (!sim || sim.w.winner) return false;
    const w = sim.w;
    const mode = w.settings.mode;
    const player = mode === 'local' ? 'Lula × Bolsonaro' : FACTIONS[w.settings.player].short;
    const label = `${player} · ${mode === 'local' || mode === 'sandbox' ? MODE_LABEL[mode] : DIFFICULTY_LABEL[w.settings.difficulty]} · ${fmtTime(w.time)} · ${mode === 'local' ? `turno ${w.turn?.n ?? 1}` : `${sim.statesOf(w.settings.player).length} estados`}`;
    const ok = writeSave(mode, sim.toJSON(), {
      mode, savedAt: Date.now(), time: w.time, player: w.settings.player, difficulty: w.settings.difficulty,
      states: sim.statesOf(w.settings.player).length, label,
    });
    if (!silent) this.hud?.toast(ok ? 'Partida salva.' : 'Falha ao salvar (armazenamento cheio ou bloqueado).', ok ? 'good' : 'error');
    return ok;
  }

  toMenu(): void {
    this.hud?.destroy();
    this.hud = null;
    this.sim = null;
    if (this.online.match) this.online.quitMatch();
    this.phaser.scene.stop('game');
    this.phaser.scene.start('menu');
    this.showMainMenu();
  }
}
