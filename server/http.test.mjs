import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

test('backend publicado responde health check, restringe CORS e limita consultas', { timeout: 15000 }, async t => {
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', TRUST_PROXY: '', ALLOWED_ORIGINS: 'https://portfolio.github.io' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => child.kill());
  const base = await new Promise((resolve, reject) => {
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
