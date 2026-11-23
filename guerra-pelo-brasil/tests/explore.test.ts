import { it } from 'vitest';
import { aiVsAi, runFor, summary } from './helpers';

it('explora partida IA x IA', () => {
  for (const [dl, db, seed] of [['normal', 'normal', 1], ['normal', 'normal', 7], ['insano', 'facil', 3], ['facil', 'insano', 4]] as const) {
    const g = aiVsAi(dl, db, seed);
    const t0 = Date.now();
    const lines: string[] = [];
    for (let k = 0; k < 30 && !g.w.winner; k++) {
      runFor(g, 120);
      const fl = g.w.factions.lula, fb = g.w.factions.bolso;
      lines.push(summary(g) + ` | L res ${Object.values(fl.res).map((v) => v.toFixed(0)).join('/')} pop ${fl.pop}/${fl.popCap} | B res ${Object.values(fb.res).map((v) => v.toFixed(0)).join('/')} pop ${fb.pop}/${fb.popCap} | strat ${g.w.ai.lula?.strategy}/${g.w.ai.bolso?.strategy}`);
    }
    console.log(`== ${dl} vs ${db} seed ${seed} (${Date.now() - t0}ms) ${g.w.endReason}\n` + lines.join('\n'));
  }
});
