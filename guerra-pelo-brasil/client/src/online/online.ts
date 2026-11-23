// Multiplayer online no cliente: menu (criar/entrar/públicas/reconectar/histórico),
// lobby sincronizado e painéis da partida (equipe, chat, marcadores, placar).
import { FACTIONS, DIFFICULTY_LABEL } from '@shared/data/factions';
import { DISTRIBUTIONS, DISTRIBUTION_KEYS } from '@shared/data/states';
import {
  AVATARS, DEFAULT_CONFIG, MARKERS, ROLE_INFO, sanitizeConfig, type Avatar, type ChatMsg, type MarkerKind,
  type MatchResult, type PlayerStats, type PlayerView, type RoomConfig, type RoomSummary, type RoomView, type ServerMsg,
} from '@shared/net/protocol';
import type { Snapshot } from '@shared/net/snapshot';
import { ROLES } from '@shared/sim/rules';
import type { Faction, MatchSettings, Role } from '@shared/sim/types';
import type { App } from '../app';
import { NetClient, resolveServerUrl, type NetStatus } from '../net/net';
import { OnlineMatch } from './match';
import { el, esc, fmtTime, modal } from '../ui/dom';
import { flagURI, ICON } from '../ui/art';
import { audio } from '../audio/audio';

export const AVATAR_ICON: Record<Avatar, string> = {
  capacete: '🪖', estrela: '⭐', tanque: '🛡️', aviao: '✈️', ancora: '⚓', raio: '⚡', escudo: '🛡', bussola: '🧭',
};

const STATUS_LABEL: Record<NetStatus, string> = {
  offline: 'Offline', conectando: 'Conectando…', conectado: 'Conectado', reconectando: 'Reconectando…', erro: 'Erro de conexão',
};

const LOCAL_HISTORY = 'gpb.v1.net.history';

export class Online {
  readonly net = new NetClient();
  room: RoomView | null = null;
  you = '';
  chat: ChatMsg[] = [];
  match: OnlineMatch | null = null;
  publicRooms: RoomSummary[] = [];
  serverHistory: MatchResult[] = [];
  private lobbyEl: HTMLElement | null = null;
  private menuBack: HTMLElement | null = null;
  private panelEl: HTMLElement | null = null;
  private chatScope: 'team' | 'all' = 'team';
  private unread = 0;
  private pendingStart: { team: Faction | null; roles: Role[]; spectator: boolean; settings: MatchSettings } | null = null;

  constructor(private app: App) {
    this.net.on((m) => this.onMsg(m));
    this.net.onStatus(() => this.onStatus());
  }

  get url(): string {
    return resolveServerUrl(this.app.settings.serverUrl);
  }

  /** Conecta em segundo plano (status real no menu). */
  probe(): void {
    try { this.net.connect(this.url); } catch { /* endereço inválido: status mostra erro */ }
  }

  statusText(): string {
    return `${STATUS_LABEL[this.net.status]}${this.net.status === 'conectado' ? ` · ${this.net.ping} ms` : ''}`;
  }

  private onStatus(): void {
    for (const n of document.querySelectorAll<HTMLElement>('[data-netstatus]')) {
      n.textContent = this.statusText();
      n.dataset.s = this.net.status;
    }
    const banner = document.querySelector<HTMLElement>('[data-netbanner]');
    if (banner) banner.classList.toggle('hidden', this.net.status === 'conectado' || !this.match);
    this.refreshMenuButtons();
  }

  // ================================================================== mensagens do servidor
  private onMsg(m: ServerMsg): void {
    switch (m.t) {
      case 'welcome':
        if (!m.resumed && this.net.lastRoom && (this.room || this.match)) {
          // a sala deixou de existir enquanto estávamos fora
          this.leaveLocal('A sala foi encerrada.');
        }
        break;
      case 'room':
        this.room = m.room;
        this.you = m.you;
        this.net.lastRoom = m.room.code;
        if (!this.match && m.room.state === 'lobby') this.renderLobby();
        this.renderTeamPanel();
        break;
      case 'chatlog':
        this.chat = m.list;
        this.renderChat();
        break;
      case 'chat':
        this.chat.push(m.msg);
        if (this.chat.length > 80) this.chat.shift();
        if (!m.msg.system && m.msg.fromId !== this.you) { this.unread++; audio.play('hover'); }
        this.renderChat();
        break;
      case 'start':
        if (!m.settings) return;
        if (this.match && m.seq !== 0) {
          // troca de funções durante a partida
          this.match.roles = m.roles;
          this.app.hud?.toast(`Suas funções: ${m.roles.map((r) => ROLE_INFO[r].short).join(', ')}.`, 'good');
          this.renderTeamPanel();
          return;
        }
        this.pendingStart = { team: m.team, roles: m.roles, spectator: m.spectator, settings: m.settings };
        if (this.match) { this.match = null; }
        break;
      case 'snap': {
        const s = m.s as Snapshot;
        if (this.pendingStart && s.full) {
          const p = this.pendingStart;
          this.pendingStart = null;
          const match = new OnlineMatch(this.net, p.settings, p.team, p.roles, p.spectator);
          match.onReject = (err) => { this.app.hud?.toast(err, 'error'); audio.play('error'); };
          match.applySnap(s);
          match.sim.events.length = 0;
          this.match = match;
          this.closeLobby();
          this.menuBack?.remove();
          this.app.launchOnline(this, match);
          return;
        }
        if (this.match) {
          if (!s.full && this.match.snaps === 0) { this.net.send({ t: 'full' }); return; }
          this.match.applySnap(s);
        }
        break;
      }
      case 'markers':
        if (this.match) this.match.markerList = m.list;
        break;
      case 'score':
        if (this.match) this.match.score = m.list;
        break;
      case 'end':
        if (this.match) {
          this.match.result = m.result;
          this.saveLocalHistory(m.result);
          this.app.hud?.showOnlineEnd(m.result, this.match);
        }
        break;
      case 'left':
        this.app.toast(m.reason);
        this.leaveLocal(m.reason);
        break;
      case 'error':
        if (m.code === 'rate' && this.match) return;
        if (this.app.hud && this.match) this.app.hud.toast(m.msg, 'error');
        else this.app.toast(m.msg);
        audio.play('error');
        break;
      case 'rooms':
        this.publicRooms = m.list;
        this.renderRoomList();
        break;
      case 'history':
        this.serverHistory = m.list;
        this.renderHistory();
        break;
      case 'roleswap':
        if (m.status === 'pending' && this.app.hud) {
          this.app.hud.toastAction(`${m.nick} pede a função ${ROLE_INFO[m.role].short}.`, 'Aprovar', () => this.net.send({ t: 'roleswap', a: 'approve', id: m.id }));
        }
        break;
      default:
        break;
    }
  }

  /** Volta ao menu sem a sala (saiu, foi removido ou a sala acabou). */
  private leaveLocal(_reason: string): void {
    this.net.lastRoom = null;
    this.room = null;
    this.chat = [];
    this.closeLobby();
    if (this.match) {
      this.match = null;
      this.app.toMenu();
    }
  }

  /** Sai da partida em andamento por decisão do jogador (a IA assume a função). */
  quitMatch(): void {
    this.net.send({ t: 'leave' });
    this.net.lastRoom = null;
    this.room = null;
    this.chat = [];
    this.match = null;
    this.unmountMatchPanel();
  }

  leaveRoom(): void {
    this.net.send({ t: 'leave' });
    this.leaveLocal('saiu');
  }

  // ================================================================== menu multiplayer
  openMenu(tab: 'criar' | 'entrar' | 'publicas' | 'reconectar' | 'historico' = 'criar', code = ''): void {
    this.probe();
    const s = this.app.settings;
    const body = `
      <div class="net-status-row">Servidor: <span class="net-dot" data-netstatus data-s="${this.net.status}">${esc(this.statusText())}</span>
        <span class="note">${esc(this.url)}</span> <button class="btn small" data-om="server">Alterar servidor</button></div>
      <div class="opts" style="margin:10px 0">
        <label>Seu apelido</label><input class="inp" data-nick maxlength="20" value="${esc(s.nick)}" placeholder="2 a 20 caracteres">
        <label>Avatar</label><div class="seg">${AVATARS.map((a) => `<button class="btn ${s.avatar === a ? 'active' : ''}" data-avatar="${a}">${AVATAR_ICON[a]}</button>`).join('')}</div>
      </div>
      <div class="tabs">
        <button class="btn" data-tab="criar">Criar sala</button>
        <button class="btn" data-tab="entrar">Entrar com código</button>
        <button class="btn" data-tab="publicas">Salas públicas</button>
        <button class="btn" data-tab="reconectar">Reconectar</button>
        <button class="btn" data-tab="historico">Histórico</button>
      </div>
      <div data-pane="criar">${this.createForm()}</div>
      <div data-pane="entrar" class="hidden">
        <div class="opts"><label>Código da sala</label><input class="inp code" data-code maxlength="8" placeholder="BR-7KQ42" value="${esc(code)}">
        <label>Senha (se houver)</label><input class="inp" data-pass type="password" maxlength="32">
        <label>Entrar como espectador</label><input type="checkbox" data-spec></div>
        <div class="row"><button class="btn primary" data-om="join">${ICON.play} Entrar</button></div>
      </div>
      <div data-pane="publicas" class="hidden"><div class="row"><button class="btn small" data-om="refresh">Atualizar lista</button></div><div data-roomlist class="roomlist"></div></div>
      <div data-pane="reconectar" class="hidden"><div data-reconnect></div></div>
      <div data-pane="historico" class="hidden"><div data-history></div></div>
      <p class="note">O multiplayer online exige o servidor do jogo (veja o README). Sem servidor, todos os modos offline continuam funcionando.</p>`;
    const { back, close } = modal(this.app.ui, 'Multiplayer online', body);
    this.menuBack = back;
    const show = (t: string) => {
      back.querySelectorAll<HTMLElement>('[data-pane]').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== t));
      back.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
      if (t === 'publicas') this.net.send({ t: 'list' });
      if (t === 'historico') { this.net.send({ t: 'history' }); this.renderHistory(); }
      if (t === 'reconectar') this.renderReconnect();
    };
    const nickOk = (): string | null => {
      const v = (back.querySelector<HTMLInputElement>('[data-nick]')!.value || '').trim();
      if (v.length < 2) { this.app.toast('Escolha um apelido com 2 a 20 caracteres.'); return null; }
      this.app.settings.nick = v;
      this.app.applySettings();
      return v;
    };
    const ready = (): boolean => {
      if (this.net.status !== 'conectado') { this.app.toast('Servidor indisponível no momento. Verifique o endereço em "Alterar servidor".'); audio.play('error'); return false; }
      return true;
    };
    back.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const tab = t.closest<HTMLElement>('[data-tab]')?.dataset.tab;
      if (tab) { show(tab); return; }
      const av = t.closest<HTMLElement>('[data-avatar]');
      if (av) {
        this.app.settings.avatar = av.dataset.avatar!;
        this.app.applySettings();
        back.querySelectorAll('[data-avatar]').forEach((b) => b.classList.toggle('active', b === av));
        return;
      }
      const act = t.closest<HTMLElement>('[data-om]')?.dataset.om;
      if (act === 'server') {
        const v = prompt('Endereço do servidor online (ex.: https://meu-servidor.up.railway.app). Deixe vazio para automático.', this.app.settings.serverUrl);
        if (v !== null) { this.app.settings.serverUrl = v.trim(); this.app.applySettings(); this.net.disconnect(); close(); this.openMenu(); }
      }
      if (act === 'create') {
        const nick = nickOk();
        if (!nick || !ready()) return;
        const cfg = this.readCreateForm(back);
        const pw = (back.querySelector<HTMLInputElement>('[data-cpass]')!.value || '').trim();
        this.net.send({ t: 'create', nick, avatar: this.app.settings.avatar as Avatar, password: pw || undefined, config: cfg });
      }
      if (act === 'join') {
        const nick = nickOk();
        if (!nick || !ready()) return;
        const codeV = (back.querySelector<HTMLInputElement>('[data-code]')!.value || '').trim().toUpperCase();
        const pw = back.querySelector<HTMLInputElement>('[data-pass]')!.value;
        const spec = back.querySelector<HTMLInputElement>('[data-spec]')!.checked;
        this.net.send({ t: 'join', code: codeV.startsWith('BR-') ? codeV : `BR-${codeV}`, nick, avatar: this.app.settings.avatar as Avatar, password: pw || undefined, spectator: spec });
      }
      if (act === 'refresh') this.net.send({ t: 'list' });
      const joinCode = t.closest<HTMLElement>('[data-joincode]')?.dataset.joincode;
      if (joinCode) {
        show('entrar');
        back.querySelector<HTMLInputElement>('[data-code]')!.value = joinCode;
      }
      if (t.closest('[data-reconnect-go]')) {
        if (!ready()) return;
        // o servidor reconhece o token salvo e devolve a sala
        this.net.disconnect();
        this.net.connect(this.url);
      }
    });
    show(tab);
    this.refreshMenuButtons();
  }

  private refreshMenuButtons(): void {
    const back = this.menuBack;
    if (!back || !back.isConnected) return;
    const ok = this.net.status === 'conectado';
    back.querySelectorAll<HTMLButtonElement>('[data-om="create"], [data-om="join"], [data-reconnect-go]').forEach((b) => { b.disabled = !ok; });
  }

  private createForm(): string {
    const c = DEFAULT_CONFIG;
    const sel = (k: keyof RoomConfig, opts: [string | number | boolean, string][]) =>
      `<select class="inp" data-cfg="${k}">${opts.map(([v, l]) => `<option value="${String(v)}" ${String(c[k]) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    const yes: [boolean, string][] = [[true, 'Sim'], [false, 'Não']];
    return `<div class="opts cfg">
      <label>Nome da sala</label><input class="inp" data-cfg="name" maxlength="32" value="${esc(c.name)}">
      <label>Senha (opcional)</label><input class="inp" data-cpass type="password" maxlength="32" placeholder="sem senha">
      <label>Jogadores</label>${sel('size', [[1, '1v1'], [2, '2v2'], [3, '3v3'], [4, '4v4'], [5, '5v5']])}
      <label>Sala pública</label>${sel('public', [[false, 'Privada (só com código)'], [true, 'Pública (aparece na lista)']])}
      <label>Espectadores</label>${sel('spectators', yes)}
      <label>Completar vagas com bots</label>${sel('bots', yes)}
      <label>Dificuldade dos bots</label>${sel('botDifficulty', (['facil', 'normal', 'dificil', 'insano'] as const).map((d) => [d, DIFFICULTY_LABEL[d]]))}
      <label>Recursos iniciais</label>${sel('startRes', [['baixos', 'Baixos'], ['normais', 'Normais'], ['altos', 'Altos']])}
      <label>Distribuição territorial</label>${sel('distribution', DISTRIBUTION_KEYS.map((d) => [d, DISTRIBUTIONS[d].label]))}
      <label>Velocidade da economia</label>${sel('incomeMul', [[0.75, 'Lenta'], [1, 'Normal'], [1.5, 'Rápida']])}
      <label>Duração máxima</label>${sel('maxDuration', [[0, 'Sem limite'], [15, '15 min'], [20, '20 min'], [30, '30 min'], [45, '45 min'], [60, '60 min'], [90, '90 min']])}
      <label>Preparação inicial</label>${sel('prepTime', [[0, 'Nenhuma'], [15, '15 s'], [30, '30 s'], [60, '1 min'], [120, '2 min']])}
      <label>Névoa de guerra</label>${sel('fog', yes)}
      <label>Habilidades especiais</label>${sel('abilities', yes)}
      <label>Equipes</label>${sel('teams', [['livre', 'Escolha livre'], ['auto', 'Equilíbrio automático']])}
      <label>Condição de vitória</label>${sel('victory', [['padrao', 'Conquista total ou rendição'], ['total', 'Somente conquista total'], ['sede', 'Tomar a sede inimiga']])}
      <label>Limite de tropas</label>${sel('unitCap', [[60, '60'], [100, '100'], [150, '150']])}
      <label>Limite de estruturas</label>${sel('structureCap', [[0, 'Sem limite'], [15, '15'], [25, '25'], [40, '40']])}
      <label>Permitir reconexão</label>${sel('reconnect', yes)}
      <label>Tempo para voltar</label>${sel('reconnectGrace', [[30, '30 s'], [60, '1 min'], [120, '2 min'], [300, '5 min']])}
      <label>Eventos aleatórios</label>${sel('events', yes)}
      <label>Moral das tropas</label>${sel('morale', yes)}
    </div><div class="row"><button class="btn primary" data-om="create">${ICON.play} Criar sala</button></div>`;
  }

  private readCreateForm(root: HTMLElement): Partial<RoomConfig> {
    const raw: Record<string, unknown> = {};
    root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-cfg]').forEach((n) => {
      const k = n.dataset.cfg!;
      const v = n.value;
      raw[k] = v === 'true' ? true : v === 'false' ? false : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
    });
    return sanitizeConfig(raw);
  }

  private renderRoomList(): void {
    const box = document.querySelector<HTMLElement>('[data-roomlist]');
    if (!box) return;
    box.innerHTML = this.publicRooms.length
      ? this.publicRooms.map((r) => `<div class="roomrow"><b>${esc(r.name)}</b> <span class="note">${esc(r.code)} · ${r.size}v${r.size} · ${r.humans} jogador(es) · ${r.state === 'lobby' ? 'no lobby' : 'em partida'}${r.hasPassword ? ' · 🔒' : ''}</span>
        <button class="btn small" data-joincode="${esc(r.code)}">${r.state === 'lobby' ? 'Entrar' : 'Assistir'}</button></div>`).join('')
      : '<p class="note">Nenhuma sala pública agora. Crie uma!</p>';
  }

  private renderReconnect(): void {
    const box = document.querySelector<HTMLElement>('[data-reconnect]');
    if (!box) return;
    const code = this.net.lastRoom;
    box.innerHTML = code
      ? `<p>Sua última sala foi <b>${esc(code)}</b>. Se a partida ainda estiver em andamento, você volta com a mesma equipe e função.</p><button class="btn primary" data-reconnect-go>${ICON.play} Reconectar à partida</button>`
      : '<p class="note">Nenhuma partida recente neste navegador.</p>';
    this.refreshMenuButtons();
  }

  private saveLocalHistory(r: MatchResult): void {
    try {
      const list = JSON.parse(localStorage.getItem(LOCAL_HISTORY) ?? '[]') as (MatchResult & { me?: Faction | null })[];
      list.unshift({ ...r, me: this.match?.team ?? null });
      localStorage.setItem(LOCAL_HISTORY, JSON.stringify(list.slice(0, 30)));
    } catch { /* armazenamento indisponível */ }
  }

  private renderHistory(): void {
    const box = document.querySelector<HTMLElement>('[data-history]');
    if (!box) return;
    let local: (MatchResult & { me?: Faction | null })[] = [];
    try { local = JSON.parse(localStorage.getItem(LOCAL_HISTORY) ?? '[]'); } catch { local = []; }
    const row = (r: MatchResult & { me?: Faction | null }) => {
      const res = r.draw ? 'Empate' : r.winner ? `Vitória de ${FACTIONS[r.winner].short}` : '—';
      const mine = r.me ? (r.draw ? ' (empate)' : r.winner === r.me ? ' — você venceu' : ' — você perdeu') : '';
      return `<div class="roomrow"><b>${esc(r.name)}</b> <span class="note">${new Date(r.endedAt).toLocaleString('pt-BR')} · ${fmtTime(r.duration)} · ${esc(res)}${esc(mine)} · ${r.players.length} participantes</span></div>`;
    };
    box.innerHTML = `<h3>Suas partidas neste navegador</h3>${local.length ? local.map(row).join('') : '<p class="note">Nenhuma ainda.</p>'}
      <h3>Partidas recentes no servidor</h3>${this.serverHistory.length ? this.serverHistory.map((r) => row(r)).join('') : '<p class="note">Nenhuma registrada (ou servidor offline).</p>'}`;
  }

  // ================================================================== lobby
  private closeLobby(): void {
    this.lobbyEl?.remove();
    this.lobbyEl = null;
  }

  private inviteLink(code: string): string {
    if (location.protocol === 'http:' || location.protocol === 'https:') return `${location.origin}${location.pathname}?sala=${code}`;
    return '';
  }

  renderLobby(): void {
    const r = this.room;
    if (!r) return;
    this.menuBack?.remove();
    this.app.hideMainMenu();
    const me = r.players.find((p) => p.id === this.you);
    const isHost = r.hostId === this.you;
    if (!this.lobbyEl) {
      this.lobbyEl = el(`<div class="lobby"></div>`);
      this.app.ui.appendChild(this.lobbyEl);
      this.bindLobby(this.lobbyEl);
    }
    const focus = document.activeElement as HTMLInputElement | null;
    const typing = focus?.dataset?.lchat !== undefined ? focus.value : null;
    const team = (f: Faction) => {
      const list = r.players.filter((p) => p.team === f && !p.spectator);
      const d = FACTIONS[f];
      return `<div class="lteam ${f}">
        <div class="lteam-h"><img src="${flagURI(f)}" alt=""><b>${esc(d.short.toUpperCase())}</b> — ${list.length}/${r.config.size}
          <span class="note">${esc(d.leader)} · ${esc(d.commander)} (caricaturas)</span></div>
        ${list.map((p) => this.playerRow(p, r, isHost)).join('')}
        ${Array.from({ length: Math.max(0, r.config.size - list.length) }, () => `<div class="lplayer empty">Vaga livre${r.config.bots ? ' (bot se não for ocupada)' : ''}</div>`).join('')}
        <div class="row">${me && !me.spectator && me.team !== f && r.config.teams === 'livre' ? `<button class="btn small" data-lb="team" data-v="${f}">Entrar nesta equipe</button>` : ''}
        ${isHost && list.length < r.config.size ? `<button class="btn small" data-lb="addBot" data-v="${f}">+ Adicionar bot</button>` : ''}</div>
      </div>`;
    };
    const unassigned = r.players.filter((p) => !p.team && !p.spectator);
    const specs = r.players.filter((p) => p.spectator);
    const link = this.inviteLink(r.code);
    this.lobbyEl.innerHTML = `
      <div class="lobby-h">
        <div><div class="lobby-title">${esc(r.name)}</div><div class="note">${r.config.size}v${r.config.size} · ${r.config.public ? 'pública' : 'privada'}${r.hasPassword ? ' · com senha' : ''} · servidor: <span data-netstatus data-s="${this.net.status}">${esc(this.statusText())}</span></div></div>
        <div class="lobby-code">CÓDIGO <b>${esc(r.code)}</b> <button class="btn small" data-lb="copy">Copiar convite</button></div>
        <button class="btn" data-lb="leave">${ICON.close} Sair da sala</button>
      </div>
      <div class="lobby-grid">
        <div class="lobby-teams">${team('lula')}${team('bolso')}
          ${unassigned.length ? `<div class="lteam none"><div class="lteam-h"><b>SEM EQUIPE</b></div>${unassigned.map((p) => this.playerRow(p, r, isHost)).join('')}</div>` : ''}
          ${specs.length ? `<div class="lteam none"><div class="lteam-h"><b>ESPECTADORES</b></div>${specs.map((p) => this.playerRow(p, r, isHost)).join('')}</div>` : ''}
        </div>
        <div class="lobby-side">
          <div class="panel"><div class="ph">${ICON.gear} Configurações ${isHost ? '(anfitrião)' : ''}</div><div class="lcfg">${this.configView(r, isHost)}</div></div>
          <div class="panel"><div class="ph">${ICON.info} Chat do lobby</div><div class="lchat" data-chatbox></div>
            <div class="row" style="padding:6px"><input class="inp" data-lchat maxlength="200" placeholder="Mensagem para a sala (Enter)" style="flex:1"><button class="btn small" data-lb="chat">Enviar</button></div></div>
        </div>
      </div>
      <div class="lobby-f">
        ${me && !me.spectator ? `<div class="note">Sua função: ${me.role ? esc(ROLE_INFO[me.role].name) : 'escolha uma (funções livres são agrupadas automaticamente)'}</div>` : ''}
        <div class="spacer"></div>
        ${link ? `<span class="note">Link: ${esc(link)}</span>` : '<span class="note">Compartilhe o código da sala.</span>'}
        ${isHost ? `<button class="btn" data-lb="balance">Equilibrar equipes</button>` : ''}
        ${me && !isHost && !me.spectator ? `<button class="btn ${me.ready ? 'active' : 'primary'}" data-lb="ready">${me.ready ? '✓ Pronto (cancelar)' : 'Estou pronto'}</button>` : ''}
        ${isHost ? `<button class="btn primary" data-lb="start" ${r.canStart ? '' : 'disabled'} title="${esc(r.startBlockers.join(' '))}">${ICON.play} Iniciar guerra</button>` : ''}
      </div>
      ${isHost && !r.canStart ? `<div class="lobby-block">${r.startBlockers.map((b) => `<div>• ${esc(b)}</div>`).join('')}</div>` : ''}`;
    this.renderChat();
    if (typing !== null) {
      const inp = this.lobbyEl.querySelector<HTMLInputElement>('[data-lchat]')!;
      inp.value = typing;
      inp.focus();
    }
  }

  private playerRow(p: PlayerView, r: RoomView, isHost: boolean): string {
    const self = p.id === this.you;
    const roleSel = self && !p.spectator && p.team && r.state === 'lobby'
      ? `<select class="inp small" data-lrole>${['', ...ROLES].map((ro) => `<option value="${ro}" ${p.role === ro || (!p.role && !ro) ? 'selected' : ''}>${ro ? esc(ROLE_INFO[ro as Role].short) : '— função —'}</option>`).join('')}</select>`
      : `<span class="lrole">${p.role ? esc(ROLE_INFO[p.role].short) : p.spectator ? 'Espectador' : '—'}</span>`;
    return `<div class="lplayer ${self ? 'me' : ''}">
      <span class="lav">${AVATAR_ICON[p.avatar] ?? '🪖'}</span>
      <span class="lnick">${p.host ? '♛ ' : ''}${esc(p.nick)}${p.bot ? ' <span class="tag-bot">BOT</span>' : ''}${self ? ' <span class="note">(você)</span>' : ''}</span>
      ${roleSel}
      <span class="lready ${p.ready ? 'ok' : ''}" title="${p.ready ? 'Pronto' : 'Aguardando'}">${p.ready ? '✓' : '…'}</span>
      <span class="lconn ${p.connected ? 'on' : 'off'}" title="${p.connected ? 'Conectado' : 'Desconectado'}"></span>
      <span class="lping">${p.bot ? 'IA' : `${p.ping} ms`}</span>
      <span class="lact">${isHost && !self ? `${!p.bot ? `<button class="btn icon small" data-lb="host" data-v="${p.id}" title="Passar liderança">♛</button>` : ''}<button class="btn icon small" data-lb="${p.bot ? 'removeBot' : 'kick'}" data-v="${p.id}" title="Remover">✕</button>` : ''}</span>
    </div>`;
  }

  private configView(r: RoomView, isHost: boolean): string {
    const c = r.config;
    const fields: [keyof RoomConfig, string, [string | number | boolean, string][]][] = [
      ['size', 'Jogadores', [[1, '1v1'], [2, '2v2'], [3, '3v3'], [4, '4v4'], [5, '5v5']]],
      ['public', 'Visibilidade', [[false, 'Privada'], [true, 'Pública']]],
      ['bots', 'Bots nas vagas', [[true, 'Sim'], [false, 'Não']]],
      ['botDifficulty', 'Dificuldade dos bots', (['facil', 'normal', 'dificil', 'insano'] as const).map((d) => [d, DIFFICULTY_LABEL[d]])],
      ['spectators', 'Espectadores', [[true, 'Sim'], [false, 'Não']]],
      ['startRes', 'Recursos iniciais', [['baixos', 'Baixos'], ['normais', 'Normais'], ['altos', 'Altos']]],
      ['distribution', 'Distribuição', DISTRIBUTION_KEYS.map((d) => [d, DISTRIBUTIONS[d].label])],
      ['incomeMul', 'Economia', [[0.75, 'Lenta'], [1, 'Normal'], [1.5, 'Rápida']]],
      ['maxDuration', 'Duração máxima', [[0, 'Sem limite'], [15, '15 min'], [20, '20 min'], [30, '30 min'], [45, '45 min'], [60, '60 min'], [90, '90 min']]],
      ['prepTime', 'Preparação', [[0, 'Nenhuma'], [15, '15 s'], [30, '30 s'], [60, '1 min'], [120, '2 min']]],
      ['fog', 'Névoa de guerra', [[true, 'Ligada'], [false, 'Desligada']]],
      ['abilities', 'Habilidades', [[true, 'Ligadas'], [false, 'Desligadas']]],
      ['teams', 'Equipes', [['livre', 'Escolha livre'], ['auto', 'Equilíbrio automático']]],
      ['victory', 'Vitória', [['padrao', 'Conquista ou rendição'], ['total', 'Só conquista total'], ['sede', 'Tomar a sede']]],
      ['unitCap', 'Limite de tropas', [[60, '60'], [100, '100'], [150, '150']]],
      ['structureCap', 'Limite de estruturas', [[0, 'Sem limite'], [15, '15'], [25, '25'], [40, '40']]],
      ['reconnect', 'Reconexão', [[true, 'Permitida'], [false, 'Não']]],
      ['reconnectGrace', 'Tempo para voltar', [[30, '30 s'], [60, '1 min'], [120, '2 min'], [300, '5 min']]],
      ['events', 'Eventos aleatórios', [[true, 'Sim'], [false, 'Não']]],
      ['morale', 'Moral', [[true, 'Sim'], [false, 'Não']]],
    ];
    return `<div class="opts">${fields.map(([k, label, opts]) => `<label>${esc(label)}</label>${isHost
      ? `<select class="inp small" data-lcfg="${k}">${opts.map(([v, l]) => `<option value="${String(v)}" ${String(c[k]) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`
      : `<b>${esc(opts.find(([v]) => String(v) === String(c[k]))?.[1] ?? String(c[k]))}</b>`}`).join('')}</div>`;
  }

  private bindLobby(root: HTMLElement): void {
    root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-lb]');
      if (!b) return;
      const a = b.dataset.lb!, v = b.dataset.v ?? '';
      switch (a) {
        case 'team': this.net.send({ t: 'lobby', a: 'team', team: v as Faction }); break;
        case 'addBot': this.net.send({ t: 'lobby', a: 'addBot', team: v as Faction }); break;
        case 'removeBot': this.net.send({ t: 'lobby', a: 'removeBot', id: v }); break;
        case 'kick': if (confirm('Remover este jogador da sala?')) this.net.send({ t: 'lobby', a: 'kick', id: v }); break;
        case 'host': this.net.send({ t: 'lobby', a: 'host', id: v }); break;
        case 'ready': this.net.send({ t: 'lobby', a: 'ready', ready: !this.room?.players.find((p) => p.id === this.you)?.ready }); break;
        case 'start': this.net.send({ t: 'lobby', a: 'start' }); break;
        case 'balance': this.net.send({ t: 'lobby', a: 'balance' }); break;
        case 'leave': this.leaveRoom(); this.app.showMainMenu(); break;
        case 'chat': this.sendChat(root.querySelector<HTMLInputElement>('[data-lchat]')!, 'all'); break;
        case 'copy': {
          const code = this.room?.code ?? '';
          const link = this.inviteLink(code);
          const text = link ? `Entre na minha guerra em Guerra pelo Brasil: ${link} (código ${code})` : `Código da sala em Guerra pelo Brasil: ${code}`;
          void navigator.clipboard?.writeText(text).then(() => this.app.toast('Convite copiado!'), () => prompt('Copie o convite:', text));
          break;
        }
      }
    });
    root.addEventListener('change', (e) => {
      const t = e.target as HTMLSelectElement;
      if (t.dataset.lrole !== undefined) this.net.send({ t: 'lobby', a: 'role', role: (t.value || null) as Role | null });
      const k = t.dataset.lcfg;
      if (k) {
        const v = t.value === 'true' ? true : t.value === 'false' ? false : /^-?\d+(\.\d+)?$/.test(t.value) ? Number(t.value) : t.value;
        this.net.send({ t: 'lobby', a: 'config', config: { [k]: v } as Partial<RoomConfig> });
      }
    });
    root.addEventListener('keydown', (e) => {
      const t = e.target as HTMLInputElement;
      if (e.key === 'Enter' && t.dataset.lchat !== undefined) this.sendChat(t, 'all');
    });
  }

  sendChat(inp: HTMLInputElement, scope: 'team' | 'all'): void {
    const text = inp.value.trim();
    if (!text) return;
    this.net.send({ t: 'chat', scope, text });
    inp.value = '';
  }

  private renderChat(): void {
    const box = document.querySelector<HTMLElement>('[data-chatbox]');
    if (!box) return;
    box.innerHTML = this.chat.slice(-40).map((m) => `<div class="cm ${m.system ? 'sys' : ''} ${m.scope}"><span class="note">${new Date(m.t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span> ${m.system ? '' : `<b>${esc(m.from)}${m.scope === 'team' ? ' [equipe]' : ''}:</b> `}${esc(m.text)}</div>`).join('');
    box.scrollTop = box.scrollHeight;
    const badge = document.querySelector<HTMLElement>('[data-unread]');
    if (badge) badge.textContent = this.unread ? String(this.unread) : '';
  }

  // ================================================================== painel da partida
  /** Painel de equipe + chat + marcadores, montado dentro do HUD da partida. */
  mountMatchPanel(host: HTMLElement): void {
    this.panelEl?.remove();
    const m = this.match!;
    const isCmd = m.roles.includes('comandante');
    this.panelEl = el(`<div class="online-panel">
      <div class="panel"><div class="ph">${ICON.troops} Equipe <span class="spacer"></span><span data-netstatus data-s="${this.net.status}">${esc(this.statusText())}</span></div>
        <div data-teamlist class="teamlist"></div>
        ${m.spectator ? '<div class="note" style="padding:6px 10px">Você está assistindo (sem névoa, sem ordens).</div>' : `
        <div class="row" style="padding:0 8px 6px"><span class="note">Sinalizar no mapa:</span></div>
        <div class="markers-bar">${(Object.keys(MARKERS) as MarkerKind[]).map((k) => `<button class="btn small mk" data-mk="${k}" style="border-left:3px solid ${MARKERS[k].color}" title="${esc(MARKERS[k].label)}">${esc(MARKERS[k].label)}</button>`).join('')}</div>
        <div class="row" style="padding:6px 8px">
          ${isCmd ? `<button class="btn small" data-op="objective" title="Clique num estado para marcá-lo como objetivo da equipe">${ICON.target} Definir objetivo</button><button class="btn small" data-op="clearobj">Limpar objetivo</button>` : ''}
          <button class="btn small" data-op="score" title="Placar (Tab)">${ICON.report} Placar</button>
          <select class="inp small" data-roleswap><option value="">Pedir função…</option>${ROLES.map((r) => `<option value="${r}">${esc(ROLE_INFO[r].short)}</option>`).join('')}</select>
        </div>`}
      </div>
      <div class="panel chatpanel"><div class="ph">${ICON.info} Chat <span class="badge" data-unread></span><span class="spacer"></span>
        ${m.spectator ? '' : `<button class="btn small" data-scope>${this.chatScope === 'team' ? 'Equipe' : 'Todos'}</button>`}</div>
        <div class="lchat" data-chatbox></div>
        <div class="row" style="padding:6px"><input class="inp" data-mchat maxlength="200" placeholder="Enter para conversar" style="flex:1"></div>
      </div>
    </div>`);
    host.appendChild(this.panelEl);
    this.panelEl.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const mk = t.closest<HTMLElement>('[data-mk]')?.dataset.mk as MarkerKind | undefined;
      if (mk) { this.app.scene()?.setMode({ kind: 'marker', marker: mk }); this.app.hud?.toast(`${MARKERS[mk].label}: clique no mapa.`); return; }
      const op = t.closest<HTMLElement>('[data-op]')?.dataset.op;
      if (op === 'objective') { this.app.scene()?.setMode({ kind: 'objective' }); this.app.hud?.toast('Clique no estado que será o objetivo da equipe.'); }
      if (op === 'clearobj') this.app.scene()?.send({ k: 'objective', s: -1 });
      if (op === 'score') this.showScoreboard();
      if (t.closest('[data-scope]')) {
        this.chatScope = this.chatScope === 'team' ? 'all' : 'team';
        t.closest<HTMLElement>('[data-scope]')!.textContent = this.chatScope === 'team' ? 'Equipe' : 'Todos';
      }
    });
    this.panelEl.addEventListener('change', (e) => {
      const t = e.target as HTMLSelectElement;
      if (t.dataset.roleswap !== undefined && t.value) {
        this.net.send({ t: 'roleswap', a: 'request', role: t.value as Role });
        this.app.hud?.toast(`Pedido enviado: função ${ROLE_INFO[t.value as Role].short}.`);
        t.value = '';
      }
    });
    this.panelEl.addEventListener('keydown', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.mchat === undefined) return;
      e.stopPropagation();
      if (e.key === 'Enter') { this.sendChat(t, m.spectator ? 'all' : this.chatScope); t.blur(); }
      if (e.key === 'Escape') t.blur();
    });
    this.panelEl.addEventListener('focusin', () => { this.unread = 0; this.renderChat(); });
    this.renderTeamPanel();
    this.renderChat();
  }

  focusChat(): void {
    this.panelEl?.querySelector<HTMLInputElement>('[data-mchat]')?.focus();
  }

  renderTeamPanel(): void {
    const box = this.panelEl?.querySelector<HTMLElement>('[data-teamlist]');
    const r = this.room, m = this.match;
    if (!box || !r || !m) return;
    const team = m.team;
    const list = r.players.filter((p) => (team ? p.team === team : !!p.team) && !p.spectator);
    box.innerHTML = list.map((p) => `<div class="tp ${p.id === this.you ? 'me' : ''} ${p.team ?? ''}">
      <span class="lconn ${p.connected ? 'on' : 'off'}"></span><b>${esc(p.nick)}</b>${p.bot ? ' <span class="tag-bot">BOT</span>' : ''}${p.aiCover && !p.bot ? ' <span class="tag-bot">IA no comando</span>' : ''}
      <span class="note">${p.roles.map((ro) => esc(ROLE_INFO[ro].short)).join(' + ') || '—'}</span><span class="lping">${p.bot ? '' : `${p.ping} ms`}</span></div>`).join('');
  }

  showScoreboard(): void {
    const m = this.match;
    if (!m) return;
    const rows = (f: Faction) => m.score.filter((p) => p.team === f).sort((a, b) => b.score - a.score).map((p) => `<tr><td>${esc(p.nick)}${p.bot ? ' <span class="tag-bot">BOT</span>' : ''}</td><td>${p.roles.map((r) => esc(ROLE_INFO[r].short)).join(' + ')}</td><td>${p.captured}</td><td>${p.produced}</td><td>${p.killed}</td><td>${p.lost}</td><td>${p.spent}</td><td><b>${p.score}</b></td></tr>`).join('');
    const table = (f: Faction) => `<h3 style="color:${FACTIONS[f].colorCss}">${esc(FACTIONS[f].name)} — ${m.sim.statesOf(f).length} estados</h3>
      <table><tr><th>Jogador</th><th>Função</th><th>Capturas</th><th>Produzidas</th><th>Destruídas</th><th>Perdidas</th><th>Investido</th><th>Contribuição</th></tr>${rows(f)}</table>`;
    modal(this.app.ui, `Placar · ${fmtTime(m.sim.w.time)}`, `${table('lula')}${table('bolso')}<p class="note">Contribuição estratégica = abates×10 + capturas×50 + produção×3 + investimento/50 + ordens×0,5 + marcadores − perdas×2.</p>`, `<button class="btn primary" data-close>Fechar</button>`);
  }

  scoreTable(result: MatchResult): string {
    const rows = (f: Faction) => result.players.filter((p: PlayerStats) => p.team === f).sort((a, b) => b.score - a.score)
      .map((p) => `<tr><td>${esc(p.nick)}${p.bot ? ' <span class="tag-bot">BOT</span>' : ''}</td><td>${p.roles.map((r) => esc(ROLE_INFO[r].short)).join(' + ')}</td><td>${p.captured}</td><td>${p.produced}</td><td>${p.killed}</td><td>${p.spent}</td><td><b>${p.score}</b></td></tr>`).join('');
    const tt = (f: Faction) => {
      const t = result.teams[f];
      return `<h3 style="color:${FACTIONS[f].colorCss}">${esc(FACTIONS[f].name)}</h3>
      <p class="note">${t.states} estados · ${t.captured} capturas · ${t.produced} unidades produzidas · ${t.killed} destruídas · ${t.lost} perdidas · $${t.spent} investidos</p>
      <table><tr><th>Jogador</th><th>Função</th><th>Capturas</th><th>Produzidas</th><th>Destruídas</th><th>Investido</th><th>Contribuição</th></tr>${rows(f)}</table>`;
    };
    return tt('lula') + tt('bolso');
  }

  unmountMatchPanel(): void {
    this.panelEl?.remove();
    this.panelEl = null;
  }
}
