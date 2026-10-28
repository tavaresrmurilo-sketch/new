import { AlarmClockIcon, BellRingIcon, CalendarClockIcon, CheckCheckIcon, LayoutDashboardIcon, UsersIcon } from "lucide-react";
import { LogoMark } from "@/components/app/logo";
import { WhatsAppIcon } from "@/components/returns/whatsapp-icon";

/**
 * Ilustração do produto para a landing page. Os dados são FICTÍCIOS e a
 * peça é rotulada como "Exemplo ilustrativo" — não representa resultados.
 */
const ROWS = [
  { name: "Mariana Costa", service: "Limpeza de ar-condicionado", when: "Hoje", tone: "bg-emerald-soft text-emerald-soft-foreground" },
  { name: "Roberto Lima", service: "Higienização completa", when: "há 3 dias", tone: "bg-warning-soft text-warning-soft-foreground" },
  { name: "Paula Mendes", service: "Manutenção preventiva", when: "em 2 dias", tone: "bg-info-soft text-info-soft-foreground" },
];

const BARS = [38, 52, 44, 61, 57, 72, 66, 84];

export function DashboardPreview() {
  return (
    <div className="relative" aria-label="Exemplo ilustrativo do painel do VoltaCliente" role="img">
      <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-tr from-primary/25 via-emerald/15 to-transparent blur-2xl" />
      <div className="overflow-hidden rounded-2xl border bg-card shadow-2xl shadow-primary/10" aria-hidden>
        <div className="flex items-center gap-1.5 border-b bg-muted/60 px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-3 rounded-md bg-background px-3 py-0.5 text-[10px] text-muted-foreground">
            app.voltacliente.com.br/painel
          </span>
        </div>
        <div className="grid grid-cols-[3.25rem_1fr] sm:grid-cols-[9.5rem_1fr]">
          <div className="space-y-1 bg-sidebar p-2 sm:p-3">
            <div className="mb-3 flex items-center gap-2 px-1">
              <LogoMark className="size-6" />
              <span className="hidden text-xs font-bold text-white sm:block">VoltaCliente</span>
            </div>
            {[
              { icon: LayoutDashboardIcon, label: "Painel", active: true },
              { icon: BellRingIcon, label: "Retornos" },
              { icon: UsersIcon, label: "Clientes" },
            ].map((item) => (
              <div
                key={item.label}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] ${item.active ? "bg-sidebar-accent text-white" : "text-sidebar-muted"}`}
              >
                <item.icon className={`size-3.5 ${item.active ? "text-emerald" : ""}`} />
                <span className="hidden sm:block">{item.label}</span>
              </div>
            ))}
          </div>
          <div className="space-y-3 bg-background p-3 sm:p-4">
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: CalendarClockIcon, label: "Para hoje", value: "12", tone: "text-emerald" },
                { icon: AlarmClockIcon, label: "Atrasados", value: "5", tone: "text-warning" },
                { icon: CheckCheckIcon, label: "Retornaram", value: "34", tone: "text-primary" },
              ].map((kpi) => (
                <div key={kpi.label} className="rounded-lg border bg-card p-2 sm:p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-muted-foreground sm:text-[10px]">{kpi.label}</span>
                    <kpi.icon className={`size-3 ${kpi.tone}`} />
                  </div>
                  <p className="mt-1 text-base font-semibold sm:text-xl">{kpi.value}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-[1.2fr_1fr]">
              <div className="rounded-lg border bg-card p-3">
                <p className="text-[10px] font-medium text-muted-foreground">Retornos por mês</p>
                <div className="mt-2 flex h-20 items-end gap-1.5">
                  {BARS.map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t-[3px] bg-chart-2"
                      style={{ height: `${h}%`, opacity: i === BARS.length - 1 ? 1 : 0.55 }}
                    />
                  ))}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="mb-2 text-[10px] font-medium text-muted-foreground">Próximos contatos</p>
                <ul className="space-y-2">
                  {ROWS.map((row) => (
                    <li key={row.name} className="flex items-center gap-2">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-[8px] font-semibold text-primary">
                        {row.name
                          .split(" ")
                          .map((p) => p[0])
                          .join("")}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[10px] font-medium">{row.name}</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-medium ${row.tone}`}>{row.when}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className="absolute -bottom-10 -left-2 hidden w-64 animate-float rounded-2xl border bg-card p-3 shadow-xl sm:block md:-left-8"
        aria-hidden
      >
        <div className="mb-2 flex items-center gap-2 text-xs font-medium">
          <span className="flex size-6 items-center justify-center rounded-full bg-emerald text-white">
            <WhatsAppIcon className="size-3.5" />
          </span>
          Mensagem pronta
        </div>
        <p className="rounded-xl rounded-tl-sm bg-[#e7f6ee] px-3 py-2 text-[11px] leading-relaxed text-slate-800 dark:bg-emerald-soft dark:text-emerald-soft-foreground">
          Olá, Mariana! Aqui é da ClimaTech. Faz um tempo desde a última limpeza do seu ar-condicionado. Vamos agendar?
        </p>
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground sm:text-right">Exemplo ilustrativo com dados fictícios.</p>
    </div>
  );
}
