import { useEffect, useMemo, useState } from "react";
import { listDevices } from "../../audio/capture";
import { play } from "../../audio/sounds";
import { systemVoices } from "../../audio/player";
import { act, useRpc } from "../../hooks";
import { bridge, DesktopPrefs, PrefsPatch } from "../../lib/bridge";
import { LEVEL_LABEL } from "../../lib/format";
import type { ProviderStatus, Settings, ToolInfo } from "../../lib/types";
import { runtime } from "../../runtime";
import { useStore } from "../../state/store";
import { IconDownload, IconRefresh } from "../icons";
import { Toggle } from "../primitives";

type Tab = "general" | "voice" | "ai" | "privacy" | "system" | "permissions" | "appearance" | "desktop" | "about";
const TABS: [Tab, string][] = [
  ["general", "Geral"], ["voice", "Voz"], ["ai", "IA"], ["privacy", "Privacidade"], ["system", "Sistema"],
  ["permissions", "Permissões"], ["appearance", "Aparência"], ["desktop", "Atalhos e início"], ["about", "Sobre"],
];

const update = (patch: Record<string, unknown>) => act(() => runtime.updateSettings(patch));

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="field setting-row">
      <span className="t-sm">{label}</span>
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  );
}

function TextSetting({ value, onSave, ...rest }: { value: string; onSave: (v: string) => void } & React.InputHTMLAttributes<HTMLInputElement>) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return <input className="input" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} {...rest} />;
}

// ------------------------------------------------------------------ general
function General({ s }: { s: Settings }) {
  const requestInit = useStore((st) => st.requestInit);
  return (
    <>
      <Field label="Seu nome" hint="Usado em saudações.">
        <TextSetting value={s.general.user_name} onSave={(v) => void update({ general: { user_name: v } })} maxLength={60} placeholder="Como devo chamar você?" />
      </Field>
      <Field label="Nome do assistente">
        <TextSetting value={s.general.assistant_name} onSave={(v) => v.trim() && void update({ general: { assistant_name: v.trim() } })} maxLength={30} />
      </Field>
      <Field label="Idioma" hint="English: reconhecimento, voz e respostas da IA em inglês; a interface permanece em português nesta versão.">
        <select className="select" value={s.general.language} onChange={(e) => void update({ general: { language: e.target.value } })}>
          <option value="pt-BR">Português (Brasil)</option>
          <option value="en-US">English (parcial)</option>
        </select>
      </Field>
      <div className="row setting-row">
        <button type="button" className="btn btn--sm" onClick={() => requestInit(true)}>Executar diagnóstico de inicialização</button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => void update({ general: { onboarding_complete: false } })}>Refazer configuração inicial</button>
      </div>
    </>
  );
}

// -------------------------------------------------------------------- voice
function LevelMeter() {
  const [lvl, setLvl] = useState(0);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setLvl(runtime.mic?.level ?? 0);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const th = useStore((s) => s.settings?.voice.vad_threshold ?? 0.015);
  const pct = Math.min(100, lvl * 800);
  return (
    <div className="meter" role="meter" aria-label="Nível do microfone" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <span className="meter__fill" style={{ transform: `scaleX(${pct / 100})` }} />
      <span className="meter__th" style={{ left: `${Math.min(100, th * 800)}%` }} title="Limiar de detecção de fala" />
    </div>
  );
}

function useDevices() {
  const audio = useStore((st) => st.audio);
  const [devices, setDevices] = useState<{ inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[] }>({ inputs: [], outputs: [] });
  useEffect(() => {
    void listDevices().then(setDevices);
    const onChange = () => void listDevices().then(setDevices);
    navigator.mediaDevices?.addEventListener?.("devicechange", onChange);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", onChange);
  }, [audio.ready]);
  return devices;
}

export function MicSetup({ s }: { s: Settings }) {
  const devices = useDevices();
  const audio = useStore((st) => st.audio);
  const [calibrating, setCalibrating] = useState(false);
  const calibrate = async () => {
    setCalibrating(true);
    const floor = await runtime.calibrate();
    setCalibrating(false);
    useStore.getState().toast(floor === null ? { kind: "error", title: "Calibração", body: "Microfone indisponível." } : { kind: "success", title: "Calibração concluída", body: `Ruído ambiente: ${(floor * 100).toFixed(2)}%` });
  };
  return (
    <>
      <Field label="Microfone" hint={audio.micError || (audio.inputLabel ? `Em uso: ${audio.inputLabel}` : undefined)}>
        <select className="select" value={s.voice.input_device_id} onChange={(e) => void update({ voice: { input_device_id: e.target.value } })}>
          <option value="default">Padrão do sistema</option>
          {devices.inputs.filter((d) => d.deviceId && d.deviceId !== "default").map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>{d.label || `Microfone ${i + 1}`}</option>
          ))}
        </select>
      </Field>
      <div className="setting-row">
        <LevelMeter />
        <div className="row">
          <button type="button" className="btn btn--sm" onClick={() => void calibrate()} disabled={calibrating || !audio.ready}>
            {calibrating ? "Fique em silêncio… (3 s)" : "Calibrar ruído ambiente"}
          </button>
        </div>
      </div>
    </>
  );
}

export function SpeakerSetup({ s }: { s: Settings }) {
  const devices = useDevices();
  return (
    <>
      <Field label="Alto-falante (voz do Jarvis)" hint="A voz do sistema (Windows) usa sempre o dispositivo padrão.">
        <select className="select" value={s.voice.output_device_id} onChange={(e) => void update({ voice: { output_device_id: e.target.value } })}>
          <option value="default">Padrão do sistema</option>
          {devices.outputs.filter((d) => d.deviceId && d.deviceId !== "default").map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>{d.label || `Saída ${i + 1}`}</option>
          ))}
        </select>
      </Field>
      <div className="row setting-row">
        <button type="button" className="btn btn--sm" onClick={() => void act(() => runtime.rpc("voice.test", { text: "Sistemas de voz operacionais." }))}>Testar voz</button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => play("activate")}>Testar som de ativação</button>
      </div>
    </>
  );
}

export function VoiceModels({ s }: { s: Settings }) {
  const voice = useStore((st) => st.voice);
  const [busy, setBusy] = useState<string | null>(null);
  const download = async (kind: "stt" | "tts" | "wake", name?: string) => {
    setBusy(kind);
    const res = await act(() => runtime.rpc("voice.download", { kind, name }, 30 * 60 * 1000), "Download concluído");
    if (res) useStore.getState().setVoice(res);
    setBusy(null);
  };
  const sys = useMemo(() => systemVoices(), [voice]);
  return (
    <>
      <Field label="Reconhecimento de fala (STT)" hint={voice?.stt.detail}>
        <div className="row">
          <select className="select" value={s.voice.stt_engine} onChange={(e) => void update({ voice: { stt_engine: e.target.value } })}>
            <option value="faster-whisper">Local (faster-whisper) — privado</option>
            <option value="openai">OpenAI Whisper (nuvem)</option>
          </select>
          {s.voice.stt_engine === "faster-whisper" && (
            <select className="select" value={s.voice.stt_model} onChange={(e) => void update({ voice: { stt_model: e.target.value } })} aria-label="Modelo de reconhecimento">
              {Object.entries(voice?.sttModels ?? { tiny: 75, base: 145, small: 485 }).map(([k, mbs]) => (
                <option key={k} value={k}>{k} ({mbs} MB)</option>
              ))}
            </select>
          )}
        </div>
      </Field>
      {s.voice.stt_engine === "faster-whisper" && !voice?.stt.downloaded && (
        <button type="button" className="btn btn--primary btn--sm setting-row" disabled={busy === "stt" || voice?.stt.downloading} onClick={() => void download("stt", s.voice.stt_model)}>
          <IconDownload size={14} /> {busy === "stt" || voice?.stt.downloading ? "Baixando…" : `Baixar modelo ${s.voice.stt_model} (${voice?.sttModels?.[s.voice.stt_model] ?? "?"} MB)`}
        </button>
      )}
      <Field label="Voz do Jarvis (TTS)" hint={voice?.tts.detail}>
        <select className="select" value={s.voice.tts_engine} onChange={(e) => void update({ voice: { tts_engine: e.target.value } })}>
          <option value="system">Voz do sistema (Windows) — sem download</option>
          <option value="piper">Piper neural (local)</option>
          <option value="off">Desligada (somente texto)</option>
        </select>
      </Field>
      {s.voice.tts_engine === "piper" && (
        <div className="setting-row">
          <div className="row">
            <select className="select" value={s.voice.tts_voice} onChange={(e) => void update({ voice: { tts_voice: e.target.value } })} aria-label="Voz Piper">
              {(voice?.voices ?? []).map((v) => (
                <option key={v.id} value={v.id}>{v.label}{voice?.localVoices.includes(v.id) ? " ✓" : ` (${v.sizeMb} MB)`}</option>
              ))}
            </select>
            {!voice?.localVoices.includes(s.voice.tts_voice) && (
              <button type="button" className="btn btn--primary btn--sm" disabled={busy === "tts"} onClick={() => void download("tts", s.voice.tts_voice)}>
                <IconDownload size={14} /> {busy === "tts" ? "Baixando…" : "Baixar voz"}
              </button>
            )}
          </div>
        </div>
      )}
      {s.voice.tts_engine === "system" && (
        <Field label="Voz do sistema" hint={sys.length ? undefined : "Nenhuma voz do sistema foi listada."}>
          <select className="select" value={s.voice.system_voice_name} onChange={(e) => void update({ voice: { system_voice_name: e.target.value } })}>
            <option value="">Automática (idioma atual)</option>
            {sys.map((v) => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
          </select>
        </Field>
      )}
      <Field label={`Velocidade da fala: ${s.voice.tts_rate.toFixed(2)}×`}>
        <input type="range" min={0.5} max={2} step={0.05} value={s.voice.tts_rate} onChange={(e) => void update({ voice: { tts_rate: Number(e.target.value) } })} />
      </Field>
      {s.voice.wake_engine === "openwakeword" && !voice?.wake.available && (
        <button type="button" className="btn btn--primary btn--sm setting-row" disabled={busy === "wake"} onClick={() => void download("wake")}>
          <IconDownload size={14} /> {busy === "wake" ? "Baixando…" : "Baixar modelo “Hey Jarvis” (~5 MB)"}
        </button>
      )}
    </>
  );
}

function Voice({ s }: { s: Settings }) {
  const voice = useStore((st) => st.voice);
  return (
    <>
      <Toggle checked={s.voice.enabled} onChange={(v) => update({ voice: { enabled: v } })} label="Voz ativada" hint="Desligado: o microfone não é aberto e o Jarvis responde só por texto." />
      <MicSetup s={s} />
      <SpeakerSetup s={s} />
      <Toggle checked={s.voice.wake_word_enabled} onChange={(v) => update({ voice: { wake_word_enabled: v } })} label="Palavra de ativação" hint="Desligado: fale apenas após clicar no núcleo, no microfone ou no atalho." />
      <Field label="Detector" hint={voice?.wake.detail}>
        <select className="select" value={s.voice.wake_engine} onChange={(e) => void update({ voice: { wake_engine: e.target.value } })} disabled={!s.voice.wake_word_enabled}>
          <option value="whisper">“Jarvis” — reconhecimento local (exato)</option>
          <option value="openwakeword">“Hey Jarvis” — openWakeWord (menor consumo)</option>
        </select>
      </Field>
      <VoiceModels s={s} />
      <Field label={`Janela de continuação: ${s.voice.follow_up_seconds} s`} hint="Depois de uma resposta, fale sem repetir “Jarvis” durante esse tempo.">
        <input type="range" min={0} max={30} step={1} value={s.voice.follow_up_seconds} onChange={(e) => void update({ voice: { follow_up_seconds: Number(e.target.value) } })} />
      </Field>
      <Toggle checked={s.voice.barge_in} onChange={(v) => update({ voice: { barge_in: v } })} label="Permitir interromper a fala" hint="Falando alto enquanto o Jarvis fala, ele para e escuta." />
      <Toggle checked={s.voice.speak_responses} onChange={(v) => update({ voice: { speak_responses: v } })} label="Falar respostas de comandos digitados" />
      {voice?.latency && Object.keys(voice.latency).length > 0 && (
        <p className="t-xs t-muted">Latência medida: {Object.entries(voice.latency).map(([k, v]) => `${k} ${v} ms`).join(" · ")}</p>
      )}
    </>
  );
}

// ----------------------------------------------------------------------- ai
function AI({ s }: { s: Settings }) {
  const provider = useStore((st) => st.provider);
  const secrets = useStore((st) => st.secrets);
  const [models, setModels] = useState<ProviderStatus["models"]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmConsent, setConfirmConsent] = useState(false);
  const external = s.ai.provider !== "ollama" && s.ai.provider !== "none";
  const keyName = { openai: "OPENAI_API_KEY", anthropic: "ANTHROPIC_API_KEY", gemini: "GEMINI_API_KEY" }[s.ai.provider as "openai"];
  const loadModels = async () => {
    setLoading(true);
    const res = await act(() => runtime.rpc<{ ok: boolean; models: ProviderStatus["models"]; detail: string }>("providers.models", { provider: s.ai.provider }, 15000));
    setLoading(false);
    setModels(res?.models ?? []);
    await runtime.refreshProvider(true);
  };
  useEffect(() => {
    void loadModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.ai.provider, s.ai.ollama_host]);
  return (
    <>
      <Field label="Provedor de IA" hint={provider?.detail}>
        <select className="select" value={s.ai.provider} onChange={(e) => void update({ ai: { provider: e.target.value, model: "" } })}>
          <option value="ollama">Ollama (local, privado)</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="gemini">Google Gemini</option>
          <option value="none">Nenhum (somente comandos locais)</option>
        </select>
      </Field>
      {s.ai.provider === "ollama" && (
        <Field label="Endereço do Ollama" hint="O Jarvis nunca baixa modelos sozinho. Instale com: ollama pull qwen2.5:7b">
          <TextSetting value={s.ai.ollama_host} onSave={(v) => void update({ ai: { ollama_host: v } })} spellCheck={false} />
        </Field>
      )}
      {external && (
        <div className="setting-row">
          <p className={`t-sm ${secrets[keyName] ? "" : "notice notice--warn"}`}>
            {keyName}: {secrets[keyName] ? "configurada" : "ausente — adicione ao arquivo .env.local"}
          </p>
          <div className="row">
            <button type="button" className="btn btn--sm" onClick={() => void act(() => runtime.rpc("env.open"))}>Abrir .env.local</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => void act(async () => { const sec = await runtime.rpc("env.reload"); useStore.setState({ secrets: sec }); await loadModels(); }, "Chaves recarregadas")}>Recarregar chaves</button>
          </div>
          {!s.privacy.external_provider_consent && (
            confirmConsent ? (
              <div className="notice notice--warn">
                <p className="t-sm">Seus comandos, contexto e resultados de ferramentas serão enviados a {s.ai.provider}. Autorizar?</p>
                <div className="row">
                  <button type="button" className="btn btn--primary btn--sm" onClick={() => { setConfirmConsent(false); void update({ privacy: { external_provider_consent: true } }); }}>Autorizar envio</button>
                  <button type="button" className="btn btn--sm" onClick={() => setConfirmConsent(false)}>Cancelar</button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn btn--sm" onClick={() => setConfirmConsent(true)}>Autorizar envio de dados a provedores externos</button>
            )
          )}
        </div>
      )}
      {s.ai.provider !== "none" && (
        <Field label="Modelo" hint={models.length ? `${models.length} disponíveis` : "Nenhum modelo listado."}>
          <div className="row">
            <select className="select" value={s.ai.model} onChange={(e) => void update({ ai: { model: e.target.value } })}>
              <option value="">Automático{provider?.model && !s.ai.model ? ` (${provider.model})` : ""}</option>
              {models.map((m) => <option key={m.name} value={m.name}>{m.name}{m.parameters ? ` · ${m.parameters}` : ""}</option>)}
            </select>
            <button type="button" className="btn btn--icon btn--sm" onClick={() => void loadModels()} aria-label="Atualizar lista de modelos" disabled={loading}><IconRefresh size={14} /></button>
          </div>
        </Field>
      )}
      {s.ai.provider !== "none" && (
        <Field label="Modelo de visão (análise de tela)" hint="Vazio: detectado automaticamente (ex.: llama3.2-vision, qwen2.5vl).">
          <select className="select" value={s.ai.vision_model} onChange={(e) => void update({ ai: { vision_model: e.target.value } })}>
            <option value="">Automático</option>
            {models.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
          </select>
        </Field>
      )}
      <Field label={`Temperatura: ${s.ai.temperature.toFixed(2)}`}>
        <input type="range" min={0} max={1.5} step={0.05} value={s.ai.temperature} onChange={(e) => void update({ ai: { temperature: Number(e.target.value) } })} />
      </Field>
      <Field label="Janela de contexto (tokens)" hint="Ollama: num_ctx. Valores maiores usam mais memória.">
        <select className="select" value={s.ai.context_window} onChange={(e) => void update({ ai: { context_window: Number(e.target.value) } })}>
          {[2048, 4096, 8192, 16384, 32768, 65536, 131072].map((n) => <option key={n} value={n}>{n.toLocaleString("pt-BR")}</option>)}
        </select>
      </Field>
      <Field label={`Máximo de etapas por pedido: ${s.ai.max_agent_steps}`}>
        <input type="range" min={1} max={12} step={1} value={s.ai.max_agent_steps} onChange={(e) => void update({ ai: { max_agent_steps: Number(e.target.value) } })} />
      </Field>
    </>
  );
}

// ------------------------------------------------------------------ privacy
function Privacy({ s }: { s: Settings }) {
  const open = useStore((st) => st.openModule);
  return (
    <>
      <Toggle checked={s.privacy.screen_capture_enabled} onChange={(v) => update({ privacy: { screen_capture_enabled: v } })} label="Permitir captura de tela" hint="Cada captura pede confirmação e mostra um indicador vermelho." />
      <Toggle checked={s.privacy.memory_enabled} onChange={(v) => update({ privacy: { memory_enabled: v } })} label="Memória de longo prazo" />
      <Toggle checked={s.privacy.history_enabled} onChange={(v) => update({ privacy: { history_enabled: v } })} label="Histórico de conversas" />
      <Toggle checked={s.privacy.external_provider_consent} onChange={(v) => update({ privacy: { external_provider_consent: v } })} label="Autorizar provedores de IA externos" hint="Sem isso, OpenAI/Anthropic/Gemini nunca recebem dados." />
      <p className="t-sm setting-row">Telemetria: o Jarvis não envia telemetria nem estatísticas de uso para lugar nenhum.</p>
      <button type="button" className="btn btn--sm setting-row" onClick={() => open("privacy")}>Abrir Central de Privacidade</button>
    </>
  );
}

// ------------------------------------------------------------------- system
function System({ s }: { s: Settings }) {
  const index = useStore((st) => st.index);
  const [root, setRoot] = useState("");
  const [apps, setApps] = useState<number | null>(null);
  const roots = s.system.file_index_roots;
  return (
    <>
      <Toggle checked={s.system.file_index_enabled} onChange={(v) => update({ system: { file_index_enabled: v } })} label="Indexar arquivos" hint={index ? `${index.files.toLocaleString("pt-BR")} itens · ${index.projects} projetos · ${index.state === "indexing" ? "indexando…" : "atualizado"}` : undefined} />
      <Toggle checked={s.system.index_content} onChange={(v) => update({ system: { index_content: v } })} label="Indexar conteúdo de textos, PDFs e DOCX" />
      <div className="setting-row">
        <span className="t-sm">Pastas extras para indexar</span>
        <ul className="roots">
          {roots.map((r) => (
            <li key={r} className="row"><span className="t-sm selectable grow">{r}</span><button type="button" className="btn btn--ghost btn--sm" onClick={() => void update({ system: { file_index_roots: roots.filter((x) => x !== r) } })}>Remover</button></li>
          ))}
        </ul>
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (root.trim()) void update({ system: { file_index_roots: [...roots, root.trim()] } }).then(() => setRoot("")); }}>
          <input className="input" placeholder="C:\\Users\\voce\\Projetos" value={root} onChange={(e) => setRoot(e.target.value)} aria-label="Adicionar pasta ao índice" spellCheck={false} />
          <button type="submit" className="btn btn--sm" disabled={!root.trim()}>Adicionar</button>
        </form>
        <button type="button" className="btn btn--sm" onClick={() => void act(() => runtime.rpc("files.reindex"), "Reindexação iniciada")}>Reindexar agora</button>
      </div>
      <div className="setting-row row">
        <button type="button" className="btn btn--sm" onClick={() => void act(async () => setApps(await runtime.rpc<number>("apps.refresh", {}, 90000)), "Aplicativos atualizados")}>Atualizar lista de aplicativos</button>
        {apps !== null && <span className="t-sm t-muted">{apps} aplicativos</span>}
      </div>
      <Toggle checked={s.system.proactive_enabled} onChange={(v) => update({ system: { proactive_enabled: v } })} label="Assistência proativa" hint="Alertas discretos, com intervalo mínimo entre repetições." />
      <div className="grid-2 setting-row">
        {([
          ["ram_percent", "RAM acima de (%)", 50, 100],
          ["cpu_percent", "CPU acima de (%)", 50, 100],
          ["disk_free_gb", "Disco livre abaixo de (GB)", 1, 500],
          ["battery_percent", "Bateria abaixo de (%)", 5, 50],
        ] as const).map(([k, label, min, max]) => (
          <label key={k} className="field">
            <span className="t-xs">{label}</span>
            <input className="input input--num" type="number" min={min} max={max} value={s.system.alerts[k]} disabled={!s.system.proactive_enabled}
              onChange={(e) => { const v = Number(e.target.value); if (v >= min && v <= max) void update({ system: { alerts: { [k]: v } } }); }} />
          </label>
        ))}
      </div>
      <Field label="Apps fechados no modo foco" hint="Separados por vírgula (ex.: Discord, Steam). O Jarvis pede confirmação antes.">
        <TextSetting value={s.system.focus_close_apps.join(", ")} onSave={(v) => void update({ system: { focus_close_apps: v.split(",").map((x) => x.trim()).filter(Boolean) } })} />
      </Field>
      <Toggle checked={s.system.computer_control_enabled} onChange={(v) => update({ system: { computer_control_enabled: v } })} label="Controle de interface (experimental)" hint="Permite ao Jarvis acionar botões e campos via UI Automation do Windows, sempre com confirmação." />
    </>
  );
}

// -------------------------------------------------------------- permissions
function Permissions() {
  const { data, reload } = useRpc<ToolInfo[]>("tools.list", {}, []);
  const [filter, setFilter] = useState("");
  const groups = useMemo(() => {
    const out: Record<string, ToolInfo[]> = {};
    for (const t of data ?? []) {
      if (filter && !`${t.name} ${t.description}`.toLowerCase().includes(filter.toLowerCase())) continue;
      (out[t.category] ??= []).push(t);
    }
    return out;
  }, [data, filter]);
  const setPolicy = async (t: ToolInfo, policy: string) => {
    if (await act(() => runtime.rpc("permissions.set", { toolId: t.id, policy }))) reload();
  };
  return (
    <>
      <p className="t-sm t-muted">Padrão: leitura e ações reversíveis rodam direto; alterações importantes pedem confirmação; ações destrutivas sempre pedem confirmação.</p>
      <input className="input setting-row" placeholder="Filtrar ferramentas" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrar ferramentas" />
      {Object.entries(groups).map(([cat, tools]) => (
        <section key={cat} className="perm-group">
          <h4 className="t-label">{cat}</h4>
          <ul className="perm-list">
            {tools.map((t) => (
              <li key={t.id} className={`perm-list__row${t.available ? "" : " is-unavailable"}`}>
                <div className="perm-list__info">
                  <span className="t-sm">{t.name}</span>
                  <span className="t-xs t-muted">{t.description}</span>
                </div>
                <span className={`chip lvl lvl--${t.level}`} title={`Nível ${t.level}`}>{LEVEL_LABEL[t.level]}</span>
                <select className="select select--sm" value={t.override ?? "default"} onChange={(e) => void setPolicy(t, e.target.value)} aria-label={`Política para ${t.name}`} disabled={!t.available}>
                  <option value="default">Padrão ({t.level <= 1 ? "automático" : "perguntar"})</option>
                  {t.level < 3 && <option value="auto">Automático</option>}
                  <option value="ask">Perguntar</option>
                  <option value="deny">Bloquear</option>
                </select>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

// --------------------------------------------------------------- appearance
function Appearance({ s }: { s: Settings }) {
  return (
    <>
      <Field label="Movimento" hint="“Sistema” segue a preferência de movimento reduzido do Windows.">
        <select className="select" value={s.appearance.motion} onChange={(e) => void update({ appearance: { motion: e.target.value } })}>
          <option value="system">Sistema</option>
          <option value="full">Completo</option>
          <option value="reduced">Reduzido</option>
        </select>
      </Field>
      <Field label={`Intensidade do HUD: ${Math.round(s.appearance.hud_intensity * 100)}%`}>
        <input type="range" min={0.2} max={1} step={0.05} value={s.appearance.hud_intensity} onChange={(e) => void update({ appearance: { hud_intensity: Number(e.target.value) } })} />
      </Field>
      <Toggle checked={s.appearance.compact_mode} onChange={(v) => update({ appearance: { compact_mode: v } })} label="Modo compacto" hint="Painéis mais estreitos e núcleo menor para telas pequenas." />
      <Toggle checked={s.appearance.sounds_enabled} onChange={(v) => update({ appearance: { sounds_enabled: v } })} label="Sons de interface" hint="Ativação, confirmação, erro e conclusão." />
    </>
  );
}

// ------------------------------------------------------------------ desktop
function ShortcutInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [recording, setRecording] = useState(false);
  const onKey = (e: React.KeyboardEvent) => {
    if (!recording) return;
    e.preventDefault();
    if (e.key === "Escape") return setRecording(false);
    if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
    const parts = [e.ctrlKey && "CommandOrControl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Super"].filter(Boolean) as string[];
    const key = e.key === " " ? "Space" : e.key.length === 1 ? e.key.toUpperCase() : e.key;
    if (!parts.length) return;
    onChange([...parts, key].join("+"));
    setRecording(false);
  };
  return (
    <Field label={label}>
      <div className="row">
        <button type="button" className={`btn shortcut${recording ? " is-recording" : ""}`} onClick={() => setRecording(true)} onKeyDown={onKey} onBlur={() => setRecording(false)} aria-label={`${label}: ${value || "nenhum"}. Clique e pressione a nova combinação`}>
          {recording ? "Pressione a combinação…" : value.replace("CommandOrControl", "Ctrl") || "Nenhum"}
        </button>
        {value && <button type="button" className="btn btn--ghost btn--sm" onClick={() => onChange("")}>Remover</button>}
      </div>
    </Field>
  );
}

function Desktop() {
  const b = bridge();
  const [prefs, setPrefs] = useState<DesktopPrefs | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    void b.prefs.get().then((r) => { setPrefs(r.prefs); setErrors(r.shortcutErrors); });
  }, [b]);
  if (!b.isDesktop) return <p className="t-sm t-muted">Atalhos globais, bandeja e início com o Windows estão disponíveis no aplicativo desktop.</p>;
  if (!prefs) return <p className="t-sm t-muted">Carregando…</p>;
  const save = async (patch: PrefsPatch) => {
    const r = await b.prefs.set(patch);
    setPrefs(r.prefs);
    setErrors(r.shortcutErrors);
  };
  return (
    <>
      <ShortcutInput label="Paleta de comandos (global)" value={prefs.shortcuts.palette} onChange={(v) => save({ shortcuts: { palette: v } })} />
      <ShortcutInput label="Mostrar/ocultar o HUD (global)" value={prefs.shortcuts.toggle} onChange={(v) => save({ shortcuts: { toggle: v } })} />
      <ShortcutInput label="Ouvir agora, sem palavra de ativação (global)" value={prefs.shortcuts.listen} onChange={(v) => save({ shortcuts: { listen: v } })} />
      {Object.values(errors).map((e) => <p key={e} className="notice notice--warn t-sm">{e}</p>)}
      <Field label="Modo da janela">
        <select className="select" value={prefs.mode} onChange={(e) => void b.window.setMode(e.target.value as DesktopPrefs["mode"]).then(() => setPrefs({ ...prefs, mode: e.target.value as DesktopPrefs["mode"] }))}>
          <option value="full">HUD completo</option>
          <option value="mini">Mini widget flutuante</option>
          <option value="background">Segundo plano (bandeja)</option>
          <option value="voice">Somente voz (sem janela)</option>
        </select>
      </Field>
      <Toggle checked={prefs.startWithWindows} onChange={(v) => save({ startWithWindows: v })} label="Iniciar com o Windows" hint="Inicia minimizado na bandeja. Desligado por padrão." />
      <Toggle checked={prefs.closeToTray} onChange={(v) => save({ closeToTray: v })} label="Fechar para a bandeja" hint="O botão fechar mantém o Jarvis ativo em segundo plano." />
    </>
  );
}

// -------------------------------------------------------------------- about
function About() {
  const backend = useStore((st) => st.backend);
  const dataDir = useStore((st) => st.dataDir);
  const platform = useStore((st) => st.platform);
  const [info, setInfo] = useState<{ version: string; platform: string; packaged: boolean } | null>(null);
  const b = bridge();
  useEffect(() => {
    void b.app.info().then(setInfo);
  }, [b]);
  return (
    <>
      <dl className="about">
        <div><dt className="t-label">Versão</dt><dd>{info?.version ?? "…"}</dd></div>
        <div><dt className="t-label">Plataforma</dt><dd>{platform || info?.platform}</dd></div>
        <div><dt className="t-label">Engine</dt><dd>{backend?.status ?? "…"} {backend?.detail ? `— ${backend.detail}` : ""}</dd></div>
        <div><dt className="t-label">Dados</dt><dd className="selectable">{dataDir}</dd></div>
      </dl>
      <div className="row setting-row">
        {b.isDesktop && <button type="button" className="btn btn--sm" onClick={() => void act(() => b.backend.restart(), "Engine reiniciado")}>Reiniciar engine</button>}
        {b.isDesktop && <button type="button" className="btn btn--danger btn--sm" onClick={() => b.app.quit()}>Sair do Jarvis</button>}
      </div>
      <p className="t-xs t-muted">Voz, visuais e sons são originais; nenhum material dos filmes é utilizado.</p>
    </>
  );
}

export function SettingsPanel() {
  const settings = useStore((s) => s.settings);
  const [tab, setTab] = useState<Tab>("general");
  if (!settings) return <p className="t-sm t-muted">Aguardando o engine…</p>;
  return (
    <div className="module module--settings">
      <div className="tabs" role="tablist" aria-label="Seções de configuração">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`} className={`tabs__tab${tab === id ? " is-active" : ""}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="tabs__panel scroll" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "general" && <General s={settings} />}
        {tab === "voice" && <Voice s={settings} />}
        {tab === "ai" && <AI s={settings} />}
        {tab === "privacy" && <Privacy s={settings} />}
        {tab === "system" && <System s={settings} />}
        {tab === "permissions" && <Permissions />}
        {tab === "appearance" && <Appearance s={settings} />}
        {tab === "desktop" && <Desktop />}
        {tab === "about" && <About />}
      </div>
    </div>
  );
}
