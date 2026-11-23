// "Driver" da partida: único caminho pelo qual a interface altera o jogo.
// Offline: aplica os comandos na simulação local. Online: envia ao servidor.
import type { Game } from '@shared/sim/game';
import { applyCommand, type Command } from '@shared/net/commands';
import type { Marker, MarkerKind } from '@shared/net/protocol';
import type { Faction, Role } from '@shared/sim/types';

export interface Driver {
  readonly online: boolean;
  /** funções do jogador (null = todas) */
  roles: Role[] | null;
  spectator: boolean;
  /** avança (offline) ou interpola (online) */
  update(dt: number, paused: boolean): void;
  /** envia um comando; retorna erro imediato (offline) ou null (online: confirmação chega depois) */
  send(c: Command): string | null;
  markers(): Marker[];
  sendMarker(kind: MarkerKind, x: number, y: number): void;
}

export class LocalDriver implements Driver {
  readonly online = false;
  roles: Role[] | null = null;
  spectator = false;
  constructor(private sim: Game, private me: () => Faction) {}
  update(dt: number, paused: boolean): void {
    if (!paused && !this.sim.paused) this.sim.advance(dt);
  }
  send(c: Command): string | null {
    return applyCommand(this.sim, this.me(), null, c);
  }
  markers(): Marker[] {
    return [];
  }
  sendMarker(): void {
    /* marcadores são do modo online */
  }
}
