export const IBGE_MUNICIPALITIES_URL = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome&view=nivelado';

const states = new Set(['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']);

export function normalizeMunicipalities(data) {
  if (!Array.isArray(data) || data.length === 0) throw new Error('O catálogo de municípios está vazio ou inválido.');
  const ids = new Set();
  return data.map(row => {
    if (!row || typeof row !== 'object') throw new Error('Município inválido no catálogo.');
    const flat = Object.hasOwn(row, 'municipio-id');
    const id = String(flat ? row['municipio-id'] : row.id);
    const name = (flat ? row['municipio-nome'] : row.name)?.trim?.();
    const uf = (flat ? row['UF-sigla'] : row.uf)?.trim?.().toUpperCase();
    if (!/^\d{7}$/.test(id) || !name || !states.has(uf)) throw new Error('Município incompleto ou inválido no catálogo.');
    if (ids.has(id)) throw new Error('Município duplicado no catálogo.');
    ids.add(id);
    return { id, name, uf };
  }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || a.uf.localeCompare(b.uf));
}

function checkCancellation(signal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException('Consulta cancelada.', 'AbortError');
}

async function readJSON(url, { signal, fetcher, timeoutMs }) {
  checkCancellation(signal);
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('Tempo limite da consulta excedido.', 'TimeoutError')), timeoutMs);
  try {
    const response = await fetcher(url, { signal: controller.signal });
    checkCancellation(signal);
    if (!response.ok) throw new Error(`Falha ao consultar municípios: HTTP ${response.status}.`);
    const data = await response.json();
    checkCancellation(signal);
    return data;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

// O catálogo público permite CORS. A cópia local mantém a busca disponível
// quando o IBGE está temporariamente indisponível ou lento.
export async function loadMunicipalities({ fallbackUrl, signal, fetcher = fetch, timeoutMs = 5000 }) {
  const options = { signal, fetcher, timeoutMs };
  try {
    return normalizeMunicipalities(await readJSON(IBGE_MUNICIPALITIES_URL, options));
  } catch (error) {
    checkCancellation(signal);
    try {
      const snapshot = await readJSON(fallbackUrl, options);
      if (!snapshot || typeof snapshot.source !== 'string' || !snapshot.source.trim() || !Number.isFinite(Date.parse(snapshot.updatedAt))) {
        throw new Error('A cópia local do catálogo está inválida.');
      }
      return normalizeMunicipalities(snapshot.items);
    } catch (fallbackError) {
      checkCancellation(signal);
      throw new Error('Não foi possível carregar a lista de municípios. Tente novamente.', { cause: fallbackError });
    }
  }
}
