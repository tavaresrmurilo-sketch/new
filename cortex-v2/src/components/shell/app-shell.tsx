"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { CommandMenu } from "./command-menu";
import { QuickCreateHost } from "./quick-create";
import { ShellProvider, useShell, type ShellData } from "./shell-context";
import { Sidebar } from "./sidebar";
import { ShortcutsDialog, Topbar } from "./topbar";

function ShellHotkeys({ onShortcuts }: { onShortcuts: () => void }) {
  const router = useRouter();
  const { setCommandOpen, openCreate, toggleCollapsed, can, data } = useShell();
  useHotkeys({
    "mod+k": () => setCommandOpen(true),
    c: () => !data.readOnly && can("tasks.write") && openCreate("task"),
    "g d": () => router.push("/app/dashboard"),
    "g i": () => router.push("/app/inbox"),
    "g p": () => router.push("/app/pipeline"),
    "g t": () => router.push("/app/tasks"),
    "g c": () => router.push("/app/clients"),
    "g a": () => router.push("/app/ai"),
    "[": () => toggleCollapsed(),
    "?": () => onShortcuts(),
  });
  return null;
}

export function AppShell({ data, banners, children }: { data: ShellData; banners?: React.ReactNode; children: React.ReactNode }) {
  const [shortcuts, setShortcuts] = React.useState(false);
  return (
    <ShellProvider data={data}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:shadow">
        Pular para o conteúdo
      </a>
      <div className="flex min-h-dvh bg-background">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          {banners}
          <Topbar onShortcuts={() => setShortcuts(true)} />
          <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>
      <CommandMenu />
      <QuickCreateHost />
      <ShortcutsDialog open={shortcuts} onOpenChange={setShortcuts} />
      <ShellHotkeys onShortcuts={() => setShortcuts(true)} />
    </ShellProvider>
  );
}
