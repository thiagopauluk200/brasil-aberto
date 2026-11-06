export const STAGES = ['Despesas Empenhadas', 'Despesas Liquidadas', 'Despesas Pagas'];

// O anexo contém total, funções e subfunções. Somá-los juntos duplicaria despesas.
export function normalizeExpenses(items) {
  const totals = Object.fromEntries(STAGES.map(stage => [stage, null]));
  const functions = new Map();
  for (const item of items) {
    if (!STAGES.includes(item.coluna) || !Number.isFinite(item.valor)) continue;
    if (item.conta === 'Despesas Exceto Intraorçamentárias') {
      if (totals[item.coluna] !== null) throw new Error('Mais de uma declaração encontrada para o total.');
      totals[item.coluna] = item.valor;
    }
    const match = /^(\d{2}) - (.+)$/.exec(item.conta);
    if (!match) continue;
    const [, code, name] = match;
    const row = functions.get(code) ?? { code, name, values: {} };
    if (row.values[item.coluna] !== undefined) throw new Error('Função duplicada na declaração.');
    row.values[item.coluna] = item.valor;
    functions.set(code, row);
  }
  return { totals, functions: [...functions.values()] };
}

export function validateSelection(city, year) {
  if (!/^\d{7}$/.test(city ?? '')) throw new Error('Informe um código IBGE com 7 dígitos.');
  if (!/^\d{4}$/.test(year ?? '') || +year < 2019 || +year > new Date().getFullYear() - 1) {
    throw new Error('Selecione um exercício encerrado a partir de 2019.');
  }
}
