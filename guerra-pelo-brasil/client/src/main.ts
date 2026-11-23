// GUERRA PELO BRASIL — CONQUISTA TOTAL
// Ponto de entrada: inicializa o Phaser, a interface e os menus.
import './ui/ui.css';
import { App } from './app';
import { getMap } from '@shared/sim/map';

type BootFn = (p: number, t?: string) => void;
const boot: BootFn = (window as unknown as { __boot?: BootFn }).__boot ?? (() => {});
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));

// erros inesperados: aviso amigável em vez de tela travada
window.addEventListener('error', (e) => showFatal(e.message));
window.addEventListener('unhandledrejection', (e) => showFatal(String((e as PromiseRejectionEvent).reason)));
let fatalShown = false;
function showFatal(msg: string): void {
  console.error('[Guerra pelo Brasil]', msg);
  if (fatalShown) return;
  fatalShown = true;
  const n = document.createElement('div');
  n.className = 'fatal';
  n.innerHTML = '<b>Algo deu errado.</b> <span>Seu progresso salvo continua seguro. Recarregue a página para continuar.</span> <button class="btn small">Recarregar</button>';
  n.querySelector('button')!.addEventListener('click', () => location.reload());
  document.body.appendChild(n);
}

async function start(): Promise<void> {
  boot(35, 'Preparando o mapa do Brasil…');
  await nextFrame();
  getMap(); // fronteiras reais, grade de navegação e terreno
  boot(65, 'Iniciando o motor gráfico…');
  await nextFrame();
  const app = new App();
  app.onReady = () => boot(100, 'Pronto!');
  app.boot(() => boot(85, 'Gerando texturas e o menu…'));
  // acesso para depuração e testes automatizados
  (window as unknown as { gpb: App }).gpb = app;
}

void start();
