import { mkdir, writeFile } from 'node:fs/promises';
import { IBGE_MUNICIPALITIES_URL, normalizeMunicipalities } from '../shared/municipalities.mjs';

const response = await fetch(IBGE_MUNICIPALITIES_URL, { signal: AbortSignal.timeout(30000) });
if (!response.ok) throw new Error(`O IBGE retornou HTTP ${response.status}; catálogo anterior preservado.`);
const items = normalizeMunicipalities(await response.json());
if (items.length < 5000) throw new Error('O catálogo retornado está incompleto; versão anterior preservada.');
const destination = new URL('../public/data/municipalities.json', import.meta.url);
const snapshot = { source: IBGE_MUNICIPALITIES_URL, updatedAt: new Date().toISOString(), items };
await mkdir(new URL('../public/data/', import.meta.url), { recursive: true });
await writeFile(destination, JSON.stringify(snapshot) + '\n', 'utf8');
console.log(`Catálogo do IBGE atualizado: ${items.length} municípios.`);
