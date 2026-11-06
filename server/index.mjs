import express from 'express';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { normalizeExpenses, validateSelection } from './domain.mjs';
import { IBGE_MUNICIPALITIES_URL, normalizeMunicipalities } from '../shared/municipalities.mjs';

const municipalitySnapshot = JSON.parse(await readFile(new URL('../public/data/municipalities.json', import.meta.url), 'utf8'));
const cachedMunicipalities = normalizeMunicipalities(municipalitySnapshot.items);

const app = express();
app.disable('x-powered-by');
// Configure apenas para a quantidade de proxies da hospedagem utilizada.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY));
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean);
app.use('/api', cors({
  origin: (origin, callback) => callback(null, Boolean(origin && allowedOrigins.includes(origin))),
  methods: ['GET', 'HEAD', 'OPTIONS'],
}));
// Health check não depende de APIs governamentais ou do build do frontend.
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas consultas em sequência. Aguarde um minuto e tente novamente.' },
}));
const cache = new Map();
let treasuryQueue = Promise.resolve();
let lastTreasury = 0;
const TESOURO = 'https://apidatalake.tesouro.gov.br/ords/siconfi/tt/dca';

async function upstream(url, headers = {}) {
  const existing = cache.get(url);
  if (existing && existing.expires > Date.now()) return existing.promise;
  const promise = (async () => {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`A fonte retornou HTTP ${response.status}. Tente novamente mais tarde.`);
    return response.json();
  })();
  cache.set(url, { promise, expires: Date.now() + 15 * 60 * 1000 });
  try { return await promise; } catch (error) { cache.delete(url); throw error; }
}

// Fila global: o Tesouro limita a API a uma requisição por segundo.
function treasury(url) {
  const task = treasuryQueue.then(async () => {
    const delay = Math.max(0, 1100 - (Date.now() - lastTreasury));
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    lastTreasury = Date.now();
    return upstream(url);
  });
  treasuryQueue = task.catch(() => {});
  return task;
}

app.get('/api/municipalities', async (_req, res) => {
  try {
    const data = await upstream(IBGE_MUNICIPALITIES_URL);
    res.json(normalizeMunicipalities(data));
  } catch {
    // Mantém compatibilidade com clientes antigos quando o IBGE não responde à hospedagem.
    res.set('X-Municipalities-Reference', municipalitySnapshot.updatedAt);
    res.json(cachedMunicipalities);
  }
});

app.get('/api/dashboard', async (req, res) => {
  const city = String(req.query.city ?? '');
  const year = String(req.query.year ?? '');
  try { validateSelection(city, year); } catch (error) { return res.status(400).json({ error: error.message }); }
  const sourceUrl = `${TESOURO}?${new URLSearchParams({ an_exercicio: year, id_ente: city, no_anexo: 'DCA-Anexo I-E' })}`;
  const populationUrl = `https://apisidra.ibge.gov.br/values/t/4714/n6/${city}/v/93/p/2022`;
  const [budget, census] = await Promise.allSettled([
    (async () => {
      const items = [];
      let url = sourceUrl;
      for (let page = 0; page < 10; page++) {
        const data = await treasury(url);
        if (!Array.isArray(data.items)) throw new Error('Resposta inesperada do Tesouro.');
        items.push(...data.items);
        if (!data.hasMore) return { ...normalizeExpenses(items), institution: items[0]?.instituicao ?? null };
        const next = data.links?.find(link => link.rel === 'next')?.href;
        if (!next || !next.startsWith(`${TESOURO}?`)) throw new Error('Não foi possível carregar todas as páginas.');
        url = next;
      }
      throw new Error('A consulta excedeu o limite de páginas.');
    })(),
    upstream(populationUrl).then(data => {
      const raw = data.find?.(row => row.D2C === '93')?.V;
      return raw && /^\d+$/.test(raw) ? Number(raw) : null;
    }),
  ]);
  res.json({
    city, year: +year, retrievedAt: new Date().toISOString(),
    budget: budget.status === 'fulfilled' ? budget.value : null,
    budgetError: budget.status === 'rejected' ? budget.reason.message : null,
    population: census.status === 'fulfilled' ? census.value : null,
    populationError: census.status === 'rejected' ? 'IBGE indisponível nesta consulta.' : null,
    sources: { budget: sourceUrl, population: populationUrl },
  });
});

app.get('/api/benefits', async (req, res) => {
  const city = String(req.query.city ?? '');
  const month = String(req.query.month ?? '');
  if (!/^\d{7}$/.test(city) || !/^20\d{2}(0[1-9]|1[0-2])$/.test(month)) return res.status(400).json({ error: 'Município ou mês inválido.' });
  const key = process.env.TRANSPARENCIA_API_KEY;
  if (!key) return res.status(503).json({ error: 'Integração disponível após configurar TRANSPARENCIA_API_KEY no arquivo .env.', needsKey: true });
  const url = `https://api.portaldatransparencia.gov.br/api-de-dados/novo-bolsa-familia-por-municipio?${new URLSearchParams({ codigoIbge: city, mesAno: month, pagina: '1' })}`;
  const data = await upstream(url, { 'chave-api-dados': key });
  if (!Array.isArray(data)) throw new Error('Resposta inesperada do Portal da Transparência.');
  res.json({ items: data, source: url, month });
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Consulta não encontrada.' }));
const staticDirectory = fileURLToPath(new URL('../dist', import.meta.url));
if (existsSync(`${staticDirectory}/index.html`)) {
  app.use(express.static(staticDirectory));
  app.get('/{*path}', (_req, res) => res.sendFile(`${staticDirectory}/index.html`));
} else {
  app.use((_req, res) => res.status(404).json({ error: 'Este serviço hospeda a API. Consulte /api/health.' }));
}
app.use((error, _req, res, _next) => res.status(502).json({ error: error.message ?? 'Fonte temporariamente indisponível.' }));
const host = process.env.HOST ?? '127.0.0.1';
const server = app.listen(Number(process.env.PORT ?? 3001), host, () => console.log(`API Brasil Aberto em http://${host}:${server.address().port}`));
