// Testes do multiplayer online com o PROCESSO REAL do servidor e clientes
// independentes (cada um com sua conexão, sessão e mundo espelho).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { TestClient } from './net-client';
import { getMap } from '../shared/sim/map';
import type { Faction, Role } from '../shared/sim/types';

const PORT = 8900 + Math.floor(Math.random() * 500);
const URL = `ws://127.0.0.1:${PORT}/ws`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'gpb-mp-'));
let srv: ChildProcess | null = null;
let srvLog = '';
const map = getMap();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function startServer(): Promise<void> {
  srv = spawn(process.execPath, ['dist-server/server.mjs'], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: DATA, SIM_SPEED: '5', LOG_LEVEL: 'warn' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  srv.stdout!.on('data', (d) => { srvLog += d; });
  srv.stderr!.on('data', (d) => { srvLog += d; });
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/health`);
      if (r.ok) return;
    } catch { /* ainda subindo */ }
    await sleep(100);
  }
  throw new Error('servidor não subiu:\n' + srvLog);
}

async function stopServer(): Promise<void> {
  if (!srv) return;
  const p = srv;
  srv = null;
  await new Promise<void>((res) => { p.once('exit', () => res()); p.kill('SIGTERM'); setTimeout(res, 4000); });
}

beforeAll(async () => {
  execSync('node scripts/build-server.mjs', { stdio: 'ignore' });
  await startServer();
}, 60000);

afterAll(async () => {
  if (process.env.GPB_SHOW_SERVER_LOG) console.log(srvLog.slice(-4000));
  await stopServer();
  fs.rmSync(DATA, { recursive: true, force: true });
});

const ROLES: Role[] = ['comandante', 'infantaria', 'blindados', 'aereo', 'logistica'];

async function makeRoom(host: TestClient, config: Record<string, unknown>, nick = 'Anfitrião'): Promise<string> {
  host.send({ t: 'create', nick, config });
  await host.waitFor((m) => m.t === 'room');
  return host.room!.code;
}

describe('multiplayer online 5v5 (servidor real + 10 clientes independentes)', () => {
  it('cenário obrigatório completo', async () => {
    const c = Array.from({ length: 10 }, (_, i) => new TestClient(URL, `J${i + 1}`));
    await Promise.all(c.map((x) => x.connect()));
    expect(new Set(c.map((x) => x.token)).size).toBe(10);

    // 1. jogador A cria uma sala privada
    const code = await makeRoom(c[0], {
      name: 'Teste 5v5', public: false, size: 5, bots: false, prepTime: 0, fog: true, reconnect: true,
      reconnectGrace: 30, maxDuration: 0, events: false,
    }, 'Comandante A');
    expect(code).toMatch(/^BR-[A-Z0-9]{5}$/);

    // 2. mais nove entram pelo código
    for (let i = 1; i < 10; i++) {
      c[i].send({ t: 'join', code, nick: `Jogador ${i + 1}` });
      await c[i].waitFor((m) => m.t === 'room');
    }
    await c[0].until(() => c[0].room!.players.length === 10, 5000, '10 jogadores no lobby');

    // 3-5. cinco escolhem Lula, cinco Bolsonaro; cada um uma função; todos prontos
    for (let i = 0; i < 10; i++) {
      const team: Faction = i < 5 ? 'lula' : 'bolso';
      c[i].send({ t: 'lobby', a: 'team', team });
      c[i].send({ t: 'lobby', a: 'role', role: ROLES[i % 5] });
      c[i].send({ t: 'lobby', a: 'ready', ready: true });
    }
    await c[0].until(() => c[0].room!.canStart, 8000, 'requisitos de início');
    const view = c[0].room!;
    expect(view.players.filter((p) => p.team === 'lula')).toHaveLength(5);
    expect(view.players.filter((p) => p.team === 'bolso')).toHaveLength(5);
    // o lobby é o mesmo para todos
    for (const x of c) await x.until(() => x.room?.players.filter((p) => p.ready).length === 10, 5000, 'lobby sincronizado');

    // 6-7. anfitrião inicia; os dez carregam a mesma partida
    c[0].send({ t: 'lobby', a: 'start' });
    for (const x of c) await x.until(() => !!x.game && x.snaps > 2, 10000, 'carregar partida');
    for (let i = 0; i < 10; i++) {
      expect(c[i].team).toBe(i < 5 ? 'lula' : 'bolso');
      expect(c[i].roles).toEqual([ROLES[i % 5]]);
    }
    const owners = (x: TestClient) => x.game!.w.states.map((s) => s.owner).join(',');
    for (const x of c) expect(owners(x)).toBe(owners(c[0]));
    // névoa: um lado não recebe todas as unidades do outro
    const bolsoIdsTrue = new Set(c[5].game!.unitsOf('bolso').map((u) => u.id));
    expect(c[0].game!.unitsOf('bolso').length).toBeLessThan(bolsoIdsTrue.size);

    // permissões: o general de infantaria não comanda tanques nem tropas inimigas
    const lulaTank = c[0].game!.unitsOf('lula').find((u) => u.type === 'tank')!;
    expect((await c[1].cmd({ k: 'move', ids: [lulaTank.id], x: 1000, y: 1000, aggressive: false })).err).toMatch(/comando/);
    const enemyUnit = c[5].game!.unitsOf('bolso')[0];
    expect((await c[1].cmd({ k: 'move', ids: [enemyUnit.id], x: 1000, y: 1000, aggressive: false })).ok).toBe(false);
    expect((await c[1].cmd({ k: 'build', s: map.byUf.PE, b: 'fort' })).err).toMatch(/Logística/);
    expect((await c[1].cmd({ k: 'ability', id: 'massa' })).err).toMatch(/Comandante/);
    expect((await c[6].cmd({ k: 'recruit', s: map.byUf.PE, unit: 'infantry' })).ok).toBe(false); // estado do inimigo

    // 9. dois jogadores de equipes diferentes movimentam tropas simultaneamente
    const lulaInf = c[1].game!.unitsOf('lula').filter((u) => u.ctrl === 'infantaria').map((u) => u.id);
    const bolsoArmy = c[7].game!.unitsOf('bolso').filter((u) => u.ctrl === 'blindados').map((u) => u.id);
    const belem = map.states[map.byUf.PA].capital;
    const ma = map.states[map.byUf.MA].capital;
    const [r1, r2] = await Promise.all([
      c[1].cmd({ k: 'move', ids: lulaInf, x: ma.x, y: ma.y + 40, aggressive: false, form: 'linha' }),
      c[7].cmd({ k: 'move', ids: bolsoArmy, x: belem.x, y: belem.y, aggressive: true, form: 'coluna' }),
    ]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    // colega de equipe enxerga as ordens e o deslocamento
    const watched = c[0].game!.unit(lulaInf[0])!;
    const x0 = watched.x;
    await c[0].until(() => { const u = c[0].game!.unit(lulaInf[0]); return !!u && u.order.kind === 'move' && Math.abs(u.x - x0) > 1; }, 10000, 'colega vê o movimento');

    // 10-11. um jogador produz; outro da mesma equipe recebe a atualização
    const pe = map.byUf.PE;
    const lulaCount0 = c[2].game!.unitsOf('lula').length;
    expect((await c[4].cmd({ k: 'recruit', s: pe, unit: 'infantry' })).ok).toBe(true);
    await c[0].until(() => c[0].game!.w.states[pe].queue.length > 0 || c[0].game!.unitsOf('lula').length > lulaCount0, 8000, 'fila vista pelo comandante');
    await c[2].until(() => c[2].game!.unitsOf('lula').length > lulaCount0, 20000, 'nova unidade vista pelo general de blindados');

    // não é possível gastar recursos inexistentes
    let rejected = '';
    for (let i = 0; i < 25 && !rejected; i++) {
      const r = await c[4].cmd({ k: 'recruit', s: pe, unit: 'tank', money: 999999 });
      if (!r.ok && /Recursos insuficientes|Fila|Limite/.test(r.err ?? '')) rejected = r.err!;
    }
    expect(rejected).not.toBe('');
    for (const k of ['money', 'fuel', 'steel', 'supplies'] as const) expect(c[0].game!.w.factions.lula.res[k]).toBeGreaterThanOrEqual(0);

    // o resto do exército azul (infantaria) também avança sobre Belém
    const bolsoInf = c[6].game!.unitsOf('bolso').filter((u) => u.ctrl === 'infantaria').map((u) => u.id);
    expect((await c[6].cmd({ k: 'move', ids: bolsoInf, x: belem.x, y: belem.y, aggressive: true })).ok).toBe(true);

    // 12-13. o inimigo conquista um estado e todos recebem o estado correto
    const pa = map.byUf.PA;
    await c[5].until(() => c[5].game!.w.states[pa].owner === 'bolso', 170000, 'conquista do Pará');
    for (const x of c) await x.until(() => x.game!.w.states[pa].owner === 'bolso', 5000, 'todos veem a conquista');
    for (const x of c) expect(owners(x)).toBe(owners(c[5]));
    if (process.env.GPB_SHOW_SERVER_LOG) console.log('Pará conquistado no tempo de jogo', c[5].game!.w.time.toFixed(1), 's');

    // 14-15. um jogador desconecta e reconecta recuperando função e estado
    const token = c[3].token;
    c[3].close();
    await c[0].until(() => c[0].room!.players.some((p) => p.id === c[3].id && !p.connected), 5000, 'desconexão visível');
    await sleep(800);
    const again = new TestClient(URL, 'J4-reconectado');
    await again.connect(token);
    const welcome = again.msgs.find((m) => m.t === 'welcome') as { resumed: string | null };
    expect(welcome.resumed).toBe(code);
    await again.until(() => !!again.game && again.snaps > 1, 8000, 'estado recuperado');
    expect(again.team).toBe('lula');
    expect(again.roles).toEqual(['aereo']);
    expect(Math.abs(again.game!.w.time - c[0].game!.w.time)).toBeLessThan(3);
    expect(owners(again)).toBe(owners(c[0]));
    await c[0].until(() => c[0].room!.players.some((p) => p.id === again.id && p.connected), 5000, 'reconexão visível');
    c[3] = again;

    // 16-17. fim por condição válida (rendição pelo comandante) e mesmo resultado para todos
    expect((await c[6].cmd({ k: 'surrender' })).err).toMatch(/Comandante/);
    expect((await c[5].cmd({ k: 'surrender' })).ok).toBe(true);
    for (const x of c) await x.until(() => !!x.result, 8000, 'resultado final');
    for (const x of c) {
      expect(x.result!.winner).toBe('lula');
      expect(x.result!.reason).toBe(c[0].result!.reason);
      expect(x.result!.duration).toBe(c[0].result!.duration);
    }
    expect(c[0].result!.players).toHaveLength(10);
    expect(c[0].result!.teams.bolso.captured).toBeGreaterThanOrEqual(1);
    c.forEach((x) => x.close());
  }, 240000);

  it('salas isoladas, bots identificados e IA assumindo função de desconectado', async () => {
    const a = new TestClient(URL, 'A'), b = new TestClient(URL, 'B');
    await Promise.all([a.connect(), b.connect()]);
    const codeA = await makeRoom(a, { size: 2, bots: true, prepTime: 0, reconnect: false }, 'Ana');
    const codeB = await makeRoom(b, { size: 1, bots: true, prepTime: 0 }, 'Beto');
    expect(codeA).not.toBe(codeB);
    a.send({ t: 'lobby', a: 'team', team: 'lula' });
    a.send({ t: 'lobby', a: 'role', role: 'logistica' });
    b.send({ t: 'lobby', a: 'team', team: 'bolso' });
    await a.until(() => !!a.room?.canStart, 5000, 'sala A pronta');
    await b.until(() => !!b.room?.canStart, 5000, 'sala B pronta');
    a.send({ t: 'lobby', a: 'start' });
    b.send({ t: 'lobby', a: 'start' });
    await a.until(() => !!a.game && a.snaps > 1, 8000, 'A carregou');
    await b.until(() => !!b.game && b.snaps > 1, 8000, 'B carregou');
    // bots aparecem explicitamente como BOT
    const botsA = a.room!.players.filter((p) => p.bot);
    expect(botsA).toHaveLength(3);
    expect(botsA.every((p) => p.nick.startsWith('BOT'))).toBe(true);
    // isolamento: produzir na sala A não altera a sala B
    const qB = b.game!.w.states.map((s) => s.queue.length).join(',');
    expect((await a.cmd({ k: 'recruit', s: map.byUf.PE, unit: 'infantry' })).ok).toBe(true);
    await sleep(600);
    expect(b.game!.w.states.map((s) => s.queue.length).join(',')).toBe(qB);
    // a IA (bots) realmente joga: o lado azul da sala A produz e se move
    await a.until(() => a.game!.w.factions.bolso.stats.produced > 0, 30000, 'bots produzindo');
    // sem reconexão: quem cai tem a função assumida pela IA imediatamente
    a.close();
    await sleep(800);
    const spec = new TestClient(URL, 'espectador');
    await spec.connect();
    spec.send({ t: 'join', code: codeA, nick: 'Olheiro', spectator: true });
    await spec.until(() => !!spec.room && !!spec.game && spec.snaps > 0, 8000, 'espectador carregou');
    const ana = spec.room!.players.find((p) => p.nick === 'Ana')!;
    expect(ana.connected).toBe(false);
    expect(ana.aiCover).toBe(true);
    // espectador vê os dois lados sem névoa e não dá ordens
    expect(spec.game!.unitsOf('lula').length).toBeGreaterThan(0);
    expect(spec.game!.unitsOf('bolso').length).toBeGreaterThan(0);
    expect((await spec.cmd({ k: 'stop', ids: [1] })).err).toMatch(/Espectadores/);
    b.close();
    spec.close();
  }, 90000);

  it('protege contra mensagens inválidas, fraude e excesso de mensagens', async () => {
    const a = new TestClient(URL, 'Hacker');
    await a.connect();
    a.ws.send('{isto não é json');
    a.send({ t: 'naoexiste' });
    a.send({ t: 'join', code: 'X; DROP TABLE', nick: 'x' });
    await sleep(300);
    expect(a.errors.some((e) => /malformada/.test(e))).toBe(true);
    expect(a.errors.some((e) => /Código inválido/.test(e))).toBe(true);
    // apelido e chat são sanitizados
    const code = await makeRoom(a, { size: 1, bots: true, prepTime: 0 }, '<b>Hacker</b>\u0007');
    expect(a.room!.players[0].nick).toBe('bHacker/b');
    a.send({ t: 'chat', scope: 'all', text: '<script>alert(1)</script>' });
    const chat = (await a.waitFor((m) => m.t === 'chat' && !m.msg.system)) as { msg: { text: string } };
    expect(chat.msg.text).not.toContain('<');
    a.send({ t: 'lobby', a: 'team', team: 'lula' });
    await a.until(() => !!a.room?.canStart, 5000, 'pronto');
    a.send({ t: 'lobby', a: 'start' });
    await a.until(() => !!a.game && a.snaps > 0, 8000, 'partida');
    // valores forjados são ignorados; comandos com forma inválida são recusados
    expect((await a.cmd({ k: 'trade', from: 'money', to: 'fuel', amount: -500 })).ok).toBe(false);
    expect((await a.cmd({ k: 'move', ids: ['1; drop'], x: 1, y: 1 })).ok).toBe(false);
    expect((await a.cmd({ k: 'move', ids: [1], x: 1e12, y: 5 })).ok).toBe(false);
    expect((await a.cmd({ k: 'recruit', s: 999, unit: 'infantry' })).ok).toBe(false);
    // comando duplicado (mesmo id) é idempotente
    const id = 777;
    a.send({ t: 'cmd', id, c: { k: 'recruit', s: map.byUf.PE, unit: 'infantry' } });
    a.send({ t: 'cmd', id, c: { k: 'recruit', s: map.byUf.PE, unit: 'infantry' } });
    await sleep(500);
    expect(a.msgs.filter((m) => m.t === 'ack' && m.id === id)).toHaveLength(2);
    await a.until(() => a.game!.w.states[map.byUf.PE].queue.length >= 1, 3000, 'fila');
    expect(a.game!.w.states[map.byUf.PE].queue.length).toBe(1);
    // excesso de mensagens é limitado
    for (let i = 0; i < 150; i++) a.send({ t: 'cmd', id: 1000 + i, c: { k: 'stop', ids: [1] } });
    await sleep(800);
    expect(a.msgs.some((m) => (m.t === 'ack' && m.err === 'Ordens rápidas demais.') || (m.t === 'error' && m.code === 'rate'))).toBe(true);
    // mensagem gigante derruba só a conexão do abusador
    const big = new WebSocket(URL);
    await new Promise((r) => big.once('open', r));
    const closed = new Promise<number>((r) => big.once('close', (c2) => r(c2)));
    big.send('x'.repeat(40000));
    expect(await closed).toBe(1009);
    const health = await (await fetch(`http://127.0.0.1:${PORT}/health`)).json();
    expect(health.status).toBe('ok');
    void code;
    a.close();
  }, 60000);

  it('recupera a partida após reinício do servidor', async () => {
    const a = new TestClient(URL, 'Persistente');
    await a.connect();
    const code = await makeRoom(a, { size: 1, bots: true, prepTime: 0 }, 'Resiliente');
    a.send({ t: 'lobby', a: 'team', team: 'bolso' });
    await a.until(() => !!a.room?.canStart, 5000, 'pronto');
    a.send({ t: 'lobby', a: 'start' });
    await a.until(() => !!a.game && a.game.w.time > 5, 15000, 'partida rodando');
    const t0 = a.game!.w.time;
    const token = a.token;
    a.close();
    await stopServer();
    expect(fs.existsSync(path.join(DATA, 'rooms', `${code}.json`))).toBe(true);
    await startServer();
    const b = new TestClient(URL, 'Persistente-2');
    await b.connect(token);
    expect((b.msgs.find((m) => m.t === 'welcome') as { resumed: string | null }).resumed).toBe(code);
    await b.until(() => !!b.game && b.snaps > 1, 8000, 'estado restaurado');
    expect(b.team).toBe('bolso');
    expect(b.game!.w.time).toBeGreaterThanOrEqual(t0 - 0.1);
    expect((await b.cmd({ k: 'recruit', s: map.byUf.PR, unit: 'infantry' })).ok).toBe(true);
    const hist = await (await fetch(`http://127.0.0.1:${PORT}/api/history`)).json();
    expect(Array.isArray(hist.history)).toBe(true);
    expect(hist.history.some((h: { code: string }) => h.code)).toBe(true); // a partida 5v5 anterior ficou registrada
    b.close();
  }, 90000);
});
