"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Segmented } from "@/components/ui/chip";
import { useIsClient } from "@/lib/hooks/use-is-client";

export function ThemeSegmented() {
  const { theme, setTheme } = useTheme();
  const mounted = useIsClient();
  return (
    <Segmented
      label="Tema"
      value={(mounted ? theme : "dark") as "light" | "dark" | "system"}
      onChange={setTheme}
      options={[
        { value: "dark", label: "Escuro", icon: <Moon /> },
        { value: "light", label: "Claro", icon: <Sun /> },
        { value: "system", label: "Sistema", icon: <Monitor /> },
      ]}
    />
  );
}

export function ThemeIconButton({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useIsClient();
  const dark = !mounted || resolvedTheme === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      className={className ?? "grid size-10 place-items-center rounded-full text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"}
      aria-label={dark ? "Usar tema claro" : "Usar tema escuro"}
    >
      {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </button>
  );
}
