import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { act } from "../hooks";
import { bridge } from "../lib/bridge";
import type { ProviderStatus, Settings } from "../lib/types";
import { runtime } from "../runtime";
import { useStore } from "../state/store";
import { JarvisCore } from "./JarvisCore";
import { MicSetup, SpeakerSetup, VoiceModels } from "./modules/SettingsPanel";
import { Toggle } from "./primitives";

const STEPS = ["Idioma", "Microfone", "Alto-falante", "IA", "Palavra de ativação", "Permissões", "Memória", "Iniciar com o Windows"];

const update = (patch: Record<string, unknown>) => act(() => runtime.updateSettings(patch));

function AIStep({ s }: { s: Settings }) {
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  useEffect(() => {
    void runtime.rpc<ProviderStatus>("providers.status", { force: true }, 15000).then(setStatus).catch(() => setStatus(null));
  }, [s.ai.provider, s.ai.ollama_host]);
  return (
    <>
      <p className="t-sm">O Jarvis funciona sem nenhuma IA para comandos diretos (abrir apps, arquivos, sistema, notas, lembretes). Para conversa livre e pedidos complexos, use um modelo.</p>
      <label className="field setting-row">
        <span className="t-sm">Provedor</span>
        <select className="select" value={s.ai.provider} onChange={(e) => void update({ ai: { provider: e.target.value, model: "" } })}>
          <option value="ollama">Ollama — local e privado (recomendado)</option>
          <option value="openai">OpenAI (chave no .env.local)</option>
          <option value="anthropic">Anthropic (chave no .env.local)</option>
          <option value="gemini">Google Gemini (chave no .env.local)</option>
          <option value="none">Nenhum por enquanto</option>
        </select>
      </label>
      {status && (
        <div className={`notice ${status.ok ? "notice--ok" : "notice--warn"} setting-row`}>
          <p className="t-sm">{status.detail}</p>
          {status.ok && status.models.length > 0 && <p className="t-xs t-muted">Modelos: {status.models.slice(0, 6).map((m) => m.name).join(", ")}</p>}
          {!status.ok && s.ai.provider === "ollama" && <p className="t-xs">Instale em ollama.com e rode, por exemplo: <code>ollama pull qwen2.5:7b</code>. O Jarvis não baixa modelos automaticamente.</p>}
        </div>
      )}
      {s.ai.provider !== "ollama" && s.ai.provider !== "none" && (
        <Toggle checked={s.privacy.external_provider_consent} onChange={(v) => void update({ privacy: { external_provider_consent: v } })} label="Autorizo enviar comandos e contexto a este provedor externo" />
      )}
    </>
  );
}

function PermissionsStep() {
  const [strict, setStrict] = useState(true);
  const apply = async (v: boolean) => {
    setStrict(v);
    // Relaxed mode lets the most common "important" actions (close app, rename/move) run without asking.
    for (const id of ["close_application", "rename_path", "move_path", "run_command"]) {
      await runtime.rpc("permissions.set", { toolId: id, policy: v ? "default" : "auto" }).catch(() => undefined);
    }
  };
  return (
    <>
      <ul className="levels">
        <li><strong>Nível 0 — leitura</strong>: métricas, buscas, notas. Executa direto.</li>
        <li><strong>Nível 1 — reversível</strong>: abrir apps, sites, pastas, volume. Executa direto.</li>
        <li><strong>Nível 2 — importante</strong>: fechar apps, mover/renomear, rodar comandos, capturar tela. Pede confirmação.</li>
        <li><strong>Nível 3 — destrutivo/sensível</strong>: apagar arquivos, desligar o PC. Sempre pede confirmação.</li>
      </ul>
      <Toggle checked={strict} onChange={(v) => void apply(v)} label="Confirmar alterações importantes (nível 2)" hint="Recomendado. Captura de tela e ações de nível 3 pedem confirmação em qualquer caso." />
      <p className="t-xs t-muted">Ajuste ferramenta por ferramenta depois em Configurações › Permissões.</p>
    </>
  );
}

function StartupStep() {
  const b = bridge();
  const [on, setOn] = useState(false);
  useEffect(() => {
    void b.prefs.get().then((r) => setOn(r.prefs.startWithWindows));
  }, [b]);
  if (!b.isDesktop) return <p className="t-sm t-muted">Disponível no aplicativo desktop.</p>;
  return (
    <Toggle checked={on} onChange={(v) => { setOn(v); void b.prefs.set({ startWithWindows: v }); }} label="Iniciar o Jarvis com o Windows" hint="Inicia minimizado na bandeja. Você pode mudar isso a qualquer momento." />
  );
}

export function Onboarding({ onFinish }: { onFinish: () => void }) {
  const s = useStore((st) => st.settings);
  const [step, setStep] = useState(-1);
  if (!s) return null;
  const last = STEPS.length - 1;
  const next = () => (step < last ? setStep(step + 1) : void finish());
  const finish = async () => {
    await update({ general: { onboarding_complete: true } });
    onFinish();
  };

  return (
    <div className="onboarding" role="dialog" aria-modal="true" aria-labelledby="ob-title">
      <div className="onboarding__core" aria-hidden="true">
        <JarvisCore particles={420} interactive={false} />
      </div>
      <div className="onboarding__panel">
        <AnimatePresence mode="wait">
          {step === -1 ? (
            <motion.div key="welcome" className="onboarding__welcome" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
              <h1 id="ob-title" className="t-mark onboarding__mark">Welcome to Jarvis</h1>
              <p className="t-muted">Seu assistente operacional: ouve, entende, planeja, executa e verifica — com você no controle.</p>
              <label className="field">
                <span className="t-sm">Como devo chamar você?</span>
                <input className="input" defaultValue={s.general.user_name} onBlur={(e) => void update({ general: { user_name: e.target.value } })} maxLength={60} placeholder="Seu nome" autoFocus />
              </label>
              <button type="button" className="btn btn--primary" onClick={() => setStep(0)}>Começar configuração</button>
            </motion.div>
          ) : (
            <motion.div key={step} className="onboarding__step" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.22 }}>
              <ol className="onboarding__progress" aria-label="Etapas">
                {STEPS.map((label, i) => (
                  <li key={label} className={i === step ? "is-current" : i < step ? "is-done" : ""} aria-current={i === step ? "step" : undefined}>
                    <span className="sr-only">{label}</span>
                  </li>
                ))}
              </ol>
              <h2 id="ob-title" className="onboarding__title">
                <span className="t-num t-muted">{step + 1}/{STEPS.length}</span> {STEPS[step]}
              </h2>
              <div className="onboarding__body scroll">
                {step === 0 && (
                  <label className="field">
                    <span className="t-sm">Idioma do reconhecimento, da voz e das respostas</span>
                    <select className="select" value={s.general.language} onChange={(e) => void update({ general: { language: e.target.value } })}>
                      <option value="pt-BR">Português (Brasil)</option>
                      <option value="en-US">English (parcial: interface em português)</option>
                    </select>
                  </label>
                )}
                {step === 1 && (
                  <>
                    <Toggle checked={s.voice.enabled} onChange={(v) => void update({ voice: { enabled: v } })} label="Usar voz" />
                    {s.voice.enabled && <MicSetup s={s} />}
                    <p className="t-xs t-muted">Fale algo: a barra deve se mover. Depois calibre em silêncio.</p>
                  </>
                )}
                {step === 2 && <SpeakerSetup s={s} />}
                {step === 3 && <AIStep s={s} />}
                {step === 4 && (
                  <>
                    <Toggle checked={s.voice.wake_word_enabled} onChange={(v) => void update({ voice: { wake_word_enabled: v } })} label="Ativar com a palavra “Jarvis”" hint="Fala sem a palavra de ativação é descartada — não é exibida nem salva." />
                    <label className="field setting-row">
                      <span className="t-sm">Detector</span>
                      <select className="select" value={s.voice.wake_engine} onChange={(e) => void update({ voice: { wake_engine: e.target.value } })}>
                        <option value="whisper">“Jarvis” — reconhecimento local</option>
                        <option value="openwakeword">“Hey Jarvis” — openWakeWord (baixo consumo)</option>
                      </select>
                    </label>
                    <VoiceModels s={s} />
                  </>
                )}
                {step === 5 && <PermissionsStep />}
                {step === 6 && (
                  <>
                    <Toggle checked={s.privacy.memory_enabled} onChange={(v) => void update({ privacy: { memory_enabled: v } })} label="Memória de longo prazo" hint="Só guarda o que você pedir: “Jarvis, lembre que…”." />
                    <Toggle checked={s.privacy.history_enabled} onChange={(v) => void update({ privacy: { history_enabled: v } })} label="Guardar histórico de conversas" hint={`Mantido por ${s.privacy.history_retention_days} dias.`} />
                  </>
                )}
                {step === 7 && <StartupStep />}
              </div>
              <div className="onboarding__nav">
                <button type="button" className="btn btn--ghost" onClick={() => setStep(step - 1)}>Voltar</button>
                <span className="grow" />
                <button type="button" className="btn btn--ghost" onClick={() => void finish()}>Pular</button>
                <button type="button" className="btn btn--primary" onClick={next}>{step === last ? "Concluir" : "Próximo"}</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
