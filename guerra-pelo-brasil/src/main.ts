// GUERRA PELO BRASIL — CONQUISTA TOTAL
// Ponto de entrada: inicializa o Phaser, a interface e os menus.
import './ui/ui.css';
import { App } from './app';

const app = new App();
app.boot();
// acesso para depuração e testes automatizados
(window as unknown as { gpb: App }).gpb = app;
