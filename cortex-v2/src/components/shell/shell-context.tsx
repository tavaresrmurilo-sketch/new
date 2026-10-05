"use client";

import * as React from "react";

export type CreateKind = "client" | "lead" | "opportunity" | "project" | "task" | "meeting" | "proposal" | "contract";

export interface ShellData {
  user: { id: string; name: string; email: string; avatarUrl: string | null; isSuperAdmin: boolean };
  org: { id: string; name: string; isDemo: boolean; logoUrl: string | null; timezone: string; currency: string };
  workspaces: { id: string; name: string; isDemo: boolean }[];
  permissions: string[];
  counts: { inbox: number; decisions: number; unread: number };
  plan: { name: string; status: string; trialDaysLeft: number | null } | null;
  readOnly: boolean;
  supportMode: boolean;
  demoModeAvailable: boolean;
}

interface ShellState {
  data: ShellData;
  can: (p: string) => boolean;
  commandOpen: boolean;
  setCommandOpen: (v: boolean) => void;
  createKind: CreateKind | null;
  openCreate: (kind: CreateKind, defaults?: Record<string, unknown>) => void;
  createDefaults: Record<string, unknown>;
  closeCreate: () => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (v: boolean) => void;
  collapsed: boolean;
  toggleCollapsed: () => void;
  crumbLabels: Record<string, string>;
  setCrumbLabel: (segment: string, label: string) => void;
}

const Ctx = React.createContext<ShellState | null>(null);

export function ShellProvider({ data, children }: { data: ShellData; children: React.ReactNode }) {
  const [commandOpen, setCommandOpen] = React.useState(false);
  const [createKind, setCreateKind] = React.useState<CreateKind | null>(null);
  const [createDefaults, setCreateDefaults] = React.useState<Record<string, unknown>>({});
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);
  const [crumbLabels, setCrumbLabels] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("cortex.sidebar") === "collapsed");
    } catch {
      /* storage indisponível */
    }
  }, []);

  const perms = React.useMemo(() => new Set(data.permissions), [data.permissions]);
  const value = React.useMemo<ShellState>(
    () => ({
      data,
      can: (p) => perms.has(p),
      commandOpen,
      setCommandOpen,
      createKind,
      createDefaults,
      openCreate: (kind, defaults) => {
        setCreateDefaults(defaults ?? {});
        setCreateKind(kind);
      },
      closeCreate: () => setCreateKind(null),
      mobileNavOpen,
      setMobileNavOpen,
      collapsed,
      toggleCollapsed: () =>
        setCollapsed((c) => {
          try {
            localStorage.setItem("cortex.sidebar", c ? "expanded" : "collapsed");
          } catch {
            /* ignore */
          }
          return !c;
        }),
      crumbLabels,
      setCrumbLabel: (segment, label) => setCrumbLabels((prev) => (prev[segment] === label ? prev : { ...prev, [segment]: label })),
    }),
    [data, perms, commandOpen, createKind, createDefaults, mobileNavOpen, collapsed, crumbLabels],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useShell() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useShell fora do ShellProvider");
  return ctx;
}

/** Define o rótulo do breadcrumb para um segmento dinâmico (ex.: id do cliente → nome). */
export function BreadcrumbLabel({ segment, label }: { segment: string; label: string }) {
  const { setCrumbLabel } = useShell();
  React.useEffect(() => setCrumbLabel(segment, label), [segment, label, setCrumbLabel]);
  return null;
}

/** Botão que abre o Quick Create de um tipo, com valores iniciais (ex.: cliente pré-selecionado). */
export function CreateButton({ kind, defaults, children, ...props }: { kind: CreateKind; defaults?: Record<string, unknown> } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { openCreate } = useShell();
  return (
    <button type="button" {...props} onClick={() => openCreate(kind, defaults)}>
      {children}
    </button>
  );
}
