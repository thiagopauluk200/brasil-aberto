const value = (process.env.VITE_API_BASE_URL ?? '').trim();
let valid = false;
try {
  const url = new URL(value);
  valid = url.protocol === 'https:' && url.pathname === '/' && !url.username && !url.password && !url.search && !url.hash;
} catch { /* A mensagem abaixo orienta como corrigir a configuração. */ }
if (!valid) {
  console.error('Configure a variável VITE_API_BASE_URL em Settings > Secrets and variables > Actions > Variables. Use a URL HTTPS do backend, sem /api (ex.: https://brasil-aberto-api.onrender.com).');
  process.exit(1);
}
console.log('URL pública da API validada.');
