"use client";

import { getCurrentPosition } from "@/lib/native";
import { LocateFixed, MapPin, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { fieldBase } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

interface GeoResult {
  label: string;
  name: string | null;
  city: string | null;
  state: string | null;
  lat: number;
  lng: number;
  kind: "place" | "address" | "city" | "region";
}

export interface CityValue {
  city: string;
  lat: number;
  lng: number;
}

function cityLabel(r: GeoResult): string {
  if (r.city) return `${r.city}${r.state ? ` – ${r.state}` : ""}`;
  return (r.name ?? r.label).slice(0, 120);
}

/**
 * Cidade de referência: busca no geocodificador (/api/geocode, pode estar
 * indisponível → 503) ou pela localização do aparelho. Envia homeCity/homeLat/homeLng.
 */
export function CitySearch({ initial, inputId }: { initial: CityValue | null; inputId: string }) {
  const [value, setValue] = useState<CityValue | null>(initial);
  const [editing, setEditing] = useState(!initial);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) {
      abortRef.current?.abort();
      return;
    }
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        const data = (await res.json().catch(() => ({}))) as { results?: GeoResult[]; error?: string };
        if (!res.ok) {
          setResults([]);
          setError(res.status === 503 ? "A busca de cidades está indisponível agora. Tente de novo mais tarde." : (data.error ?? "Não foi possível buscar agora."));
        } else {
          const list = data.results ?? [];
          // Cidades primeiro; demais resultados ajudam quando a pessoa digita um bairro.
          setResults([...list.filter((r) => r.kind === "city"), ...list.filter((r) => r.kind !== "city")].slice(0, 6));
          setActive(-1);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") setError("Sem conexão. Verifique a internet e tente de novo.");
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const choose = (r: GeoResult) => {
    setValue({ city: cityLabel(r), lat: r.lat, lng: r.lng });
    setEditing(false);
    setQ("");
    setResults([]);
  };

  const useMyLocation = () => {
    setLoading(true);
    setError(null);
    getCurrentPosition({ timeoutMs: 10_000, highAccuracy: false }).then(
      async ({ lat, lng }) => {
        try {
          const res = await fetch(`/api/geocode/reverse?lat=${lat}&lng=${lng}`);
          const data = (await res.json().catch(() => ({}))) as { result?: GeoResult | null; error?: string };
          if (res.ok && data.result) choose({ ...data.result, lat, lng });
          else setError(res.status === 503 ? "Não conseguimos identificar a cidade agora. Busque pelo nome." : (data.error ?? "Não encontramos sua cidade. Busque pelo nome."));
        } catch {
          setError("Sem conexão. Verifique a internet e tente de novo.");
        } finally {
          setLoading(false);
        }
      },
      () => {
        setLoading(false);
        setError("Não foi possível acessar sua localização. Busque pelo nome da cidade.");
      },
    );
  };

  const hidden = (
    <>
      <input type="hidden" name="homeCity" value={value?.city ?? ""} />
      <input type="hidden" name="homeLat" value={value ? String(value.lat) : ""} />
      <input type="hidden" name="homeLng" value={value ? String(value.lng) : ""} />
    </>
  );

  if (value && !editing) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface-2/60 p-2 pl-4">
        {hidden}
        <MapPin className="size-5 shrink-0 text-primary" aria-hidden />
        <span id={inputId} className="min-w-0 flex-1 truncate text-[15px] font-semibold">
          {value.city}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-10"
          onClick={() => {
            setEditing(true);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
        >
          Trocar
        </Button>
        <Button type="button" size="icon" variant="ghost" onClick={() => setValue(null)} aria-label="Remover cidade de referência" title="Remover cidade">
          <X />
        </Button>
      </div>
    );
  }

  const showList = q.trim().length >= 3 && (results.length > 0 || (!loading && !error));

  return (
    <div className="space-y-2">
      {hidden}
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-subtle-foreground" aria-hidden />
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          placeholder="Busque sua cidade"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(results.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (results[active >= 0 ? active : 0]) choose(results[active >= 0 ? active : 0]);
            } else if (e.key === "Escape" && value) {
              setEditing(false);
              setQ("");
            }
          }}
          className={cn(fieldBase, "h-12 pr-12 pl-11")}
        />
        {loading && <Spinner className="absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted-foreground" />}
      </div>
      {showList && (
        <ul id={listId} role="listbox" aria-label="Cidades encontradas" className="overflow-hidden rounded-2xl border border-border bg-elevated shadow-float">
          {results.length ? (
            results.map((r, i) => (
              <li
                key={`${r.lat},${r.lng},${i}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(r)}
                className={cn("flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2.5 text-sm", i === active ? "bg-surface-2" : "hover:bg-surface-2")}
              >
                <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{cityLabel(r)}</span>
                  {r.kind !== "city" && <span className="block truncate text-xs text-muted-foreground">{r.label}</span>}
                </span>
              </li>
            ))
          ) : (
            <li className="px-4 py-3 text-sm text-muted-foreground">Nenhuma cidade encontrada para “{q.trim()}”.</li>
          )}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-[13px] font-medium text-warning">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" className="h-10" onClick={useMyLocation} disabled={loading}>
          <LocateFixed /> Usar minha localização
        </Button>
        {value && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-10"
            onClick={() => {
              setEditing(false);
              setQ("");
            }}
          >
            Manter {value.city}
          </Button>
        )}
      </div>
    </div>
  );
}
