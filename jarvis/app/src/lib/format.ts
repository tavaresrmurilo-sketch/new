export function bytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return "N/A";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 || i === 0 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`.replace(".", ",");
}

export function rate(n: number | null | undefined): string {
  return n === null || n === undefined ? "N/A" : `${bytes(n)}/s`;
}

export function gb(n: number | null | undefined): string {
  return n === null || n === undefined ? "N/A" : `${n.toFixed(1).replace(".", ",")} GB`;
}

export function mb(n: number): string {
  return n >= 1024 ? gb(n / 1024) : `${Math.round(n)} MB`;
}

export function duration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}min`;
  if (m) return `${m}min`;
  return `${s}s`;
}

export function clock(date: Date): string {
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function longDate(date: Date): string {
  const s = date.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function when(ts: number): string {
  const d = new Date(ts * 1000);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  const hm = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `hoje, ${hm}`;
  if (d.toDateString() === y.toDateString()) return `ontem, ${hm}`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) + `, ${hm}`;
}

export function ago(tsMs: number): string {
  const s = Math.round((Date.now() - tsMs) / 1000);
  if (s < 5) return "agora";
  if (s < 60) return `há ${s}s`;
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  return `há ${Math.round(s / 3600)} h`;
}

export const CATEGORY_LABEL: Record<string, string> = {
  fact: "Fato",
  preference: "Preferência",
  project: "Projeto",
  task: "Tarefa",
  person: "Pessoa",
  other: "Outro",
};

export const LEVEL_LABEL = ["Leitura", "Reversível", "Importante", "Sensível"];
