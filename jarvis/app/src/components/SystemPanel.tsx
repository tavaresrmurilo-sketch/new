import { bytes, duration, gb, mb, rate } from "../lib/format";
import { useStore } from "../state/store";
import { Gauge, Sparkline } from "./primitives";

/** Left instrument rail: real metrics only; anything unavailable reads N/A. */
/** Peak of the recent history, so a flat line near zero still reads as a value. */
function Peak({ data }: { data: number[] }) {
  if (!data.length) return null;
  return <span className="t-xs t-muted t-num">pico {Math.round(Math.max(...data))}%</span>;
}

export function SystemPanel() {
  const m = useStore((s) => s.metrics);
  const history = useStore((s) => s.history);
  const processes = useStore((s) => s.processes);
  const conn = useStore((s) => s.conn);

  if (!m) {
    return (
      <section className="rail rail--left" aria-labelledby="sys-title">
        <h2 id="sys-title" className="rail__title t-label">System</h2>
        <p className="t-sm t-muted rail__waiting">{conn === "online" ? "Coletando métricas…" : "Aguardando o engine…"}</p>
      </section>
    );
  }
  const temp = m.temperatures.cpuC;
  const gpuTemp = m.temperatures.gpuC;
  return (
    <section className="rail rail--left" aria-labelledby="sys-title">
      <h2 id="sys-title" className="rail__title t-label">System</h2>
      <div className="gauges">
        <Gauge value={m.cpu.percent} label="CPU" sub={m.cpu.freqMhz ? `${(m.cpu.freqMhz / 1000).toFixed(1).replace(".", ",")} GHz` : `${m.cpu.count} threads`} />
        <Gauge value={m.memory.percent} label="RAM" sub={`${gb(m.memory.usedGb)} / ${gb(m.memory.totalGb)}`} warn={90} />
        <Gauge value={m.gpu?.percent ?? null} label="GPU" sub={m.gpu ? m.gpu.name.slice(0, 18) : "indisponível"} />
      </div>
      <div className="rail__rows">
        <div className="metric-row">
          <span className="metric-row__label">CPU <Peak data={history.cpu} /></span>
          <Sparkline data={history.cpu} max={100} label="Histórico de CPU" />
        </div>
        <div className="metric-row">
          <span className="metric-row__label">RAM <Peak data={history.ram} /></span>
          <Sparkline data={history.ram} max={100} label="Histórico de memória" />
        </div>
        <div className="metric-row">
          <span className="metric-row__label">Disco {m.disk.mount}</span>
          <span className="t-num metric-row__value">{m.disk.freeGb === null ? "N/A" : `${gb(m.disk.freeGb)} livres`}</span>
        </div>
        <div className="metric-row metric-row--sub">
          <span className="t-xs t-muted">E/S</span>
          <span className="t-num t-xs t-muted">↓ {rate(m.disk.readBps)} ↑ {rate(m.disk.writeBps)}</span>
        </div>
        <div className="metric-row">
          <span className="metric-row__label">Rede</span>
          <span className="t-num metric-row__value">
            {m.network.connected === null ? "N/A" : m.network.connected ? "conectada" : "desconectada"}
          </span>
        </div>
        <div className="metric-row metric-row--sub">
          <Sparkline data={history.down} label="Download recente" width={96} height={20} />
          <span className="t-num t-xs t-muted">↓ {rate(m.network.downBps)} ↑ {rate(m.network.upBps)}</span>
        </div>
        <div className="metric-row">
          <span className="metric-row__label">Bateria</span>
          <span className="t-num metric-row__value">
            {m.battery ? `${Math.round(m.battery.percent)}%${m.battery.plugged ? " · carregando" : ""}` : "N/A"}
          </span>
        </div>
        <div className="metric-row">
          <span className="metric-row__label">Temperatura</span>
          <span className="t-num metric-row__value">
            CPU {temp === null ? "N/A" : `${Math.round(temp)}°C`} · GPU {gpuTemp === null ? "N/A" : `${Math.round(gpuTemp)}°C`}
          </span>
        </div>
        <div className="metric-row">
          <span className="metric-row__label">Ligado há</span>
          <span className="t-num metric-row__value">{duration(m.uptimeS)}</span>
        </div>
        <div className="metric-row">
          <span className="metric-row__label">Processos</span>
          <span className="t-num metric-row__value">{m.processCount}</span>
        </div>
      </div>
      <div className="rail__block">
        <h3 className="t-label rail__subtitle">Maior uso de memória</h3>
        {processes.length === 0 ? (
          <p className="t-xs t-muted">Coletando…</p>
        ) : (
          <ol className="proc-list">
            {processes.slice(0, 5).map((p) => (
              <li key={p.name} className="proc-list__item">
                <span className="proc-list__name" title={p.name}>{p.name.replace(/\.exe$/i, "")}{p.count > 1 ? ` ×${p.count}` : ""}</span>
                <span className="t-num t-xs">{mb(p.memoryMb)}</span>
                <span className="t-num t-xs t-muted">{p.cpu.toFixed(0)}%</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      {m.gpu?.memoryTotalMb ? (
        <p className="t-xs t-muted rail__foot">VRAM {bytes((m.gpu.memoryUsedMb ?? 0) * 1048576)} / {bytes(m.gpu.memoryTotalMb * 1048576)}</p>
      ) : null}
    </section>
  );
}
