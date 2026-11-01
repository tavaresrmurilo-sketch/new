/**
 * Cede a vez à thread principal, quebrando trabalhos longos em tarefas curtas
 * (melhora a responsividade e o Total Blocking Time).
 */
export function yieldToMain(ms = 0): Promise<void> {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (!ms && typeof scheduler?.yield === "function") return scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
