import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeExpenses, validateSelection } from './domain.mjs';

test('usa total oficial e funções, excluindo subfunções e despesas intraorçamentárias', () => {
  const row = (conta, valor, coluna = 'Despesas Pagas') => ({ conta, valor, coluna });
  const result = normalizeExpenses([
    row('Despesas Exceto Intraorçamentárias', 100), row('10 - Saúde', 60),
    row('10.301 - Atenção Básica', 40), row('12 - Educação', 40),
    row('Despesas Intraorçamentárias', 30), row('10 - Saúde', 65, 'Despesas Empenhadas'),
  ]);
  assert.equal(result.totals['Despesas Pagas'], 100);
  assert.equal(result.totals['Despesas Liquidadas'], null);
  assert.equal(result.functions.length, 2);
  assert.equal(result.functions[0].values['Despesas Pagas'], 60);
  assert.equal(result.functions[0].values['Despesas Empenhadas'], 65);
});
test('preserva zero e não converte dado ausente em zero', () => {
  const result = normalizeExpenses([{ conta: '10 - Saúde', valor: 0, coluna: 'Despesas Pagas' }]);
  assert.equal(result.functions[0].values['Despesas Pagas'], 0);
  assert.equal(result.functions[0].values['Despesas Liquidadas'], undefined);
  assert.equal(result.totals['Despesas Pagas'], null);
});
test('rejeita duplicações em vez de somar declarações sobrepostas', () => {
  const row = { conta: '10 - Saúde', valor: 10, coluna: 'Despesas Pagas' };
  assert.throws(() => normalizeExpenses([row, row]), /duplicada/);
});
test('valida município e exercícios encerrados', () => {
  assert.doesNotThrow(() => validateSelection('3550308', '2024'));
  assert.throws(() => validateSelection('../test', '2024'));
  assert.throws(() => validateSelection('3550308', '2018'));
  assert.throws(() => validateSelection('3550308', String(new Date().getFullYear())));
});
