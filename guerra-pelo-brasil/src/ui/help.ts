// Conteúdo do "Como jogar", gerado a partir dos dados reais do jogo.
import { UNIT_DEFS, RECRUITABLE } from '../data/units';
import { BUILDING_DEFS, BUILDING_ORDER } from '../data/buildings';
import { ABILITIES, FACTIONS } from '../data/factions';
import { OBJECTIVES } from '../sim/objectives';
import { esc } from './dom';

const cost = (c: { money: number; fuel: number; steel: number; supplies: number }) =>
  [c.money && `$${c.money}`, c.fuel && `⛽${c.fuel}`, c.steel && `🔩${c.steel}`, c.supplies && `📦${c.supplies}`].filter(Boolean).join(' ');

export const SATIRE_NOTE = `Obra de ficção satírica que ridiculariza a polarização política — em que cada lado acusa o outro
de “nazista” ou “comunista”. Aqui, o absurdo foi levado ao pé da letra. Hitler e Stalin aparecem como caricaturas
ridículas: na vida real foram ditadores responsáveis por crimes contra a humanidade (Holocausto, gulags, expurgos e fomes),
e o jogo não glorifica o nazismo, o stalinismo nem qualquer político. Nenhuma violência real é incentivada.`;

export function howToPlayHTML(): string {
  const units = RECRUITABLE.map((t) => {
    const d = UNIT_DEFS[t];
    return `<tr><td><b>${esc(d.name)}</b><br><span class="note">${esc(d.desc)}</span></td><td>${d.hp}</td><td>${d.damage}${d.splash ? ' (área)' : ''}</td><td>${d.range}</td><td>${d.speed}</td><td>${cost(d.cost)}</td><td>${d.buildTime}s</td><td>${d.pop}</td><td>${d.requires ? esc(BUILDING_DEFS[d.requires].name) : '—'}</td></tr>`;
  }).join('');
  const builds = BUILDING_ORDER.map((b) => {
    const d = BUILDING_DEFS[b];
    return `<tr><td><b>${esc(d.name)}</b></td><td>${esc(d.desc)}</td><td>${d.cost.map(cost).join(' → ')}</td><td>${d.time.join(' / ')}s</td></tr>`;
  }).join('');
  const abil = (['bolso', 'lula'] as const).map((f) => `<li><b>${esc(FACTIONS[f].commander)} (${esc(FACTIONS[f].short)})</b>: ${FACTIONS[f].abilities
    .map((a) => `<i>${esc(ABILITIES[a].name)}</i> — ${esc(ABILITIES[a].desc)} (recarga ${ABILITIES[a].cooldown}s, custo ${cost(ABILITIES[a].cost)})`)
    .join('; ')}. Passivas: ${FACTIONS[f].passives.map(esc).join(', ')}.</li>`).join('');
  const objs = OBJECTIVES.map((o) => `<li><b>${esc(o.name)}</b> — ${esc(o.desc)} Recompensa: ${cost(o.reward)}</li>`).join('');
  return `
  <h3>Objetivo</h3>
  <p>Domine <b>os 26 estados e o Distrito Federal</b>. Você também vence se o inimigo <b>perder todos os territórios</b> ou <b>se render</b>:
  uma facção se rende quando controla <b>2 estados ou menos</b> enquanto o adversário controla <b>15 ou mais</b>. Você pode se render pelo menu de pausa.</p>

  <h3>Controles (mouse e teclado)</h3>
  <ul>
    <li><b>Clique esquerdo</b>: seleciona unidade ou estado. <b>Arrastar</b> com o esquerdo: seleção em área. <span class="kbd">Shift</span> adiciona à seleção. Duplo clique: todas do mesmo tipo na tela.</li>
    <li><b>Clique direito</b>: mover / atacar. Sobre um inimigo = atacar; sobre território inimigo ou neutro = avançar atacando; sobre uma capital inimiga = tomar a capital. Com um estado seu selecionado e nenhuma unidade: define o ponto de encontro.</li>
    <li><b>Arrastar com o direito ou o meio</b>, <span class="kbd">W A S D</span> ou setas: mover a câmera. <b>Roda do mouse</b>: zoom.</li>
    <li><span class="kbd">Espaço</span> pausa · <span class="kbd">+</span>/<span class="kbd">−</span> velocidade · <span class="kbd">Q</span> ataque-movimento · <span class="kbd">X</span> parar · <span class="kbd">H</span> manter posição · <span class="kbd">R</span> aviões voltam à base · <span class="kbd">E</span> selecionar tudo na tela · <span class="kbd">F</span> focar seleção · <span class="kbd">G</span> ir à sede · <span class="kbd">Ctrl</span>+<span class="kbd">1-9</span> criar grupo, <span class="kbd">1-9</span> selecionar grupo · <span class="kbd">Z</span> <span class="kbd">C</span> <span class="kbd">V</span> habilidades do comandante · <span class="kbd">Esc</span> cancelar / menu.</li>
  </ul>
  <h3>Controles por toque</h3>
  <ul><li>Toque numa unidade para selecionar; toque no mapa para dar a ordem. Arraste com um dedo para mover a câmera e use pinça para zoom.
  O botão <b>Seleção em área</b> transforma o próximo arraste numa caixa de seleção. <b>Selecionar tela</b> pega todas as suas unidades visíveis.</li></ul>

  <h3>Conquista de estados</h3>
  <p>Cada estado tem uma <b>guarnição</b> na capital (barra de vida acima do marcador). Ela atira em inimigos próximos e se regenera fora de combate.
  Para conquistar: <b>destrua a guarnição</b> e mantenha <b>Infantaria ou Tanques</b> no raio da capital <b>sem defensores inimigos</b> (inclusive milícias neutras).
  O anel colorido mostra o progresso da ocupação — mais tropas ocupam mais rápido. Estados neutros são defendidos por milícias locais.</p>

  <h3>Economia e suprimentos</h3>
  <p>Cada estado gera <b>Dinheiro, Combustível, Aço e Suprimentos</b>, além de <b>Capacidade Industrial</b> (acelera toda a produção).
  Estados <b>desconectados da sede</b> rendem metade (Depósitos Logísticos evitam isso). Tropas consomem suprimentos; tanques e helicópteros
  consomem combustível. Sem suprimentos, as tropas causam menos dano e sofrem desgaste. Unidades longe do seu território ficam <b>fora de suprimento</b>
  (triângulo amarelo) — mantenha a frente conectada ou leve Apoio Logístico. O <b>Mercado</b> (menu de pausa) troca recursos com perda de 50%.
  O <b>limite de tropas</b> cresce com estados, Quartéis e Depósitos. Dominar o DF dá +15% de dinheiro.</p>

  <h3>Unidades</h3>
  <table><tr><th>Unidade</th><th>Vida</th><th>Dano</th><th>Alcance</th><th>Veloc.</th><th>Custo</th><th>Tempo</th><th>Tropas</th><th>Requer</th></tr>${units}</table>
  <p class="note">Aviões fazem surtidas com 4 ataques e combustível limitado, depois voltam sozinhos para a Base Aérea mais próxima para rearmar (10 s).
  Artilharia dispara projéteis em arco com dano em área e não atira a menos de 40 px. Helicópteros e aviões ignoram o terreno.</p>

  <h3>Construções</h3>
  <table><tr><th>Construção</th><th>Efeito</th><th>Custo</th><th>Tempo</th></tr>${builds}</table>
  <p class="note">Cada estado tem um número de espaços (2 + importância/4). A fortificação não ocupa espaço. Ao capturar um estado, as construções são mantidas, mas a fortificação perde um nível.</p>

  <h3>Comandantes</h3>
  <ul>${abil}</ul>

  <h3>Objetivos de campanha</h3>
  <ul>${objs}</ul>

  <h3>Modos de jogo</h3>
  <ul>
    <li><b>Campanha</b>: escolha sua facção e conquiste o Brasil contra a IA. Salvamento automático a cada minuto; use <b>Continuar campanha</b>.</li>
    <li><b>Batalha rápida</b>: dificuldade, distribuição territorial, recursos e ritmo configuráveis.</li>
    <li><b>Dois jogadores locais</b>: por turnos no mesmo dispositivo. Cada turno: o Exército Lula planeja (jogo pausado), passa o dispositivo, o Exército Bolsonaro planeja, e então as ordens dos dois são executadas <b>simultaneamente</b> por 15 s. Ninguém vê as ordens do outro.</li>
    <li><b>Sandbox</b>: recursos ilimitados e produção acelerada para testar unidades e batalhas; IA opcional e troca de lado.</li>
  </ul>
  <h3>Aviso</h3><p class="note">${esc(SATIRE_NOTE)}</p>`;
}
