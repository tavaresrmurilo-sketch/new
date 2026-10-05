"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Dialog as D } from "radix-ui";
import {
  Briefcase, CheckSquare, CornerDownLeft, FileSignature, FileText, FolderKanban, FolderOpen, Sparkles, Target, TerminalSquare,
  UserPlus, Users, Video, Contact as ContactIcon,
} from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Kbd } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import { useDebounce } from "@/hooks/use-debounce";
import { ALL_NAV_ITEMS, CREATE_ICON } from "./nav";
import { useShell, type CreateKind } from "./shell-context";

type Result = { type: string; id: string; title: string; subtitle?: string | null; href: string };

const TYPE_META: Record<string, { label: string; icon: typeof Users }> = {
  client: { label: "Clientes", icon: Users },
  contact: { label: "Pessoas", icon: ContactIcon },
  lead: { label: "Leads", icon: UserPlus },
  opportunity: { label: "Oportunidades", icon: Target },
  project: { label: "Projetos", icon: FolderKanban },
  task: { label: "Tarefas", icon: CheckSquare },
  proposal: { label: "Propostas", icon: FileText },
  contract: { label: "Contratos", icon: FileSignature },
  document: { label: "Documentos", icon: FolderOpen },
  meeting: { label: "Reuniões", icon: Video },
};

const CREATE_ITEMS: { kind: CreateKind; label: string; permission: string }[] = [
  { kind: "client", label: "Criar cliente", permission: "clients.write" },
  { kind: "lead", label: "Criar lead", permission: "leads.write" },
  { kind: "opportunity", label: "Criar oportunidade", permission: "opportunities.write" },
  { kind: "task", label: "Criar tarefa", permission: "tasks.write" },
  { kind: "project", label: "Criar projeto", permission: "projects.write" },
  { kind: "proposal", label: "Criar proposta", permission: "proposals.write" },
  { kind: "meeting", label: "Agendar reunião", permission: "meetings.write" },
  { kind: "contract", label: "Registrar contrato", permission: "contracts.write" },
];

export function CommandMenu() {
  const router = useRouter();
  const { commandOpen, setCommandOpen, can, openCreate, data } = useShell();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<Result[]>([]);
  const [loading, setLoading] = React.useState(false);
  const debounced = useDebounce(query, 180);

  React.useEffect(() => {
    if (!commandOpen) setQuery("");
  }, [commandOpen]);

  React.useEffect(() => {
    const q = debounced.trim();
    if (q.length < 2 || q.startsWith(">")) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : { results: [] }))
      .then((d: { results: Result[] }) => setResults(d.results))
      .catch(() => undefined)
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [debounced]);

  const go = (href: string) => {
    setCommandOpen(false);
    router.push(href);
  };

  const grouped = results.reduce<Record<string, Result[]>>((acc, r) => {
    (acc[r.type] ??= []).push(r);
    return acc;
  }, {});
  const q = query.trim();
  const commandText = q.startsWith(">") ? q.slice(1).trim() : q;
  const aiAllowed = can("ai.use");

  return (
    <D.Root open={commandOpen} onOpenChange={setCommandOpen}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <D.Content className="fixed left-1/2 top-[12vh] z-50 w-[calc(100%-1.5rem)] max-w-[620px] -translate-x-1/2 overflow-hidden rounded-xl border bg-popover shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
          <D.Title className="sr-only">Command palette</D.Title>
          <D.Description className="sr-only">Busque registros, navegue, crie itens ou envie comandos ao Córtex.</D.Description>
          <Command shouldFilter={!q || q.startsWith(">") ? true : false} loop>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Buscar clientes, projetos, propostas… ou digite > para um comando"
            />
            <CommandList>
              {loading ? (
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                  <Spinner className="size-3" /> Buscando…
                </div>
              ) : null}
              <CommandEmpty>Nenhum resultado para “{q}”.</CommandEmpty>

              {q && aiAllowed ? (
                <CommandGroup heading="Córtex">
                  {!q.startsWith(">") ? (
                    <CommandItem value={`ask ${q}`} onSelect={() => go(`/app/ai?q=${encodeURIComponent(q)}`)}>
                      <Sparkles /> Perguntar ao Córtex AI: <span className="truncate font-medium">“{q}”</span>
                    </CommandItem>
                  ) : null}
                  {commandText.length > 3 ? (
                    <CommandItem value={`cmd ${q}`} onSelect={() => go(`/app/ai?mode=command&q=${encodeURIComponent(commandText)}`)}>
                      <TerminalSquare /> Executar no Command Center: <span className="truncate font-medium">“{commandText}”</span>
                    </CommandItem>
                  ) : null}
                </CommandGroup>
              ) : null}

              {Object.entries(grouped).map(([type, items]) => {
                const meta = TYPE_META[type] ?? { label: type, icon: Briefcase };
                const Icon = meta.icon;
                return (
                  <CommandGroup key={type} heading={meta.label}>
                    {items.map((r) => (
                      <CommandItem key={`${type}-${r.id}`} value={`${type}-${r.id}-${r.title}`} onSelect={() => go(r.href)}>
                        <Icon />
                        <span className="truncate">{r.title}</span>
                        {r.subtitle ? <span className="ml-auto truncate text-xs text-muted-foreground">{r.subtitle}</span> : null}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              })}

              {!q || q.startsWith(">") ? (
                <>
                  <CommandGroup heading="Criar">
                    {CREATE_ITEMS.filter((c) => can(c.permission)).map((c) => {
                      const Icon = CREATE_ICON[c.kind]!;
                      return (
                        <CommandItem
                          key={c.kind}
                          value={c.label}
                          onSelect={() => {
                            setCommandOpen(false);
                            if (c.kind === "proposal") router.push("/app/proposals/new");
                            else openCreate(c.kind);
                          }}
                        >
                          <Icon /> {c.label}
                        </CommandItem>
                      );
                    })}
                    {aiAllowed ? (
                      <CommandItem value="Abrir Córtex AI" onSelect={() => go("/app/ai")}>
                        <Sparkles /> Abrir Córtex AI
                      </CommandItem>
                    ) : null}
                  </CommandGroup>
                  <CommandSeparator />
                  <CommandGroup heading="Ir para">
                    {ALL_NAV_ITEMS.filter((i) => !i.permission || can(i.permission)).map((item) => {
                      const Icon = item.icon;
                      return (
                        <CommandItem key={item.href} value={`${item.label} ${(item.keywords ?? []).join(" ")}`} onSelect={() => go(item.href)}>
                          <Icon /> {item.label}
                        </CommandItem>
                      );
                    })}
                    {data.user.isSuperAdmin ? (
                      <CommandItem value="Painel Super Admin" onSelect={() => go("/admin")}>
                        <Briefcase /> Painel Super Admin
                      </CommandItem>
                    ) : null}
                  </CommandGroup>
                </>
              ) : null}
            </CommandList>
            <div className="flex items-center justify-between border-t px-3 py-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> navegar <Kbd className="ml-2"><CornerDownLeft className="size-3" /></Kbd> abrir
              </span>
              <span>
                <Kbd>Esc</Kbd> fechar
              </span>
            </div>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
