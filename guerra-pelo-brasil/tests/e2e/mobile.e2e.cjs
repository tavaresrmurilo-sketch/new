// Testes de interface mobile (toque real via CDP) + partida online celular × computador
// com queda de conexão. Requer Playwright/Chromium:  npm run build:all && npm run test:mobile
// E2E_SHOTS=pasta  -> salva capturas em várias resoluções para inspeção visual.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 9800 + Math.floor(Math.random() * 150);
const BASE = `http://127.0.0.1:${PORT}/`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'gpb-mob-'));
const SHOTS = process.env.E2E_SHOTS || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0;
const check = (cond, msg) => { if (!cond) throw new Error('FALHOU: ' + msg); ok++; console.log('  ✓ ' + msg); };
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name + '.png') }); };
const PHONE = { isMobile: true, hasTouch: true, deviceScaleFactor: 1, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36' };

/** Gestos de toque reais (eventos de toque do navegador). */
async function touch(cdp) {
  const send = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  return {
    async drag(x0, y0, x1, y1, steps = 8) {
      await send('touchStart', [{ x: x0, y: y0, id: 1 }]);
      for (let i = 1; i <= steps; i++) { await send('touchMove', [{ x: x0 + ((x1 - x0) * i) / steps, y: y0 + ((y1 - y0) * i) / steps, id: 1 }]); await sleep(16); }
      await send('touchEnd', []);
    },
    async pinch(cx, cy, d0, d1, steps = 8) {
      await send('touchStart', [{ x: cx - d0, y: cy, id: 1 }, { x: cx + d0, y: cy, id: 2 }]);
      for (let i = 1; i <= steps; i++) { const d = d0 + ((d1 - d0) * i) / steps; await send('touchMove', [{ x: cx - d, y: cy, id: 1 }, { x: cx + d, y: cy, id: 2 }]); await sleep(16); }
      await send('touchEnd', []);
    },
    async tap(x, y) {
      await send('touchStart', [{ x, y, id: 1 }]);
      await sleep(40);
      await send('touchEnd', []);
      await sleep(80);
    },
  };
}

async function startOffline(p) {
  await p.waitForSelector('.splash [data-ok]');
  await p.tap('.splash [data-ok]');
  await p.tap('[data-act="campaign"]');
  await p.tap('.modal [data-start]');
  await p.waitForSelector('.modal .foot [data-close]');
  await p.tap('.modal .foot [data-close]');
  await p.waitForSelector('.hud-top');
}

(async () => {
  const srv = spawn(process.execPath, ['dist-server/server.mjs'], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: DATA, LOG_LEVEL: 'warn' }, stdio: 'inherit',
  });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + 'health')).ok) break; } catch { /* subindo */ } await sleep(150); }
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  const watch = (p, name) => { p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`)); p.on('dialog', (d) => d.accept()); };
  try {
    // ------------------------------------------------------------ 1. layout em várias resoluções
    console.log('1. layout sem estouro de largura em várias resoluções');
    for (const [name, vp, mobile] of [['360x800', { width: 360, height: 800 }, true], ['390x844', { width: 390, height: 844 }, true], ['844x390', { width: 844, height: 390 }, true], ['768x1024', { width: 768, height: 1024 }, true], ['1920x1080', { width: 1920, height: 1080 }, false]]) {
      const ctx = await browser.newContext({ viewport: vp, ...(mobile ? PHONE : {}) });
      const p = await ctx.newPage();
      watch(p, name);
      await p.goto(BASE + '?renderer=canvas&fps=10', { waitUntil: 'domcontentloaded' });
      await p.waitForSelector('.splash [data-ok]');
      await p.click('.splash [data-ok]');
      await sleep(400);
      await shot(p, `m-${name}-menu`);
      const menuOk = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('.menu-btn')].every((b) => b.getBoundingClientRect().right <= innerWidth + 1));
      check(menuOk, `${name}: menu cabe na largura`);
      await p.click('[data-act="online"]');
      await p.waitForFunction(() => window.gpb.online.net.status === 'conectado');
      await p.fill('[data-nick]', 'Teste ' + name);
      await p.click('[data-om="create"]');
      await p.waitForSelector('.lobby .lobby-code b');
      await sleep(300);
      await shot(p, `m-${name}-lobby`);
      const lobbyOk = await p.evaluate(() => [...document.querySelectorAll('.lobby button, .lobby select')].every((b) => { const r = b.getBoundingClientRect(); return !r.width || (r.left >= -1 && r.right <= innerWidth + 1); }));
      check(lobbyOk, `${name}: botões do lobby dentro da tela`);
      await p.click('[data-lb="leave"]');
      await p.waitForSelector('.menu-root');
      await p.click('[data-act="campaign"]');
      await p.click('.modal [data-start]');
      await p.waitForSelector('.modal .foot [data-close]');
      await p.click('.modal .foot [data-close]');
      await p.waitForSelector('.hud-top');
      await sleep(500);
      await shot(p, `m-${name}-game`);
      const hudOk = await p.evaluate(() => {
        const vis = (sel) => [...document.querySelectorAll(sel)].filter((b) => getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().width > 0);
        const inside = (b) => { const r = b.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1; };
        return vis('.hud-top .speed .btn, .hud-top [data-act="pause"]').every(inside) && document.documentElement.scrollWidth <= innerWidth + 1;
      });
      check(hudOk, `${name}: pausa, velocidade e menu acessíveis na partida`);
      await ctx.close();
    }

    // ------------------------------------------------------------ 2. controles de toque na partida
    console.log('2. controles de toque (celular em paisagem 844x390)');
    {
      const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, ...PHONE });
      const p = await ctx.newPage();
      watch(p, 'toque');
      const cdp = await ctx.newCDPSession(p);
      const t = await touch(cdp);
      await p.goto(BASE + '?renderer=canvas&fps=20', { waitUntil: 'domcontentloaded' });
      await p.evaluate(() => { try { localStorage.removeItem('gpb.v1.tutorial'); } catch { /* */ } });
      await startOffline(p);
      await p.waitForSelector('.coach');
      check(true, 'tutorial inicial aparece na primeira partida');
      await p.tap('.coach [data-skip]');
      check(await p.$('.coach') === null, 'tutorial pode ser pulado');
      // pausa a simulação para medir só a interface
      await p.evaluate(() => { const sc = window.gpb.scene(); sc.userPaused = true; sc.cameras.main.setZoom(1); const hq = sc.sim.capital(sc.sim.w.factions.lula.hq); sc.centerOn(hq.x - 200, hq.y); });
      await sleep(300);
      const state = () => p.evaluate(() => { const sc = window.gpb.scene(); return { sx: sc.cameras.main.scrollX, z: sc.cameras.main.zoom, sel: sc.sel.size, moving: sc.sim.unitsOf('lula').filter((u) => u.order.kind === 'move').length, mode: sc.mode.kind, selState: sc.selState }; });
      const s0 = await state();
      await t.drag(420, 180, 270, 180);
      const s1 = await state();
      check(s1.sx - s0.sx > 100, `arrastar com um dedo move a câmera (${Math.round(s1.sx - s0.sx)} px)`);
      check(s1.sel === 0 && s1.moving === s0.moving && s1.selState === s0.selState, 'arrastar não seleciona nem dá ordens');
      await t.pinch(420, 180, 40, 120);
      const s2 = await state();
      check(s2.z > s1.z * 1.5, `pinça aumenta o zoom (${s1.z.toFixed(2)} → ${s2.z.toFixed(2)})`);
      // toque numa unidade: centraliza uma infantaria no meio da tela
      const unitId = await p.evaluate(() => { const sc = window.gpb.scene(); sc.cameras.main.setZoom(1.2); const u = sc.sim.unitsOf('lula').find((x) => x.type === 'infantry'); sc.centerOn(u.x, u.y); return u.id; });
      await sleep(300);
      const center = await p.evaluate((id) => { const sc = window.gpb.scene(); const c = sc.cameras.main; const u = sc.sim.unit(id); return { x: (u.x - c.worldView.x) * c.zoom, y: (u.y - c.worldView.y) * c.zoom }; }, unitId);
      await t.tap(center.x, center.y);
      const s3 = await state();
      check(s3.sel >= 1, `toque seleciona a unidade (${s3.sel})`);
      await t.tap(center.x - 150, center.y + 10);
      await sleep(200);
      const moved = await p.evaluate((id) => window.gpb.scene().sim.unit(id).order.kind, unitId);
      check(moved === 'move', 'toque no destino movimenta a tropa selecionada');
      // ferramenta "Área": arrastar vira caixa de seleção
      await p.tap('[data-act="desel"]');
      await p.tap('[data-act="box"]');
      await t.drag(center.x - 120, center.y - 70, center.x + 120, center.y + 40);
      const s4 = await state();
      check(s4.sel >= 2 && Math.abs(s4.sx - (await state()).sx) < 1, `ferramenta Área seleciona várias tropas (${s4.sel})`);
      // ataque-movimento + cancelar
      await p.tap('[data-act="amove"]');
      check((await state()).mode === 'attackMove', 'botão Atacar entra no modo de ataque');
      await p.tap('[data-act="desel"]');
      const s5 = await state();
      check(s5.mode === 'none' && s5.sel === 0, 'Cancelar sai do modo e limpa a seleção');
      // construir abre o painel do estado
      await p.tap('[data-act="buildmenu"]');
      await p.waitForSelector('[data-bk="fort"]');
      check((await state()).selState >= 0, 'Construir abre o painel de construção e recrutamento');
      await p.tap('.selpanel h3');
      check(await p.evaluate(() => document.querySelector('[data-sel]').classList.contains('collapsed')), 'painel inferior recolhe com um toque');
      await p.tap('.selpanel h3');
      // gavetas e minimapa
      await p.tap('[data-act="drawer-left"]');
      await sleep(300);
      const abilVisible = await p.evaluate(() => { const r = document.querySelector('.ability').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; });
      check(abilVisible, 'gaveta de Comando abre com as habilidades');
      await p.tap('[data-act="drawer-left"]');
      await p.tap('[data-act="toggle-map"]');
      check(await p.evaluate(() => getComputedStyle(document.querySelector('.minimap')).display !== 'none'), 'minimapa recolhível abre');
      await shot(p, 'm-touch-landscape');
      // botões com área de toque adequada (>= 40 px)
      const small = await p.evaluate(() => [...document.querySelectorAll('.actions .btn, .fab, .hud-top .btn')].filter((b) => { const r = b.getBoundingClientRect(); return r.width && (r.height < 36 || r.width < 36); }).length);
      check(small === 0, 'botões de toque com tamanho mínimo adequado');
      await ctx.close();
    }

    // ------------------------------------------------------------ 3. celular + computador na mesma partida online
    console.log('3. partida online: computador (anfitrião) × celular, com queda de internet');
    {
      const dctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
      const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ...PHONE });
      const D = await dctx.newPage(); const M = await mctx.newPage();
      watch(D, 'PC'); watch(M, 'celular');
      await D.goto(BASE + '?renderer=canvas&fps=10', { waitUntil: 'domcontentloaded' });
      await D.click('.splash [data-ok]');
      await D.click('[data-act="online"]');
      await D.waitForFunction(() => window.gpb.online.net.status === 'conectado');
      await D.fill('[data-nick]', 'PC Anfitrião');
      await D.selectOption('[data-cfg="size"]', '1');
      await D.selectOption('[data-cfg="bots"]', 'false');
      await D.selectOption('[data-cfg="prepTime"]', '0');
      await D.selectOption('[data-cfg="reconnectGrace"]', '60');
      await D.click('[data-om="create"]');
      await D.waitForSelector('.lobby .lobby-code b');
      const code = (await D.textContent('.lobby-code b')).trim();
      // o celular entra pelo link, em retrato
      await M.goto(`${BASE}?renderer=canvas&fps=10&sala=${code}`, { waitUntil: 'domcontentloaded' });
      await M.waitForSelector('.splash [data-ok]');
      await M.tap('.splash [data-ok]');
      await M.waitForSelector('[data-code]');
      await M.waitForFunction(() => window.gpb.online.net.status === 'conectado');
      await M.fill('[data-nick]', 'Celular');
      await M.tap('[data-om="join"]');
      await M.waitForSelector('.lobby');
      await D.click('.lteam.lula [data-lb="team"]');
      await M.tap('.lteam.bolso [data-lb="team"]');
      await M.waitForFunction(() => window.gpb.online.room.players.find((x) => x.id === window.gpb.online.you).team === 'bolso');
      await M.tap('[data-lb="ready"]');
      await D.waitForFunction(() => window.gpb.online.room.canStart);
      await shot(M, 'm-online-lobby-portrait');
      check(true, 'celular entrou pelo convite e ficou pronto no lobby (retrato)');
      // gira o celular para paisagem antes da partida
      await M.setViewportSize({ width: 844, height: 390 });
      await D.click('[data-lb="start"]');
      await M.waitForFunction(() => !!window.gpb.online.match && window.gpb.online.match.snaps > 2 && !!document.querySelector('.hud-top'), null, { timeout: 30000 });
      await D.waitForFunction(() => !!window.gpb.online.match && window.gpb.online.match.snaps > 2);
      check(true, 'computador e celular carregaram a mesma partida');
      // celular seleciona e ordena por toque
      const mc = await mctx.newCDPSession(M); const mt = await touch(mc);
      const target = await M.evaluate(() => { const sc = window.gpb.scene(); sc.cameras.main.setZoom(1.2); const u = sc.sim.unitsOf('bolso').find((x) => x.type === 'tank'); sc.centerOn(u.x, u.y); return u.id; });
      await sleep(400);
      const pos = await M.evaluate((id) => { const sc = window.gpb.scene(); const c = sc.cameras.main; const u = sc.sim.unit(id); return { x: (u.x - c.worldView.x) * c.zoom, y: (u.y - c.worldView.y) * c.zoom }; }, target);
      await mt.tap(pos.x, pos.y);
      await mt.tap(pos.x - 130, pos.y + 10);
      const diag = () => M.evaluate(([id, x, y]) => { const sc = window.gpb.scene(); const e = document.elementFromPoint(x, y); return { sel: [...sc.sel], order: sc.sim.unit(id)?.order, mode: sc.mode.kind, el: e && e.tagName + '.' + e.className, ctrl: sc.controllable, toasts: [...document.querySelectorAll('.toast')].map((t) => t.textContent) }; }, [target, pos.x - 130, pos.y + 10]);
      try { await M.waitForFunction((id) => window.gpb.online.match.sim.unit(id)?.order.kind === 'move', target, { timeout: 8000 }); } catch (e) { console.error('diagnóstico:', JSON.stringify(await diag()), JSON.stringify(pos)); await shot(M, 'm-online-fail'); throw e; }
      check(true, 'ordem dada por toque no celular foi validada pelo servidor');
      // chat do celular chega ao computador
      await M.tap('[data-act="drawer-right"]');
      await M.click('.chatpanel [data-scope]');
      await M.fill('[data-mchat]', 'Ola do celular');
      await M.press('[data-mchat]', 'Enter');
      await D.waitForFunction(() => window.gpb.online.chat.some((m) => m.text === 'Ola do celular'), null, { timeout: 8000 });
      check(true, 'chat enviado do celular aparece no computador');
      await M.tap('[data-act="drawer-right"]');
      await shot(M, 'm-online-landscape');
      // queda de internet no celular
      const snapsBefore = await M.evaluate(() => window.gpb.online.match.snaps);
      await mctx.setOffline(true);
      await M.evaluate(() => window.gpb.online.net['ws']?.close());
      await M.waitForFunction(() => !document.querySelector('[data-netbanner]').classList.contains('hidden'), null, { timeout: 8000 });
      check(true, 'aviso de conexão perdida aparece');
      await D.waitForFunction(() => window.gpb.online.room.players.some((p) => p.nick === 'Celular' && !p.connected), null, { timeout: 10000 });
      check(true, 'computador vê o celular desconectado');
      await sleep(3000);
      await mctx.setOffline(false);
      await M.waitForFunction(() => window.gpb.online.net.status === 'conectado', null, { timeout: 30000 });
      await M.waitForFunction((b) => window.gpb.online.match && window.gpb.online.match.snaps > b + 5, snapsBefore, { timeout: 20000 });
      check(await M.evaluate(() => document.querySelector('[data-netbanner]').classList.contains('hidden')), 'celular reconecta sozinho e o aviso some');
      check(await M.evaluate(() => window.gpb.online.match.team === 'bolso'), 'continua na mesma equipe após a queda');
      const tD = await D.evaluate(() => window.gpb.online.match.sim.w.time), tM = await M.evaluate(() => window.gpb.online.match.sim.w.time);
      check(Math.abs(tD - tM) < 3, 'relógios da partida sincronizados após reconectar');
      // fim: o computador (comandante) se rende; o celular vê o resultado
      await D.click('[data-act="pause"]');
      await D.click('[data-p="surrender"]');
      await M.waitForSelector('.end-hero h1', { timeout: 15000 });
      check((await M.textContent('.end-hero h1')).trim() === 'VITÓRIA', 'celular recebe a vitória');
      check((await D.textContent('.end-hero h1')).trim() === 'DERROTA', 'computador recebe a derrota');
      await shot(M, 'm-online-end');
    }
    check(errors.length === 0, `sem erros de JavaScript${errors.length ? ': ' + errors.join(' | ') : ''}`);
    console.log(`\nMOBILE OK: ${ok} verificações.`);
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
