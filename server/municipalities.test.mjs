import test from 'node:test';
import assert from 'node:assert/strict';
import { IBGE_MUNICIPALITIES_URL, loadMunicipalities, normalizeMunicipalities } from '../shared/municipalities.mjs';

const registro = { id: '3542602', name: 'Registro', uf: 'SP' };
const saoPaulo = { id: '3550308', name: 'São Paulo', uf: 'SP' };
const live = [
  { 'municipio-id': 3550308, 'municipio-nome': 'São Paulo', 'UF-sigla': 'SP' },
  { 'municipio-id': 3542602, 'municipio-nome': 'Registro', 'UF-sigla': 'SP' },
];
const snapshot = { source: IBGE_MUNICIPALITIES_URL, updatedAt: '2026-11-06T12:00:00.000Z', items: [registro, saoPaulo] };
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const fallbackUrl = '/brasil-aberto/data/municipalities.json';

test('normaliza catálogo oficial e mantém Registro/SP disponível', () => {
  assert.deepEqual(normalizeMunicipalities(live), [registro, saoPaulo]);
  assert.deepEqual(normalizeMunicipalities(snapshot.items), [registro, saoPaulo]);
});

test('rejeita catálogo vazio, itens incompletos e municípios duplicados', () => {
  for (const value of [null, [], [null], [{ ...registro, uf: '' }], [{ ...registro, id: '123' }], [registro, registro]]) {
    assert.throws(() => normalizeMunicipalities(value));
  }
});

test('consulta diretamente o IBGE sem depender do servidor Render', async () => {
  const requested = [];
  const result = await loadMunicipalities({ fallbackUrl, fetcher: async url => { requested.push(url); return json(live); } });
  assert.deepEqual(result, [registro, saoPaulo]);
  assert.deepEqual(requested, [IBGE_MUNICIPALITIES_URL]);
});

test('usa catálogo local na falha de rede da fonte oficial', async () => {
  const requested = [];
  const result = await loadMunicipalities({ fallbackUrl, fetcher: async url => {
    requested.push(url);
    if (url === IBGE_MUNICIPALITIES_URL) throw new TypeError('fetch failed');
    return json(snapshot);
  } });
  assert.deepEqual(result, [registro, saoPaulo]);
  assert.deepEqual(requested, [IBGE_MUNICIPALITIES_URL, fallbackUrl]);
});

test('usa catálogo local se o IBGE retornar resposta inválida', async () => {
  const result = await loadMunicipalities({ fallbackUrl, fetcher: async url => json(url === IBGE_MUNICIPALITIES_URL ? [] : snapshot) });
  assert.deepEqual(result, [registro, saoPaulo]);
});

test('rejeita cópia de reserva inválida com mensagem amigável', async () => {
  for (const invalid of [{}, { ...snapshot, updatedAt: 'ontem' }, { ...snapshot, items: [] }]) {
    await assert.rejects(loadMunicipalities({ fallbackUrl, fetcher: async url => {
      if (url === IBGE_MUNICIPALITIES_URL) return new Response('', { status: 503 });
      return json(invalid);
    } }), /Não foi possível carregar a lista de municípios/);
  }
});

test('cancelamento externo interrompe consulta sem disparar fallback', async () => {
  const controller = new AbortController();
  const requested = [];
  const result = loadMunicipalities({ fallbackUrl, signal: controller.signal, fetcher: (url, { signal }) => {
    requested.push(url);
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  } });
  controller.abort();
  await assert.rejects(result, error => error.name === 'AbortError');
  assert.deepEqual(requested, [IBGE_MUNICIPALITIES_URL]);
});

test('timeout da consulta oficial aciona fallback', async () => {
  const requested = [];
  const result = await loadMunicipalities({ fallbackUrl, timeoutMs: 5, fetcher: (url, { signal }) => {
    requested.push(url);
    if (url === fallbackUrl) return Promise.resolve(json(snapshot));
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  } });
  assert.deepEqual(result, [registro, saoPaulo]);
  assert.deepEqual(requested, [IBGE_MUNICIPALITIES_URL, fallbackUrl]);
});
