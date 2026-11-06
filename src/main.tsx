import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, BarChart3, BookOpen, Building2, Check, ChevronDown, CircleHelp, Database, ExternalLink, FileText, Landmark, Layers3, LoaderCircle, MapPin, Search, SlidersHorizontal, Users, Wallet, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { loadMunicipalities } from '../shared/municipalities.mjs';
import './styles.css';

type City = { id: string; name: string; uf: string };
type Stage = 'Despesas Empenhadas' | 'Despesas Liquidadas' | 'Despesas Pagas';
type Expense = { code: string; name: string; values: Partial<Record<Stage, number>> };
type Dashboard = {
  city: string; year: number; retrievedAt: string; population: number | null; populationError: string | null;
  budget: { totals: Record<Stage, number | null>; functions: Expense[]; institution: string | null } | null;
  budgetError: string | null; sources: { budget: string; population: string };
};
const stages: Stage[] = ['Despesas Empenhadas', 'Despesas Liquidadas', 'Despesas Pagas'];
const colors = ['#235c45', '#78a887', '#b5c9a0', '#d0b46f', '#b8a393', '#ced6d1'];
const number = (value: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value);
const money = (value: number | null | undefined, compact = false) => value == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: compact ? 'compact' : 'standard', maximumFractionDigits: compact ? 2 : 2 }).format(value);
const percentage = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 }).format(value);
// Sem URL externa, o desenvolvimento local continua usando o proxy do Vite.
const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '');
async function get<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${apiBase}${url}`, { signal });
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('A API não retornou dados JSON. Confira a URL do servidor configurada na publicação.');
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Não foi possível carregar os dados.');
  return data;
}

function CitySearch({ city, onChange }: { city: City; onChange: (city: City) => void }) {
  const [cities, setCities] = useState<City[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setError(''); setLoading(true);
    loadMunicipalities({
      fallbackUrl: `${import.meta.env.BASE_URL}data/municipalities.json`,
      signal: controller.signal,
    }).then(result => { if (!controller.signal.aborted) setCities(result); })
      .catch(() => { if (!controller.signal.aborted) setError('Não foi possível carregar a lista de municípios. Tente novamente.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const normalized = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const matches = cities.filter(c => normalized(`${c.name} ${c.uf}`).includes(normalized(query))).slice(0, 35);
  return <div className="city-search" ref={container}>
    <button className="city-trigger" onClick={() => setOpen(!open)} aria-expanded={open}><MapPin size={17} /><span>{city.name}, {city.uf}</span><ChevronDown size={15} /></button>
    {open && <div className="search-menu" onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }}>
      <div className="search-input"><Search size={17} /><input autoFocus placeholder="Buscar município ou UF…" aria-label="Buscar município ou UF" value={query} onChange={e => setQuery(e.target.value)} /></div>
      <div className="search-results" aria-busy={loading}>{matches.map(c => <button key={c.id} onClick={() => { onChange(c); setOpen(false); setQuery(''); }}><span>{c.name} <small>{c.uf}</small></span>{city.id === c.id && <Check size={15} />}</button>)}
      {loading && <p role="status">Carregando municípios…</p>}{error && <p role="alert">{error}</p>}{!loading && !error && !matches.length && <p>Nenhum município encontrado.</p>}{error && <button onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button>}</div>
    </div>}
  </div>;
}

function App() {
  const params = new URLSearchParams(location.search);
  const savedYear = Number(params.get('year'));
  const maxYear = new Date().getFullYear() - 1;
  const [city, setCity] = useState<City>({ id: '3550308', name: 'São Paulo', uf: 'SP' });
  const [year, setYear] = useState(savedYear >= 2019 && savedYear <= maxYear ? savedYear : 2024);
  const [stage, setStage] = useState<Stage>('Despesas Pagas');
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [help, setHelp] = useState(false);
  const modalRef = useRef<HTMLElement>(null);
  const [tableQuery, setTableQuery] = useState('');
  const [ascending, setAscending] = useState(false);

  useEffect(() => {
    if (!help) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHelp(false);
      if (event.key !== 'Tab') return;
      const controls = modalRef.current?.querySelectorAll<HTMLElement>('button, a[href], input, select, [tabindex="0"]');
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('keydown', handleKey); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, [help]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setData(null);
    get<Dashboard>(`/api/dashboard?city=${city.id}&year=${year}`, controller.signal)
      .then(setData).catch(e => { if (e.name !== 'AbortError') setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    history.replaceState(null, '', `?year=${year}`);
    return () => controller.abort();
  }, [city.id, year, reload]);

  const total = data?.budget?.totals[stage];
  const rows = useMemo(() => (data?.budget?.functions ?? []).filter(row => row.values[stage] != null).sort((a, b) => (b.values[stage] ?? 0) - (a.values[stage] ?? 0)), [data, stage]);
  const positive = rows.filter(row => (row.values[stage] ?? 0) > 0);
  const chartData = positive.slice(0, 5).map(row => ({ name: row.name, value: row.values[stage]! }));
  const rest = positive.slice(5).reduce((sum, row) => sum + row.values[stage]!, 0);
  if (rest > 0) chartData.push({ name: 'Demais áreas', value: rest });
  const execution = stages.map(name => ({ name: name.replace('Despesas ', ''), value: data?.budget?.totals[name] ?? 0 }));
  const health = rows.find(row => row.code === '10')?.values[stage];
  const education = rows.find(row => row.code === '12')?.values[stage];
  const filtered = rows.filter(row => row.name.toLowerCase().includes(tableQuery.toLowerCase())).sort((a, b) => ascending ? (a.values[stage] ?? 0) - (b.values[stage] ?? 0) : (b.values[stage] ?? 0) - (a.values[stage] ?? 0));
  const empty = !loading && !error && (!data?.budget || total == null);
  function download() {
    const csv = '\uFEFF' + ['"Município";"UF";"Código IBGE";"Exercício";"Função";"Etapa";"Valor (R$)";"Fonte"', ...rows.map(row => [city.name, city.uf, city.id, year, row.name, stage, row.values[stage]?.toFixed(2).replace('.', ','), data?.sources.budget].map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(';'))].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `brasil-aberto-${city.id}-${year}.csv`; anchor.click(); URL.revokeObjectURL(url);
  }

  return <div className="layout">
    <aside className="sidebar">
      <a className="brand" href={import.meta.env.BASE_URL} aria-label="Brasil Aberto, início"><span className="brand-icon"><BarChart3 size={22} /></span><span>brasil<span className="brand-light">aberto</span><small>DADOS QUE APROXIMAM</small></span></a>
      <div className="workspace-label">EXPLORAR</div>
      <nav aria-label="Navegação principal">
        <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}><Layers3 size={19} />Visão geral<span className="nav-dot" /></button>
        <button className={tab === 'expenses' ? 'active' : ''} onClick={() => setTab('expenses')}><Wallet size={19} />Despesas públicas</button>
        <button className={tab === 'benefits' ? 'active' : ''} onClick={() => setTab('benefits')}><Users size={19} />Benefícios federais</button>
        <button className={tab === 'sources' ? 'active' : ''} onClick={() => setTab('sources')}><Database size={19} />Fontes de dados</button>
      </nav>
      <div className="sidebar-note"><div className="note-icon"><Landmark size={22} /></div><h3>O público é de todos.</h3><p>Conheça os números que fazem parte da sua cidade.</p><button onClick={() => setHelp(true)}>Como ler os dados <ArrowUpRight size={15} /></button></div>
      <div className="sidebar-bottom"><span className="live-dot" />Dados abertos. Cidadania ativa.<small>Projeto independente · Brasil Aberto</small></div>
    </aside>

    <div className="main-wrap">
      <header className="topbar"><div className="breadcrumb">Explorar <span>/</span> <strong>{{ overview: 'Visão geral', expenses: 'Despesas públicas', benefits: 'Benefícios federais', sources: 'Fontes de dados' }[tab]}</strong></div><button className="text-button" onClick={() => setHelp(true)}><CircleHelp size={17} /><span>Entenda os dados</span></button></header>
      <main>
        <div className="page-heading"><div><div className="eyebrow"><span />TRANSPARÊNCIA EM PERSPECTIVA</div><h1>{tab === 'sources' ? 'Dados com origem.' : tab === 'benefits' ? 'O Brasil na sua cidade.' : 'Sua cidade, em números.'}</h1><p>Dados públicos que ajudam você a entender o que acontece perto de casa.</p></div><div className="open-badge"><span className="live-dot" />FONTES OFICIAIS</div></div>

        {tab !== 'sources' && <section className="filters" aria-label="Filtros do painel"><div className="filter-group"><label>Município</label><CitySearch city={city} onChange={setCity} /></div><div className="filter-group"><label htmlFor="year">Exercício</label><select id="year" value={year} onChange={e => setYear(Number(e.target.value))}>{Array.from({ length: maxYear - 2018 }, (_, i) => maxYear - i).map(y => <option key={y}>{y}</option>)}</select></div><div className="filter-group stage-filter"><label htmlFor="stage">Etapa da despesa</label><select id="stage" value={stage} onChange={e => setStage(e.target.value as Stage)}>{stages.map(s => <option key={s}>{s}</option>)}</select></div><button className="export-button" onClick={download} disabled={loading || !rows.length}><ArrowDownToLine size={16} />Exportar CSV</button></section>}

        {tab === 'sources' ? <Sources /> : tab === 'benefits' ? <Benefits city={city} year={year} /> : <>
          <div className="section-top"><div><h2>{tab === 'overview' ? 'Um retrato do orçamento' : 'Para onde vai o dinheiro?'}</h2><span>{city.name} / {city.uf} <span className="separator">·</span> {year} <span className="separator">·</span> {stage.replace('Despesas ', '')}</span></div><span className="source-label"><Database size={13} />Tesouro Nacional + IBGE</span></div>
          {error && <div role="alert" className="notice error">{error}<button onClick={() => setReload(v => v + 1)}>Tentar novamente</button></div>}
          {empty && <div role="status" className="notice">{data?.budgetError || `Não há despesas disponíveis para este município em ${year}. Selecione outro exercício.`}{data?.budgetError && <button onClick={() => setReload(v => v + 1)}>Tentar novamente</button>}</div>}
          {data?.populationError && <div className="notice">{data.populationError} Os valores do orçamento continuam disponíveis.</div>}
          <section className={`stats-grid ${loading ? 'is-loading' : ''}`} aria-busy={loading}>
            <Stat icon={<Wallet size={18} />} title={stage} value={loading ? 'Carregando…' : money(total, true)} detail="Exceto despesas intraorçamentárias" primary />
            <Stat icon={<Users size={18} />} title="População residente" value={loading ? '—' : data?.population != null ? number(data.population) : '—'} detail="IBGE · Censo Demográfico 2022" />
            <Stat icon={<Building2 size={18} />} title="Saúde" value={loading ? '—' : money(health, true)} detail={health != null && total ? `${percentage(health / total)} do total da etapa` : 'Função 10 · Siconfi'} />
            <Stat icon={<BookOpen size={18} />} title="Educação" value={loading ? '—' : money(education, true)} detail={education != null && total ? `${percentage(education / total)} do total da etapa` : 'Função 12 · Siconfi'} />
          </section>
          {loading ? <div className="loading-state" role="status"><LoaderCircle className="spin" size={24} /><h3>Consultando as fontes públicas</h3><p>Estamos buscando os dados de {city.name}. Isso pode levar alguns segundos.</p></div> : tab === 'overview' ? <>
            <div className="charts-grid"><section className="panel distribution"><div className="panel-heading"><div><h3>Onde os recursos são aplicados</h3><p>Distribuição por função de governo</p></div><span className="pill">{year}</span></div>{chartData.length ? <div className="distribution-content"><div className="donut"><ResponsiveContainer width="100%" height={215}><PieChart><Pie data={chartData} dataKey="value" innerRadius={72} outerRadius={94} paddingAngle={3} stroke="none" startAngle={90} endAngle={-270}>{chartData.map((entry, i) => <Cell key={entry.name} fill={colors[i]} />)}</Pie><Tooltip formatter={value => money(Number(value))} /></PieChart></ResponsiveContainer><div className="donut-label"><small>ÁREAS</small><strong>{positive.length}</strong><span>com despesas</span></div></div><div className="legend">{chartData.map((entry, i) => <div key={entry.name}><span className="legend-name"><i style={{ background: colors[i] }} />{entry.name}</span><strong>{total ? percentage(entry.value / total) : '—'}</strong></div>)}</div></div> : <EmptyChart /> }<div className="panel-foot">{stage} · Sem duplicar subfunções</div></section>
            <section className="panel execution"><div className="panel-heading"><div><h3>Do compromisso ao pagamento</h3><p>Etapas da execução orçamentária</p></div><SlidersHorizontal size={17} className="muted" /></div>{data?.budget && execution.some(e => e.value > 0) ? <div className="bar-chart"><ResponsiveContainer width="100%" height={220}><BarChart data={execution} margin={{ top: 15, right: 12, left: 0, bottom: 0 }}><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e9ede9" /><XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} tickMargin={12} /><YAxis tickFormatter={v => money(v, true)} width={72} tickLine={false} axisLine={false} fontSize={10} /><Tooltip formatter={value => money(Number(value))} cursor={{ fill: '#f3f6f2' }} /><Bar dataKey="value" name="Valor" radius={[5, 5, 0, 0]} maxBarSize={58}>{execution.map((entry, i) => <Cell key={entry.name} fill={['#c2d4c7', '#83aa90', '#235c45'][i]} />)}</Bar></BarChart></ResponsiveContainer></div> : <EmptyChart />}<div className="panel-foot">Valores nominais em reais · Mesmo exercício e escopo</div></section></div>
            <section className="insight"><span className="insight-icon"><FileText size={22} /></span><div><span className="eyebrow">UM OLHAR SOBRE OS DADOS</span><h3>{positive[0] && total ? `${positive[0].name} representa ${percentage(positive[0].values[stage]! / total)} das despesas nesta etapa.` : 'Cada número tem uma história e uma fonte.'}</h3><p>Os dados são declarados pelo município ao Tesouro. Valores ausentes não significam gasto zero.</p></div><button onClick={() => setTab('expenses')} aria-label="Explorar despesas"><ArrowRight size={20} /></button></section>
            <div className="section-top table-heading"><div><h2>Despesas por área</h2><span>As maiores aplicações de recursos do município</span></div><button className="text-button green" onClick={() => setTab('expenses')}>Ver todas as áreas <ArrowRight size={15} /></button></div>
            <ExpenseTable rows={rows.slice(0, 5)} stage={stage} total={total} population={data?.population} />
          </> : <>
            <div className="table-toolbar"><div className="search-input"><Search size={17} /><input aria-label="Filtrar áreas de despesa" placeholder="Buscar área de despesa…" value={tableQuery} onChange={e => setTableQuery(e.target.value)} /></div><button className="text-button" onClick={() => setAscending(!ascending)}>Valor {ascending ? '↑ crescente' : '↓ decrescente'}</button></div>
            <ExpenseTable rows={filtered} stage={stage} total={total} population={data?.population} />
          </>}
          {data && <p className="retrieval">Consulta realizada em {new Date(data.retrievedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (Brasília). <a href={data.sources.budget} target="_blank" rel="noreferrer">Ver resposta original <ExternalLink size={11} /></a></p>}
        </>}
        <footer><span><span className="footer-brand">brasilaberto</span> Informação pública, mais próxima de você.</span><button onClick={() => setTab('sources')}>Fontes e metodologia <ArrowUpRight size={13} /></button></footer>
      </main>
    </div>
    {help && <div className="modal-backdrop" onClick={() => setHelp(false)}><section ref={modalRef} className="modal" role="dialog" aria-modal="true" aria-label="Como ler os dados" onClick={e => e.stopPropagation()}><button autoFocus className="modal-close" onClick={() => setHelp(false)} aria-label="Fechar"><X size={20} /></button><span className="eyebrow">GUIA DE LEITURA</span><h2>O caminho do dinheiro público</h2><dl><dt>01 · Empenhado</dt><dd>O governo reservou parte do orçamento para uma despesa.</dd><dt>02 · Liquidado</dt><dd>Foi verificado o direito do credor, como a entrega de um serviço.</dd><dt>03 · Pago</dt><dd>O pagamento foi realizado. É a etapa exibida inicialmente.</dd></dl><p>O painel usa o anexo I-E da DCA, excluindo despesas intraorçamentárias. Funções e subfunções não são somadas juntas. Não representa auditoria ou avaliação de qualidade do gasto.</p><p>O valor por habitante usa a população do Censo 2022, mesmo para outros exercícios. Os valores são nominais, sem ajuste pela inflação.</p><button className="solid-button" onClick={() => setHelp(false)}>Entendi <Check size={16} /></button></section></div>}
  </div>;
}

function Stat({ icon, title, value, detail, primary = false }: { icon: React.ReactNode; title: string; value: string; detail: string; primary?: boolean }) {
  return <article className={`stat ${primary ? 'primary' : ''}`}><div className="stat-title">{title}<span>{icon}</span></div><strong>{value}</strong><p>{detail}</p></article>;
}
function EmptyChart() { return <div className="empty-chart"><Database size={25} /><p>Sem dados para esta seleção</p></div>; }
function ExpenseTable({ rows, stage, total, population }: { rows: Expense[]; stage: Stage; total: number | null | undefined; population: number | null | undefined }) {
  return <div className="table-wrap"><table><thead><tr><th>FUNÇÃO DE GOVERNO</th><th>VALOR {stage.replace('Despesas ', '').toUpperCase()}</th><th>PARTICIPAÇÃO</th><th>POR HABITANTE¹</th></tr></thead><tbody>{rows.map((row, i) => <tr key={row.code}><td><span className="function-icon" style={{ color: colors[i % colors.length] }}><Landmark size={15} /></span><span>{row.name}<small>Função {row.code}</small></span></td><td>{money(row.values[stage])}</td><td><div className="participation"><span>{total ? percentage(row.values[stage]! / total) : '—'}</span><div><i style={{ width: `${total ? Math.min(100, Math.max(0, row.values[stage]! / total * 100)) : 0}%` }} /></div></div></td><td>{population ? money(row.values[stage]! / population) : '—'}</td></tr>)}</tbody></table>{!rows.length && <div className="empty-chart">Nenhuma área encontrada para esta seleção.</div>}<p className="table-note">¹ Referência populacional: Censo IBGE 2022. Não é a população estimada do exercício selecionado.</p></div>;
}
function Sources() {
  const sources = [
    { name: 'IBGE', tag: 'INTEGRADO', description: 'Catálogo de municípios consultado diretamente no IBGE, com cópia de reserva no site. População residente do Censo Demográfico 2022, tabela SIDRA 4714.', href: 'https://servicodados.ibge.gov.br/api/docs/localidades', icon: <MapPin size={23} /> },
    { name: 'Tesouro Nacional · Siconfi', tag: 'INTEGRADO', description: 'Despesas anuais por função e etapa. DCA, anexo I-E, exceto intraorçamentárias. Disponibilidade varia por município e exercício.', href: 'https://apidatalake.tesouro.gov.br/docs/siconfi/', icon: <Landmark size={23} /> },
    { name: 'Portal da Transparência', tag: 'REQUER CHAVE', description: 'Conector de Bolsa Família por município preparado no servidor. Configure a chave no .env para consultar benefícios federais.', href: 'https://portaldatransparencia.gov.br/api-de-dados', icon: <Users size={23} /> },
    { name: 'dados.gov.br', tag: 'CATÁLOGO EXTERNO', description: 'Explore conjuntos de dados de órgãos públicos. Nesta versão, o acesso é por link; a API do catálogo ainda não está integrada.', href: 'https://dados.gov.br/dados/conjuntos-dados', icon: <Database size={23} /> },
  ];
  return <><div className="section-top"><div><h2>De onde vêm os números</h2><span>Rastreabilidade para explorar com confiança</span></div></div><div className="sources-grid">{sources.map(source => <article className="panel source-card" key={source.name}><div className="source-card-top"><span className="source-icon">{source.icon}</span><span className="pill">{source.tag}</span></div><h3>{source.name}</h3><p>{source.description}</p><a href={source.href} target="_blank" rel="noreferrer">Acessar fonte oficial <ArrowUpRight size={16} /></a></article>)}</div><section className="methodology panel"><h3>Metodologia e limites</h3><p>Os valores do orçamento são nominais, em reais, conforme as declarações dos entes ao Siconfi. O total corresponde à linha “Despesas Exceto Intraorçamentárias”. O detalhamento usa apenas funções de dois dígitos, sem incluir suas subfunções.</p><p>Dados ausentes são exibidos como indisponíveis. O cache de consultas dura 15 minutos e não substitui o calendário de atualização dos órgãos. A data de consulta indica quando a aplicação buscou os dados, não quando o órgão os publicou.</p><p>O orçamento municipal e os benefícios federais têm escopos distintos. Benefícios não são somados às despesas da prefeitura. Este é um projeto independente de portfólio, sem vínculo governamental.</p></section></>;
}
function Benefits({ city, year }: { city: City; year: number }) {
  const [month, setMonth] = useState(`${year}-12`);
  const [result, setResult] = useState<{ items: { valor: number; quantidadeBeneficiados: number }[]; source: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);
  useEffect(() => { requestId.current++; setResult(null); setError(''); setBusy(false); setMonth(`${year}-12`); }, [city.id, year]);
  async function consult() {
    const id = ++requestId.current;
    setBusy(true); setError(''); setResult(null);
    try { const value = await get<{ items: { valor: number; quantidadeBeneficiados: number }[]; source: string }>(`/api/benefits?city=${city.id}&month=${month.replace('-', '')}`); if (id === requestId.current) setResult(value); }
    catch (e) { if (id === requestId.current) setError((e as Error).message); }
    finally { if (id === requestId.current) setBusy(false); }
  }
  return <section className="panel benefits"><span className="source-icon"><Users size={25} /></span><h2>Bolsa Família no município</h2><p>Consulte os pagamentos federais destinados a beneficiários de {city.name}. Esses valores não fazem parte do orçamento da prefeitura exibido no painel.</p><div className="benefit-form"><label>Mês de referência<input type="month" min="2023-03" max={`${new Date().getFullYear()}-12`} value={month} onChange={e => { requestId.current++; setMonth(e.target.value); setResult(null); setError(''); setBusy(false); }} /></label><button className="solid-button" disabled={busy || !month} onClick={consult}>{busy ? <LoaderCircle className="spin" size={16} /> : <Search size={16} />}Consultar</button></div>{error && <div className="notice" role="alert">{error}</div>}{result && <div className="benefit-result">{result.items.length ? <><strong>{money(result.items.reduce((sum, item) => sum + Number(item.valor), 0))}</strong><p>{number(result.items.reduce((sum, item) => sum + Number(item.quantidadeBeneficiados), 0))} beneficiários informados</p></> : <p>Não há registros para este mês e município.</p>}<a href={result.source} target="_blank" rel="noreferrer">Resposta oficial <ExternalLink size={13} /></a></div>}<div className="integration-note"><Database size={17} /><p>Esta integração exige uma chave gratuita do Portal da Transparência, configurada apenas no servidor. <a href="https://portaldatransparencia.gov.br/api-de-dados/cadastrar-email" target="_blank" rel="noreferrer">Solicitar chave <ArrowUpRight size={12} /></a></p></div></section>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
