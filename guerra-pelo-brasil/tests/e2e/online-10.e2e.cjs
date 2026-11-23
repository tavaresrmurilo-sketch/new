// Teste de ponta a ponta: 10 navegadores independentes jogando a mesma partida online
// pela interface real. Requer o Playwright com Chromium instalado:
//   npx playwright install chromium     (uma vez)
//   npm run build:all && npm run test:e2e
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 9400 + Math.floor(Math.random() * 400);
const BASE = `http://127.0.0.1:${PORT}/`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'gpb-e2e-'));
const SHOTS = process.env.E2E_SHOTS || '';
const ROLES = ['comandante', 'infantaria', 'blindados', 'aereo', 'logistica'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0;
const check = (cond, msg) => { if (!cond) throw new Error('FALHOU: ' + msg); ok++; console.log('  ✓ ' + msg); };

(async () => {
  const srv = spawn(process.execPath, ['dist-server/server.mjs'], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: DATA, SIM_SPEED: '5', LOG_LEVEL: 'warn' }, stdio: 'inherit',
  });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + 'health')).ok) break; } catch { /* subindo */ } await sleep(150); }
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  const pages = [];
  try {
    for (let i = 0; i < 10; i++) {
      const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
      ctx.setDefaultTimeout(90000);
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errors.push(`J${i + 1}: ${e.message}`));
      p.on('console', (m) => { if (m.type() === 'error') errors.push(`J${i + 1} console: ${m.text()}`); });
      p.on('dialog', (d) => d.accept());
      pages.push(p);
    }
    const [host] = pages;
    console.log('1. anfitrião cria sala privada 5v5 pela interface');
    await host.goto(BASE + '?fps=4&renderer=canvas', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await host.click('.splash [data-ok]');
    await host.waitForFunction(() => window.gpb.online.net.status === 'conectado');
    await host.click('[data-act="online"]');
    await host.fill('[data-nick]', 'Jogador 1');
    await host.selectOption('[data-cfg="bots"]', 'false');
    await host.selectOption('[data-cfg="prepTime"]', '0');
    await host.selectOption('[data-cfg="events"]', 'false');
    await host.click('[data-om="create"]');
    await host.waitForSelector('.lobby .lobby-code b');
    const code = (await host.textContent('.lobby-code b')).trim();
    check(/^BR-[A-Z0-9]{5}$/.test(code), `código curto gerado (${code})`);

    console.log('2. nove jogadores entram pelo link de convite');
    for (let i = 1; i < 10; i++) {
      const p = pages[i];
      await p.goto(`${BASE}?fps=4&renderer=canvas&sala=${code}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await p.click('.splash [data-ok]');
      await p.waitForSelector('[data-code]');
      await p.waitForFunction(() => window.gpb.online.net.status === 'conectado');
      await p.fill('[data-nick]', `Jogador ${i + 1}`);
      await p.click('[data-om="join"]');
      await p.waitForSelector('.lobby');
    }
    await host.waitForFunction(() => window.gpb.online.room.players.length === 10);
    check(true, '10 jogadores no lobby');

    console.log('3-5. equipes, funções e pronto');
    for (let i = 0; i < 10; i++) {
      const p = pages[i];
      const team = i < 5 ? 'lula' : 'bolso';
      await p.click(`.lteam.${team} [data-lb="team"]`);
      await p.waitForFunction((t) => window.gpb.online.room.players.find((x) => x.id === window.gpb.online.you).team === t, team);
      await p.selectOption('[data-lrole]', ROLES[i % 5]);
      await p.waitForFunction((r) => window.gpb.online.room.players.find((x) => x.id === window.gpb.online.you).role === r, ROLES[i % 5]);
      if (i > 0) await p.click('[data-lb="ready"]');
    }
    await host.waitForFunction(() => window.gpb.online.room.canStart, null, { timeout: 15000 });
    check(true, 'requisitos de início cumpridos (5 Lula, 5 Bolsonaro, todos prontos)');
    if (SHOTS) await host.screenshot({ path: path.join(SHOTS, 'e2e-lobby.png') });

    console.log('6-8. anfitrião inicia e os dez carregam a mesma partida');
    await host.click('[data-lb="start"]');
    for (const p of pages) await p.waitForFunction(() => !!window.gpb.online.match && window.gpb.online.match.snaps > 2 && !!document.querySelector('.hud-top'), null, { timeout: 30000 });
    const owners = await Promise.all(pages.map((p) => p.evaluate(() => window.gpb.online.match.sim.w.states.map((s) => s.owner).join(''))));
    check(owners.every((o) => o === owners[0]), 'mesmo território em todos os navegadores');
    const roles = await Promise.all(pages.map((p) => p.evaluate(() => window.gpb.online.match.roles.join(','))));
    check(roles.every((r, i) => r === ROLES[i % 5]), 'cada um recebeu sua função militar');

    console.log('9. jogadores de equipes diferentes movem tropas ao mesmo tempo (pela interface)');
    const moveAll = async (p, uf) => {
      // seleciona as próprias tropas na tela da sede (tecla E) e dá a ordem com o botão direito no alvo
      await p.evaluate(() => {
        const sc = window.gpb.scene();
        const hq = sc.sim.capital(sc.sim.w.factions[sc.me].hq);
        sc.cameras.main.setZoom(0.35);
        sc.centerOn(hq.x, hq.y);
      });
      await sleep(500);
      await p.keyboard.press('e');
      await sleep(300);
      const n = await p.evaluate((u) => {
        const sc = window.gpb.scene();
        const t = sc.sim.map.states[sc.sim.map.byUf[u]].capital;
        sc.centerOn(t.x, t.y);
        return sc.sel.size;
      }, uf);
      await sleep(500);
      await p.mouse.click(550, 330, { button: 'right' });
      return n;
    };
    const [n1, n2] = await Promise.all([moveAll(pages[1], 'PI'), moveAll(pages[7], 'SP')]);
    check(n1 > 0 && n2 > 0, `seleção pela interface (${n1} infantarias, ${n2} blindados)`);
    await pages[0].waitForFunction(() => window.gpb.online.match.sim.unitsOf('lula').some((u) => u.ctrl === 'infantaria' && u.order.kind === 'move'), null, { timeout: 8000 });
    check(true, 'comandante vê a ordem do general de infantaria');
    await pages[5].waitForFunction(() => window.gpb.online.match.sim.unitsOf('bolso').some((u) => u.ctrl === 'blindados' && u.order.kind === 'move'), null, { timeout: 8000 });
    check(true, 'comandante azul vê a ordem do general de blindados');
    const foreign = await pages[1].evaluate(() => window.gpb.scene().sel.size && [...window.gpb.scene().sel].every((id) => window.gpb.online.match.sim.unit(id)?.ctrl === 'infantaria'));
    check(foreign, 'o general de infantaria só seleciona a própria infantaria');

    console.log('10-11. ministro de logística produz; colega recebe a atualização');
    const before = await pages[2].evaluate(() => window.gpb.online.match.sim.unitsOf('lula').length);
    await pages[4].evaluate(() => { const sc = window.gpb.scene(); sc.selectState(sc.sim.w.factions.lula.hq); });
    await pages[4].waitForSelector('[data-rk="infantry"]');
    await pages[4].dispatchEvent('[data-rk="infantry"]', 'pointerdown');
    await pages[2].waitForFunction((b) => window.gpb.online.match.sim.unitsOf('lula').length > b, before, { timeout: 30000 });
    check(true, 'nova unidade aparece para o general de blindados');
    await pages[1].evaluate(() => { const sc = window.gpb.scene(); sc.selectState(sc.sim.w.factions.lula.hq); });
    await pages[1].waitForSelector('[data-rk="tank"]');
    check(await pages[1].isDisabled('[data-rk="tank"]'), 'general de infantaria não pode recrutar tanques (botão desativado)');
    check(await pages[1].isDisabled('[data-bk="fort"]'), 'general de infantaria não pode construir');

    console.log('12-13. o inimigo conquista um estado; todos recebem');
    // o lado azul manda todo o exército terrestre contra o Pará (neutro)
    const sendTo = (role) => { const sc = window.gpb.scene(); const ids = sc.sim.unitsOf('bolso').filter((u) => u.ctrl === role).map((u) => u.id); const c = sc.sim.map.states[sc.sim.map.byUf.PA].capital; sc.send({ k: 'move', ids, x: c.x, y: c.y, aggressive: true }); };
    await pages[6].evaluate(sendTo, 'infantaria');
    await pages[7].evaluate(sendTo, 'blindados');
    await pages[5].waitForFunction(() => window.gpb.online.match.sim.w.states[window.gpb.online.match.sim.map.byUf.PA].owner === 'bolso', null, { timeout: 240000, polling: 500 });
    for (const p of pages) await p.waitForFunction(() => window.gpb.online.match.sim.w.states[window.gpb.online.match.sim.map.byUf.PA].owner === 'bolso', null, { timeout: 5000 });
    check(true, 'Pará conquistado pelo lado azul e visto pelos 10 navegadores');

    console.log('14-15. um jogador recarrega a página (desconecta) e volta à partida');
    await pages[3].reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
    await pages[3].waitForFunction(() => !!window.gpb.online.match && window.gpb.online.match.snaps > 1 && !!document.querySelector('.hud-top'), null, { timeout: 20000 });
    const r3 = await pages[3].evaluate(() => ({ team: window.gpb.online.match.team, roles: window.gpb.online.match.roles.join(',') }));
    check(r3.team === 'lula' && r3.roles === 'aereo', 'reconectou com a mesma equipe e função');
    const t0 = await pages[0].evaluate(() => window.gpb.online.match.sim.w.time);
    const t3 = await pages[3].evaluate(() => window.gpb.online.match.sim.w.time);
    check(Math.abs(t0 - t3) < 4, 'recuperou o estado atual da partida');
    if (SHOTS) await pages[3].screenshot({ path: path.join(SHOTS, 'e2e-reconnected.png') });

    console.log('16-17. comandante azul se rende pelo menu; todos recebem o mesmo resultado');
    await pages[5].click('[data-act="pause"]');
    await pages[5].click('[data-p="surrender"]');
    for (const p of pages) await p.waitForSelector('.end-hero h1', { timeout: 15000 });
    const titles = await Promise.all(pages.map((p) => p.textContent('.end-hero h1')));
    const reasons = await Promise.all(pages.map((p) => p.textContent('.end-hero p')));
    check(titles.slice(0, 5).every((t) => t.trim() === 'VITÓRIA') && titles.slice(5).every((t) => t.trim() === 'DERROTA'), 'Lula vence e Bolsonaro perde em todas as telas');
    check(reasons.every((r) => r === reasons[0]), 'mesmo motivo de fim de jogo em todas as telas');
    if (SHOTS) await pages[0].screenshot({ path: path.join(SHOTS, 'e2e-end.png') });
    check(errors.length === 0, `sem erros de JavaScript nos navegadores${errors.length ? ': ' + errors.join(' | ') : ''}`);
    console.log(`\nE2E OK: ${ok} verificações em 10 navegadores independentes.`);
  } catch (e) {
    console.error(e.message);
    console.error('Erros dos navegadores:', errors.join('\n'));
    process.exitCode = 1;
  } finally {
    await browser.close();
    await new Promise((r) => { srv.once('exit', r); srv.kill('SIGTERM'); setTimeout(r, 5000); });
    fs.rmSync(DATA, { recursive: true, force: true });
  }
})();
