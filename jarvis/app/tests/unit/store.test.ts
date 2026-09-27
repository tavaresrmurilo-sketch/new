import { beforeEach, describe, expect, it } from "vitest";
import { bytes, duration, gb, longDate } from "../../src/lib/format";
import { displayState, useStore } from "../../src/state/store";

const initial = useStore.getState();

beforeEach(() => {
  useStore.setState({ ...initial, transcript: [], tools: [], tasks: {}, permissions: [], notifications: [], toasts: [] }, true);
});

describe("store event handling", () => {
  it("streams ai.delta into one entry and finalises with ai.response", () => {
    const { handleEvent } = useStore.getState();
    handleEvent("command.received", { text: "oi", source: "text", ts: 1 });
    handleEvent("ai.delta", { text: "Olá" });
    handleEvent("ai.delta", { text: ", tudo bem?" });
    let t = useStore.getState().transcript;
    expect(t).toHaveLength(2);
    expect(t[1]).toMatchObject({ role: "jarvis", text: "Olá, tudo bem?", streaming: true });
    handleEvent("ai.response", { text: "Olá, tudo bem?", kind: "answer", ts: 2 });
    t = useStore.getState().transcript;
    expect(t).toHaveLength(2);
    expect(t[1].streaming).toBeFalsy();
  });

  it("pairs tool.started with tool.completed", () => {
    const { handleEvent } = useStore.getState();
    handleEvent("tool.started", { tool: "system_status", name: "Status", summary: "Ler métricas" });
    handleEvent("tool.completed", { tool: "system_status", summary: "Ler métricas", message: "ok", durationMs: 3, verified: null });
    const tools = useStore.getState().tools;
    expect(tools).toHaveLength(1);
    expect(tools[0].status).toBe("ok");
  });

  it("keeps a bounded metrics history", () => {
    const { handleEvent } = useStore.getState();
    for (let i = 0; i < 120; i++) {
      handleEvent("system.metrics", { cpu: { percent: i }, memory: { percent: 50 }, network: { downBps: 1, upBps: 1 } });
    }
    expect(useStore.getState().history.cpu).toHaveLength(90);
    expect(useStore.getState().history.cpu.at(-1)).toBe(119);
  });

  it("removes resolved permission requests", () => {
    const { handleEvent } = useStore.getState();
    handleEvent("permission.request", { id: "p1", level: 3, summary: "Apagar" });
    expect(useStore.getState().permissions).toHaveLength(1);
    handleEvent("permission.resolved", { id: "p1", approved: false });
    expect(useStore.getState().permissions).toHaveLength(0);
  });

  it("derives the displayed core state from audio + server state", () => {
    const base = { audio: { ...initial.audio }, serverState: "IDLE" as const };
    expect(displayState(base)).toBe("IDLE");
    expect(displayState({ ...base, serverState: "THINKING" })).toBe("THINKING");
    expect(displayState({ ...base, audio: { ...base.audio, capturing: true } })).toBe("LISTENING");
    expect(displayState({ audio: { ...base.audio, speaking: true, capturing: true }, serverState: "EXECUTING" })).toBe("SPEAKING");
    expect(displayState({ ...base, audio: { ...base.audio, followUpUntil: Date.now() + 5000 } })).toBe("LISTENING");
  });

  it("opens modules from ui.action events", () => {
    useStore.getState().handleEvent("ui.action", { action: "open:settings" });
    expect(useStore.getState().module).toBe("settings");
  });
});

describe("format", () => {
  it("never invents values", () => {
    expect(bytes(null)).toBe("N/A");
    expect(gb(undefined)).toBe("N/A");
  });
  it("formats sizes and durations in pt-BR", () => {
    expect(bytes(1536)).toBe("1,5 KB");
    expect(duration(3 * 3600 + 120)).toBe("3h 2min");
    expect(longDate(new Date(2026, 8, 27))).toMatch(/^Domingo, 27 de setembro$/);
  });
});
