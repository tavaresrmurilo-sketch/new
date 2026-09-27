import { useState } from "react";
import { act, useRpc } from "../../hooks";
import type { ProviderStatus } from "../../lib/types";
import { runtime } from "../../runtime";
import { useStore } from "../../state/store";
import { IconCloud, IconDownload, IconMic, IconScreen, IconShield } from "../icons";
import { Toggle } from "../primitives";

interface Summary {
  dataDir: string;
  counts: Record<string, number>;
  provider: ProviderStatus;
  secrets: Record<string, boolean>;
  permissions: Record<string, string>;
  telemetry: string;
  settings: { screen_capture_enabled: boolean; memory_enabled: boolean; history_enabled: boolean; history_retention_days: number; external_provider_consent: boolean };
}

const SCOPES: { scope: string; label: string; count: string }[] = [
  { scope: "history", label: "Histórico de conversas", count: "messages" },
  { scope: "activity", label: "Registro de atividade", count: "activity" },
  { scope: "memories", label: "Memórias de longo prazo", count: "memories" },
  { scope: "tasks", label: "Histórico de tarefas", count: "tasks" },
  { scope: "file_index", label: "Índice de arquivos", count: "files" },
];

export function PrivacyCenter() {
  const audio = useStore((s) => s.audio);
  const capturing = useStore((s) => s.capturingScreen);
  const externalAt = useStore((s) => s.externalAt);
  const settings = useStore((s) => s.settings);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const { data } = useRpc<Summary>("privacy.summary", {}, [nonce]);

  const clear = async (scope: string) => {
    if (await act(() => runtime.rpc("privacy.clear", { scope }), "Dados apagados")) {
      setConfirm(null);
      setNonce((n) => n + 1);
    }
  };

  const exportData = async () => {
    const res = await act(() => runtime.rpc("privacy.export"));
    if (!res) return;
    const blob = new Blob([JSON.stringify(res, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jarvis-dados-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const p = settings?.privacy;
  return (
    <div className="module">
      <section className="panel-section" aria-labelledby="pv-live">
        <h3 id="pv-live" className="t-label">Agora</h3>
        <ul className="pv-live">
          <li className={audio.ready && !audio.micMuted ? "is-on" : ""}><IconMic size={14} /> Microfone {audio.ready && !audio.micMuted ? (audio.capturing ? "capturando fala" : "ativo (aguardando “Jarvis”)") : "desligado"}</li>
          <li className={capturing ? "is-alert" : ""}><IconScreen size={14} /> Captura de tela {capturing ? "em andamento" : p?.screen_capture_enabled ? "só com sua autorização" : "desativada"}</li>
          <li className={externalAt && Date.now() - externalAt < 10000 ? "is-alert" : ""}><IconCloud size={14} /> Provedor de IA: {data?.provider.label ?? "…"} {data?.provider.external ? "(externo — dados saem do computador)" : "(local — nada sai do computador)"}</li>
          <li><IconShield size={14} /> {data?.telemetry ?? "O Jarvis não envia telemetria."}</li>
        </ul>
        <p className="t-xs t-muted">Fala sem a palavra de ativação é descartada: não é exibida nem salva.</p>
      </section>

      {p && (
        <section className="panel-section" aria-labelledby="pv-controls">
          <h3 id="pv-controls" className="t-label">Controles</h3>
          {[
            ["screen_capture_enabled", "Permitir captura de tela (sempre pede confirmação)"],
            ["memory_enabled", "Memória de longo prazo"],
            ["history_enabled", "Guardar histórico de conversas"],
          ].map(([key, label]) => (
            <Toggle key={key} checked={Boolean(p[key as keyof typeof p])} label={label} onChange={(v) => act(() => runtime.updateSettings({ privacy: { [key]: v } }))} />
          ))}
          <label className="field">
            <span className="t-sm">Reter histórico por (dias)</span>
            <input className="input input--num" type="number" min={1} max={3650} value={p.history_retention_days}
              onChange={(e) => { const v = Number(e.target.value); if (v >= 1 && v <= 3650) void runtime.updateSettings({ privacy: { history_retention_days: v } }); }} />
          </label>
        </section>
      )}

      <section className="panel-section" aria-labelledby="pv-data">
        <h3 id="pv-data" className="t-label">Dados salvos neste computador</h3>
        <ul className="data-list">
          {SCOPES.map((s) => (
            <li key={s.scope} className="data-list__row">
              <span>{s.label}</span>
              <span className="t-num t-muted">{data ? data.counts[s.count] ?? 0 : "…"}</span>
              {confirm === s.scope ? (
                <span className="row">
                  <button type="button" className="btn btn--danger btn--sm" onClick={() => void clear(s.scope)}>Apagar</button>
                  <button type="button" className="btn btn--sm" onClick={() => setConfirm(null)}>Cancelar</button>
                </span>
              ) : (
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirm(s.scope)} disabled={!data || !(data.counts[s.count] > 0)}>Apagar</button>
              )}
            </li>
          ))}
        </ul>
        <div className="row">
          <button type="button" className="btn btn--sm" onClick={() => void exportData()}><IconDownload size={14} /> Exportar memórias, notas e lembretes</button>
          <span className="grow" />
          {confirm === "all" ? (
            <>
              <button type="button" className="btn btn--danger btn--sm" onClick={() => void clear("all")}>Apagar tudo</button>
              <button type="button" className="btn btn--sm" onClick={() => setConfirm(null)}>Cancelar</button>
            </>
          ) : (
            <button type="button" className="btn btn--danger btn--sm" onClick={() => setConfirm("all")}>Apagar todos os dados</button>
          )}
        </div>
        {data && <p className="t-xs t-muted selectable">Pasta de dados: {data.dataDir}</p>}
      </section>

      {data && (
        <section className="panel-section" aria-labelledby="pv-prov">
          <h3 id="pv-prov" className="t-label">Provedores e chaves</h3>
          <ul className="data-list">
            {Object.entries(data.secrets).map(([k, v]) => (
              <li key={k} className="data-list__row">
                <span className="t-num">{k}</span>
                <span className={v ? "t-sm" : "t-sm t-muted"}>{v ? "configurada (.env.local)" : "ausente"}</span>
              </li>
            ))}
          </ul>
          <p className="t-xs t-muted">As chaves ficam só no arquivo .env.local e nunca são exibidas, registradas ou enviadas à interface.</p>
          <p className="t-sm">Permissões personalizadas: {Object.keys(data.permissions).length || "nenhuma (padrões por nível)"}</p>
        </section>
      )}
    </div>
  );
}
