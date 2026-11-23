// Utilitários de DOM e formatação.

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function el<T extends HTMLElement = HTMLElement>(html: string): T {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as T;
}

export function fmt(n: number): string {
  if (!isFinite(n)) return '∞';
  if (n >= 99999) return '∞';
  if (n >= 10000) return (n / 1000).toFixed(1).replace('.', ',') + 'k';
  return Math.floor(n).toLocaleString('pt-BR');
}

export function fmtRate(n: number): string {
  const v = Math.round(n * 60);
  return (v >= 0 ? '+' : '') + v + '/min';
}

export function fmtTime(sec: number): string {
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Modal genérico. Retorna o elemento raiz (já anexado) e uma função para fechar. */
export function modal(root: HTMLElement, title: string, body: string, foot = '', narrow = false): { back: HTMLElement; close: () => void } {
  const back = el(`<div class="modal-back"><div class="modal${narrow ? ' narrow' : ''}" role="dialog" aria-label="${esc(title)}">
    <header><h2>${esc(title)}</h2><button class="btn icon" data-close aria-label="Fechar">✕</button></header>
    <div class="body">${body}</div>${foot ? `<div class="foot">${foot}</div>` : ''}</div></div>`);
  const close = () => back.remove();
  back.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t === back || t.closest('[data-close]')) close();
  });
  root.appendChild(back);
  return { back, close };
}
