// Comandos de jogo serializáveis. São o ÚNICO meio de alterar uma partida:
// o modo offline e o servidor online passam pela mesma validação.
import { RECRUITABLE } from '../data/units';
import { BUILDING_ORDER } from '../data/buildings';
import { FACTIONS } from '../data/factions';
import type { Game } from '../sim/game';
import { FORMATION_LIST, ROLES } from '../sim/rules';
import type { AbilityId, BuildingType, Faction, Formation, ResKey, Role, TargetRef, UnitType } from '../sim/types';

export type Command =
  | { k: 'move'; ids: number[]; x: number; y: number; aggressive: boolean; form?: Formation; escort?: number }
  | { k: 'attack'; ids: number[]; target: TargetRef }
  | { k: 'stop'; ids: number[]; hold?: boolean }
  | { k: 'rtb'; ids: number[] }
  | { k: 'recon'; ids: number[] }
  | { k: 'transfer'; ids: number[]; to: Role }
  | { k: 'recruit'; s: number; unit: UnitType }
  | { k: 'cancelRecruit'; s: number; i: number }
  | { k: 'build'; s: number; b: BuildingType }
  | { k: 'cancelBuild'; s: number }
  | { k: 'rally'; s: number; x: number | null; y: number }
  | { k: 'ability'; id: AbilityId; x?: number; y?: number; s?: number }
  | { k: 'trade'; from: ResKey; to: ResKey; amount: number }
  | { k: 'reserves'; s: number }
  | { k: 'objective'; s: number }
  | { k: 'surrender' }
  | { k: 'endPlanning' };

export const MAX_IDS = 300;
const RES: ResKey[] = ['money', 'fuel', 'steel', 'supplies'];

/** O que cada função pode fazer além de comandar as próprias unidades. */
export const ROLE_ACTIONS: Record<Role, string[]> = {
  comandante: ['ability', 'objective', 'surrender', 'trade', 'reserves'],
  infantaria: ['recruit:infantry', 'rally'],
  blindados: ['recruit:tank', 'recruit:artillery', 'rally'],
  aereo: ['recruit:heli', 'recruit:plane', 'recruit:recon', 'rally'],
  logistica: ['recruit:*', 'build', 'trade', 'rally', 'reserves', 'cancel'],
};

export function roleCan(roles: Role[] | null, action: string): boolean {
  if (!roles) return true;
  const [kind] = action.split(':');
  return roles.some((r) => ROLE_ACTIONS[r].some((a) => a === action || a === `${kind}:*` || a === kind));
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): v is number => isNum(v) && Number.isInteger(v);

function ids(v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_IDS) return null;
  const out = new Set<number>();
  for (const x of v) { if (!isInt(x) || x <= 0) return null; out.add(x); }
  return [...out];
}

function target(v: unknown): TargetRef | null {
  if (!v || typeof v !== 'object') return null;
  const t = v as Record<string, unknown>;
  if (t.t === 'u' && isInt(t.id) && t.id > 0) return { t: 'u', id: t.id };
  if (t.t === 'b' && isInt(t.s) && t.s >= 0 && t.s < 27) return { t: 'b', s: t.s };
  return null;
}

/**
 * Valida a forma de um comando vindo de fora (rede). Nunca confia em valores
 * de dano, dinheiro ou território: o comando só expressa uma intenção.
 */
export function parseCommand(raw: unknown, mapW = 4000, mapH = 4000): Command | string {
  if (!raw || typeof raw !== 'object') return 'Comando inválido.';
  const c = raw as Record<string, unknown>;
  const inMap = (x: unknown, y: unknown) => isNum(x) && isNum(y) && x >= -200 && y >= -200 && x <= mapW + 200 && y <= mapH + 200;
  const st = (v: unknown) => isInt(v) && v >= 0 && v < 27;
  switch (c.k) {
    case 'move': {
      const list = ids(c.ids);
      if (!list || !inMap(c.x, c.y)) return 'Movimento inválido.';
      const form = c.form === undefined ? 'livre' : c.form;
      if (!FORMATION_LIST.includes(form as Formation)) return 'Formação inválida.';
      const escort = c.escort === undefined ? 0 : c.escort;
      if (!isInt(escort) || escort < 0) return 'Escolta inválida.';
      return { k: 'move', ids: list, x: c.x as number, y: c.y as number, aggressive: !!c.aggressive, form: form as Formation, escort };
    }
    case 'attack': {
      const list = ids(c.ids), t = target(c.target);
      return list && t ? { k: 'attack', ids: list, target: t } : 'Ataque inválido.';
    }
    case 'stop': case 'rtb': case 'recon': {
      const list = ids(c.ids);
      if (!list) return 'Seleção inválida.';
      return c.k === 'stop' ? { k: 'stop', ids: list, hold: !!c.hold } : { k: c.k, ids: list };
    }
    case 'transfer': {
      const list = ids(c.ids);
      return list && ROLES.includes(c.to as Role) ? { k: 'transfer', ids: list, to: c.to as Role } : 'Transferência inválida.';
    }
    case 'recruit':
      return st(c.s) && RECRUITABLE.includes(c.unit as UnitType) ? { k: 'recruit', s: c.s as number, unit: c.unit as UnitType } : 'Recrutamento inválido.';
    case 'cancelRecruit':
      return st(c.s) && isInt(c.i) && c.i >= 0 && c.i < 10 ? { k: 'cancelRecruit', s: c.s as number, i: c.i } : 'Cancelamento inválido.';
    case 'build':
      return st(c.s) && BUILDING_ORDER.includes(c.b as BuildingType) ? { k: 'build', s: c.s as number, b: c.b as BuildingType } : 'Construção inválida.';
    case 'cancelBuild': case 'reserves':
      return st(c.s) ? { k: c.k, s: c.s as number } : 'Estado inválido.';
    case 'rally':
      if (!st(c.s)) return 'Estado inválido.';
      if (c.x === null) return { k: 'rally', s: c.s as number, x: null, y: 0 };
      return inMap(c.x, c.y) ? { k: 'rally', s: c.s as number, x: c.x as number, y: c.y as number } : 'Ponto inválido.';
    case 'ability': {
      const all = [...FACTIONS.lula.abilities, ...FACTIONS.bolso.abilities];
      if (!all.includes(c.id as AbilityId)) return 'Habilidade inválida.';
      const out: Command = { k: 'ability', id: c.id as AbilityId };
      if (c.x !== undefined || c.y !== undefined) { if (!inMap(c.x, c.y)) return 'Alvo inválido.'; out.x = c.x as number; out.y = c.y as number; }
      if (c.s !== undefined) { if (!st(c.s)) return 'Estado inválido.'; out.s = c.s as number; }
      return out;
    }
    case 'trade':
      return RES.includes(c.from as ResKey) && RES.includes(c.to as ResKey) && isNum(c.amount) && c.amount > 0 && c.amount <= 5000
        ? { k: 'trade', from: c.from as ResKey, to: c.to as ResKey, amount: Math.floor(c.amount) } : 'Troca inválida.';
    case 'objective':
      return isInt(c.s) && c.s >= -1 && c.s < 27 ? { k: 'objective', s: c.s } : 'Objetivo inválido.';
    case 'surrender': return { k: 'surrender' };
    case 'endPlanning': return { k: 'endPlanning' };
    default: return 'Comando desconhecido.';
  }
}

/**
 * Executa um comando para a facção `f`, respeitando as funções `roles`
 * (null = todas, usado no modo offline). Retorna null em caso de sucesso
 * ou a mensagem de erro.
 */
export function applyCommand(g: Game, f: Faction, roles: Role[] | null, raw: unknown): string | null {
  const c = parseCommand(raw, g.map.width, g.map.height);
  if (typeof c === 'string') return c;
  if (!g.canCommand(f)) return g.w.winner ? 'A partida terminou.' : 'Aguarde sua vez de dar ordens.';
  // unidades que este jogador pode comandar
  const mine = (list: number[]): number[] => list.filter((id) => {
    const u = g.unit(id);
    return !!u && u.f === f && u.type !== 'militia' && (!roles || roles.includes(u.ctrl));
  });
  const needUnits = (list: number[]) => { const m = mine(list); return m.length ? m : null; };
  switch (c.k) {
    case 'move': {
      const m = needUnits(c.ids);
      if (!m) return 'Nenhuma unidade sob o seu comando.';
      if (c.form === 'escolta') {
        const e = g.unit(c.escort ?? 0);
        if (!e || e.f !== f) return 'Escolha uma unidade aliada para escoltar.';
      }
      g.commandMove(f, m, c.x, c.y, c.aggressive, c.form ?? 'livre', c.escort ?? 0);
      return null;
    }
    case 'attack': {
      const m = needUnits(c.ids);
      if (!m) return 'Nenhuma unidade sob o seu comando.';
      g.commandAttack(f, m, c.target);
      return null;
    }
    case 'stop': { const m = needUnits(c.ids); if (!m) return 'Nenhuma unidade sob o seu comando.'; g.commandStop(f, m, c.hold); return null; }
    case 'rtb': { const m = needUnits(c.ids); if (!m) return 'Nenhuma unidade sob o seu comando.'; g.commandRTB(f, m); return null; }
    case 'recon': { const m = needUnits(c.ids); if (!m) return 'Nenhuma unidade sob o seu comando.'; return g.reconSensor(f, m); }
    case 'transfer': {
      const m = needUnits(c.ids);
      if (!m) return 'Só é possível transferir unidades sob o seu comando.';
      g.transferUnits(f, m, c.to);
      return null;
    }
    case 'recruit': {
      if (!roleCan(roles, `recruit:${c.unit}`)) return 'Sua função não recruta esta unidade.';
      return g.recruit(f, c.s, c.unit);
    }
    case 'cancelRecruit':
      if (!roleCan(roles, 'cancel') && !roleCan(roles, `recruit:${g.w.states[c.s]?.queue[c.i]?.type ?? ''}`)) return 'Sua função não pode cancelar esta produção.';
      g.cancelRecruit(f, c.s, c.i);
      return null;
    case 'build':
      if (!roleCan(roles, 'build')) return 'Apenas o Ministro de Logística constrói.';
      return g.build(f, c.s, c.b);
    case 'cancelBuild':
      if (!roleCan(roles, 'build')) return 'Apenas o Ministro de Logística cancela obras.';
      g.cancelBuild(f, c.s);
      return null;
    case 'rally':
      if (!roleCan(roles, 'rally')) return 'Sua função não define pontos de encontro.';
      if (g.w.states[c.s]?.owner !== f) return 'Estado não pertence a você.';
      g.setRally(f, c.s, c.x, c.y);
      return null;
    case 'ability':
      if (!roleCan(roles, 'ability')) return 'Apenas o Comandante Supremo ativa habilidades.';
      return g.useAbility(f, c.id, { x: c.x, y: c.y, s: c.s });
    case 'trade':
      if (!roleCan(roles, 'trade')) return 'Sua função não opera o mercado.';
      return g.trade(f, c.from, c.to, c.amount);
    case 'reserves':
      if (!roleCan(roles, 'reserves')) return 'Sua função não convoca reservas.';
      return g.callReserves(f, c.s);
    case 'objective':
      if (!roleCan(roles, 'objective')) return 'Apenas o Comandante Supremo define objetivos.';
      g.setTeamObjective(f, c.s);
      return null;
    case 'surrender':
      if (!roleCan(roles, 'surrender')) return 'Apenas o Comandante Supremo pode assinar a rendição.';
      g.surrender(f);
      return null;
    case 'endPlanning':
      if (roles) return 'Comando indisponível online.';
      g.endPlanning();
      return null;
  }
}

/** Pode o jogador com estas funções comandar a unidade? (usado pela interface) */
export function canControlUnit(roles: Role[] | null, ctrl: Role): boolean {
  return !roles || roles.includes(ctrl);
}
