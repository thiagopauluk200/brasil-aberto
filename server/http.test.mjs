import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

async function startServer(t, { offline = false } = {}) {
  const command = offline
    ? ['--input-type=module', '--eval', "globalThis.fetch = async () => { throw new Error('IBGE indisponível no teste'); }; await import('./server/index.mjs');"]
    : ['server/index.mjs'];
  const child = spawn(process.execPath, command, {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', TRUST_PROXY: '', ALLOWED_ORIGINS: 'https://portfolio.github.io' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => child.kill());
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('O servidor não iniciou.')), 7000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`O servidor encerrou: ${code}`)); });
    child.stdout.on('data', chunk => {
      output += chunk.toString();
      const url = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      if (url) { clearTimeout(timer); resolve(url); }
    });
  });
}

test('backend publicado responde health check, restringe CORS e limita consultas', { timeout: 15000 }, async t => {
  const base = await startServer(t);
  const allowed = await fetch(`${base}/api/health`, { headers: { Origin: 'https://portfolio.github.io' } });
  assert.equal(allowed.status, 200);
  assert.deepEqual(await allowed.json(), { status: 'ok' });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://portfolio.github.io');
  const denied = await fetch(`${base}/api/health`, { headers: { Origin: 'https://outro.github.io' } });
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  for (let i = 0; i < 60; i++) {
    const invalid = await fetch(`${base}/api/dashboard?city=invalid&year=2024`);
    assert.equal(invalid.status, 400);
    await invalid.arrayBuffer();
  }
  const limited = await fetch(`${base}/api/dashboard?city=invalid&year=2024`);
  assert.equal(limited.status, 429);
  assert.match((await limited.json()).error, /Aguarde/);
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
});

test('catálogo mantém Registro e demais municípios mesmo com IBGE indisponível no servidor', { timeout: 15000 }, async t => {
  const base = await startServer(t, { offline: true });
  const response = await fetch(`${base}/api/municipalities`);
  assert.equal(response.status, 200);
  assert.ok(response.headers.get('X-Municipalities-Reference'));
  const items = await response.json();
  assert.ok(items.length > 5000);
  assert.deepEqual(items.find(city => city.id === '3542602'), { id: '3542602', name: 'Registro', uf: 'SP' });
  assert.ok(items.some(city => city.name === 'Curitiba' && city.uf === 'PR'));
});
