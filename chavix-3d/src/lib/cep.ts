import "server-only";
import { onlyDigits } from "@/lib/text";

export interface CepResult {
  cep: string;
  street: string;
  district: string;
  city: string;
  state: string;
}

async function fetchJson(url: string, timeoutMs = 4000): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { Accept: "application/json" }, cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}

/** Consulta o CEP no ViaCEP e, se falhar, na BrasilAPI. Retorna null se não existir. */
export async function lookupCep(input: string): Promise<CepResult | null> {
  const cep = onlyDigits(input);
  if (cep.length !== 8) return null;

  try {
    const data = (await fetchJson(`https://viacep.com.br/ws/${cep}/json/`)) as Record<string, unknown>;
    if (data.erro) return null;
    return { cep, street: str(data.logradouro), district: str(data.bairro), city: str(data.localidade), state: str(data.uf).toUpperCase() };
  } catch {
    try {
      const data = (await fetchJson(`https://brasilapi.com.br/api/cep/v1/${cep}`)) as Record<string, unknown>;
      return { cep, street: str(data.street), district: str(data.neighborhood), city: str(data.city), state: str(data.state).toUpperCase() };
    } catch {
      throw new Error("Serviço de CEP indisponível");
    }
  }
}
