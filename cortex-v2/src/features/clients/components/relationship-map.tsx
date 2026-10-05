import * as React from "react";
import { Mail, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/common/user-avatar";
import { DECISION_ROLE, labelOf } from "@/lib/labels";
import { cn } from "@/lib/utils";

interface Person {
  id: string;
  name: string;
  jobTitle: string | null;
  decisionRole: string;
  influence: number;
  reportsToId: string | null;
  email: string | null;
  phone: string | null;
}

function Influence({ value }: { value: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`Influência ${value} de 5`} title={`Influência ${value}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={cn("h-1.5 w-2.5 rounded-sm", i <= value ? "bg-primary" : "bg-muted")} />
      ))}
    </span>
  );
}

function Node({ person, childrenOf, depth }: { person: Person; childrenOf: Map<string | null, Person[]>; depth: number }) {
  const kids = childrenOf.get(person.id) ?? [];
  const role = labelOf(DECISION_ROLE, person.decisionRole);
  return (
    <li className="relative">
      <div className={cn("relative z-[1] inline-flex min-w-[220px] max-w-xs items-start gap-2.5 rounded-lg border bg-card p-2.5", person.decisionRole === "DECISION_MAKER" && "border-primary/40", person.decisionRole === "BLOCKER" && "border-destructive/40")}>
        <UserAvatar name={person.name} size="sm" />
        <div className="min-w-0 space-y-1">
          <p className="truncate text-[13px] font-medium leading-tight">{person.name}</p>
          <p className="truncate text-xs text-muted-foreground">{person.jobTitle ?? "Cargo não informado"}</p>
          <div className="flex items-center gap-2">
            <Badge tone={role.tone}>{role.label}</Badge>
            <Influence value={person.influence} />
          </div>
          <div className="flex gap-2 text-muted-foreground">
            {person.email ? (
              <a href={`mailto:${person.email}`} aria-label={`E-mail para ${person.name}`} className="hover:text-foreground">
                <Mail className="size-3.5" />
              </a>
            ) : null}
            {person.phone ? (
              <a href={`tel:${person.phone}`} aria-label={`Ligar para ${person.name}`} className="hover:text-foreground">
                <Phone className="size-3.5" />
              </a>
            ) : null}
          </div>
        </div>
      </div>
      {kids.length ? (
        <ul className="ml-6 mt-2 space-y-2 border-l border-dashed pl-5">
          {kids.map((k) => (
            <Node key={k.id} person={k} childrenOf={childrenOf} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** Relationship Map: hierarquia de contatos do cliente B2B com papel na decisão e influência. */
export function RelationshipMap({ contacts }: { contacts: Person[] }) {
  const ids = new Set(contacts.map((c) => c.id));
  const childrenOf = new Map<string | null, Person[]>();
  for (const c of contacts) {
    const parent = c.reportsToId && ids.has(c.reportsToId) ? c.reportsToId : null;
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), c]);
  }
  for (const list of childrenOf.values()) list.sort((a, b) => b.influence - a.influence);
  const roots = childrenOf.get(null) ?? [];
  const decision = contacts.filter((c) => c.decisionRole === "DECISION_MAKER").length;
  const champions = contacts.filter((c) => c.decisionRole === "CHAMPION").length;
  const blockers = contacts.filter((c) => c.decisionRole === "BLOCKER").length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge tone={decision ? "primary" : "warning"}>{decision ? `${decision} decisor(es)` : "Nenhum decisor mapeado"}</Badge>
        <Badge tone={champions ? "success" : "neutral"}>{champions} champion(s)</Badge>
        {blockers ? <Badge tone="danger">{blockers} bloqueador(es)</Badge> : null}
      </div>
      <ul className="space-y-3 overflow-x-auto pb-2">
        {roots.map((r) => (
          <Node key={r.id} person={r} childrenOf={childrenOf} depth={0} />
        ))}
      </ul>
    </div>
  );
}
