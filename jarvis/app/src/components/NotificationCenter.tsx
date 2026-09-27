import { useEffect, useRef } from "react";
import { when } from "../lib/format";
import { runtime } from "../runtime";
import { useStore } from "../state/store";
import { act } from "../hooks";
import { Empty, Toggle } from "./primitives";

export function NotificationCenter({ onClose }: { onClose: () => void }) {
  const items = useStore((s) => s.notifications);
  const proactive = useStore((s) => s.settings?.system.proactive_enabled ?? true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
    void runtime.rpc("notifications.read").catch(() => undefined);
    useStore.setState((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) }));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest(".notif-btn")) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="popover notif-center" role="dialog" aria-label="Notificações" tabIndex={-1}>
      <div className="popover__head">
        <span className="t-label">Notificações</span>
        <Toggle className="t-xs" checked={proactive} label="Assistência proativa"
          onChange={(v) => act(() => runtime.updateSettings({ system: { proactive_enabled: v } }))} />
      </div>
      {items.length === 0 ? (
        <Empty title="Nenhuma notificação">Alertas de sistema, lembretes e tarefas concluídas aparecem aqui.</Empty>
      ) : (
        <ul className="notif-list scroll">
          {items.map((n) => (
            <li key={n.id} className={`notif notif--${n.kind}`}>
              <div className="notif__title">{n.title}</div>
              {n.body && <div className="t-sm notif__body">{n.body}</div>}
              <div className="t-xs t-muted">{when(n.ts)}</div>
            </li>
          ))}
        </ul>
      )}
      {items.length > 0 && (
        <div className="popover__foot">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => { void runtime.rpc("notifications.clear"); useStore.setState({ notifications: [] }); }}>
            Limpar tudo
          </button>
        </div>
      )}
    </div>
  );
}
