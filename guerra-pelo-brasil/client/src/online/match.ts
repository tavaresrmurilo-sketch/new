// Partida online do ponto de vista do cliente: mundo espelho alimentado pelos
// snapshots do servidor + driver que envia comandos pela rede.
import { Game } from '@shared/sim/game';
import { applySnapshot, type Snapshot } from '@shared/net/snapshot';
import type { Command } from '@shared/net/commands';
import type { Marker, MarkerKind, MatchResult, PlayerStats } from '@shared/net/protocol';
import type { Faction, MatchSettings, Role } from '@shared/sim/types';
import type { Driver } from '../driver';
import type { NetClient } from '../net/net';

export class OnlineMatch implements Driver {
  readonly online = true;
  sim: Game;
  roles: Role[];
  spectator: boolean;
  team: Faction | null;
  markerList: Marker[] = [];
  score: PlayerStats[] = [];
  result: MatchResult | null = null;
  snaps = 0;
  private lastSnapAt = 0;
  private interval = 100;
  /** chamado quando o servidor recusa um comando */
  onReject: (err: string) => void = () => {};

  constructor(private net: NetClient, settings: MatchSettings, team: Faction | null, roles: Role[], spectator: boolean) {
    this.sim = Game.create(settings);
    this.sim.w.units = [];
    this.sim.syncIndex();
    this.team = team;
    this.roles = roles;
    this.spectator = spectator;
  }

  /** Lado exibido: a equipe do jogador ou, para espectadores, o Lula. */
  get me(): Faction {
    return this.team ?? 'lula';
  }

  applySnap(s: Snapshot): void {
    applySnapshot(this.sim, s, this.spectator ? null : this.team);
    const now = performance.now();
    if (this.lastSnapAt) this.interval = Math.max(50, Math.min(300, this.interval * 0.8 + (now - this.lastSnapAt) * 0.2));
    this.lastSnapAt = now;
    this.snaps++;
  }

  update(dt: number): void {
    // interpolação entre o snapshot anterior e o atual
    this.sim.alpha = Math.min(1, (performance.now() - this.lastSnapAt) / this.interval);
    for (const sh of this.sim.w.shells) sh.t = Math.min(sh.dur, sh.t + dt);
  }

  send(c: Command): string | null {
    if (this.spectator) return 'Espectadores não dão ordens.';
    if (this.net.status !== 'conectado') return 'Sem conexão com o servidor: aguarde a reconexão.';
    if (this.sim.w.winner || this.sim.w.draw) return 'A partida terminou.';
    this.net.cmd(c, (ok, err) => { if (!ok && err) this.onReject(err); });
    return null;
  }

  markers(): Marker[] {
    return this.markerList;
  }

  sendMarker(kind: MarkerKind, x: number, y: number): void {
    this.net.send({ t: 'marker', kind, x, y });
  }
}
