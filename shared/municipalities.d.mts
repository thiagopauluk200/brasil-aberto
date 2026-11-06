export type Municipality = { id: string; name: string; uf: string };
export const IBGE_MUNICIPALITIES_URL: string;
export function normalizeMunicipalities(data: unknown): Municipality[];
export function loadMunicipalities(options: {
  fallbackUrl: string;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}): Promise<Municipality[]>;
