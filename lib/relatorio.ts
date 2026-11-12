import { unstable_cache } from "next/cache";
import { CACHE_SEGUNDOS, INICIO, PRODUTOS, REGRAS, VAGAS } from "./config";
import { lerMeta, type MetaDia } from "./meta";
import { FOTO } from "./foto-notifica";

/** Tudo o que a página mostra. Só números agregados: nenhum dado pessoal. */
export type Periodo = { de: string; ate: string; preset: string; rotulo: string };

export type Relatorio = {
  geradoEm: string; inicio: string; fim: string;
  /** Período escolhido no filtro (datas já ajustadas ao intervalo com dados). */
  periodo: Periodo & { completo: boolean };
  erros: { meta?: string; cv?: string };
  /** De onde vêm os números do CRM: foto do NotificaLead ou CV ao vivo. */
  crm: {
    fonte: "foto" | "cv"; extraidoEm: string | null; ate: string;
    /** Parte do período escolhido coberta pelos dados do CRM (null = nenhuma). */
    cobre: { de: string; ate: string } | null;
    /** Os números agregados (formulário, horário, qualidade, etapa) valem para o período escolhido? */
    detalhesNoPeriodo: boolean;
  };
  totais: { investimento: number; leadsMeta: number; leadsCrm: number | null; leadsUnicos: number | null; cplCrm: number | null; repetidos: number; repetidosEntreRegras: number };
  regras: { id: string; nome: string; investimento: number; leadsMeta: number; leadsCrm: number | null; diferenca: number | null; cplCrm: number | null; inicio: string | null; fim: string | null }[];
  produtos: { id: string; nome: string; ativo: boolean; inicio: string | null; fim: string | null; investimento: number; leadsMeta: number; cpl: number | null; impressoes: number; cliques: number; ctr: number | null; cpc: number | null; campanhas: string[]; porDia: { data: string; leads: number; investimento: number }[] }[];
  campanhas: { id: string; nome: string; produto: string; ativa: boolean; investimento: number; leadsMeta: number; cpl: number | null; cliques: number }[];
  investimentoDia: { data: string; valores: Record<string, number> }[];
  leadsDia: { data: string; valores: Record<string, number> }[];
  horas: { hora: number; leads: number }[];
  formularios: { regra: string; formulario: string; leads: number; inicio: string; fim: string }[];
  qualidade: { regra: string; leads: number; unicos: number; semEmail: number; telefoneInvalido: number }[];
  situacoes: { situacao: string; leads: number }[];
  semRegra: number;
  /** Campanhas de leads para vaga de corretor (só Meta). */
  vagas: {
    investimento: number; inscritos: number; cpl: number | null; impressoes: number; cliques: number; ctr: number | null;
    ativo: boolean; inicio: string | null; fim: string | null;
    campanhas: { id: string; nome: string; ativa: boolean; investimento: number; inscritos: number; cpl: number | null; cliques: number }[];
    porDia: { data: string; leads: number; investimento: number }[];
  };
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const div = (a: number, b: number) => (b > 0 ? r2(a / b) : null);

/** Data e hora no fuso de Brasília. */
function agoraSP() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { data: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}

function diasEntre(inicio: string, fim: string) {
  const out: string[] = [];
  for (let t = Date.parse(inicio + "T12:00:00Z"); t <= Date.parse(fim + "T12:00:00Z"); t += 864e5) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

function montarVagas(meta: MetaDia[], hoje: string): Relatorio["vagas"] {
  const ontem = new Date(Date.parse(hoje + "T12:00:00Z") - 864e5).toISOString().slice(0, 10);
  const porCamp = new Map<string, { id: string; nome: string; investimento: number; inscritos: number; cliques: number; ultimo: string }>();
  const porDiaMap = new Map<string, { leads: number; investimento: number }>();
  let imp = 0;
  for (const d of meta) {
    const c = porCamp.get(d.campanhaId) ?? { id: d.campanhaId, nome: d.campanha, investimento: 0, inscritos: 0, cliques: 0, ultimo: "" };
    c.investimento += d.investimento; c.inscritos += d.leads; c.cliques += d.cliques;
    if (d.investimento > 0 && d.data > c.ultimo) c.ultimo = d.data;
    porCamp.set(d.campanhaId, c);
    const v = porDiaMap.get(d.data) ?? { leads: 0, investimento: 0 };
    v.leads += d.leads; v.investimento += d.investimento; porDiaMap.set(d.data, v);
    imp += d.impressoes;
  }
  const campanhas = [...porCamp.values()].filter(c => c.investimento > 0 || c.inscritos > 0)
    .map(c => ({ id: c.id, nome: c.nome, ativa: c.ultimo >= ontem, investimento: r2(c.investimento), inscritos: c.inscritos, cpl: div(c.investimento, c.inscritos), cliques: c.cliques }))
    .sort((a, b) => b.investimento - a.investimento);
  const comGasto = meta.filter(d => d.investimento > 0).map(d => d.data).sort();
  const inicio = comGasto[0] ?? null, fim = comGasto.at(-1) ?? null;
  const investimento = r2(campanhas.reduce((s, c) => s + c.investimento, 0));
  const inscritos = campanhas.reduce((s, c) => s + c.inscritos, 0);
  const cliques = campanhas.reduce((s, c) => s + c.cliques, 0);
  return {
    investimento, inscritos, cpl: div(investimento, inscritos), impressoes: imp, cliques, ctr: imp ? r2((cliques / imp) * 100) : null,
    ativo: campanhas.some(c => c.ativa), inicio, fim, campanhas,
    porDia: inicio && fim ? diasEntre(inicio, fim).map(data => ({ data, leads: porDiaMap.get(data)?.leads ?? 0, investimento: r2(porDiaMap.get(data)?.investimento ?? 0) })) : [],
  };
}

function montarMeta(meta: MetaDia[], fim: string) {
  const ultimoDia = (() => { const d = new Date(Date.parse(fim + "T12:00:00Z") - 864e5); return d.toISOString().slice(0, 10); })();
  const porCampanha = new Map<string, Relatorio["campanhas"][number] & { ultimoGasto: string }>();
  for (const d of meta) {
    const c = porCampanha.get(d.campanhaId) ?? { id: d.campanhaId, nome: d.campanha, produto: d.produto, ativa: false, investimento: 0, leadsMeta: 0, cpl: null, cliques: 0, ultimoGasto: "" };
    c.investimento += d.investimento; c.leadsMeta += d.leads; c.cliques += d.cliques;
    if (d.investimento > 0 && d.data > c.ultimoGasto) c.ultimoGasto = d.data;
    porCampanha.set(d.campanhaId, c);
  }
  const campanhas = [...porCampanha.values()]
    .filter(c => c.investimento > 0 || c.leadsMeta > 0)
    .map(({ ultimoGasto, ...c }) => ({ ...c, investimento: r2(c.investimento), ativa: ultimoGasto >= ultimoDia, cpl: div(c.investimento, c.leadsMeta) }))
    .sort((a, b) => b.investimento - a.investimento);

  const produtos = PRODUTOS.map(p => {
    const ds = meta.filter(d => d.produto === p.id);
    const comGasto = ds.filter(d => d.investimento > 0).map(d => d.data).sort();
    const inv = ds.reduce((s, d) => s + d.investimento, 0);
    const leads = ds.reduce((s, d) => s + d.leads, 0);
    const imp = ds.reduce((s, d) => s + d.impressoes, 0);
    const cli = ds.reduce((s, d) => s + d.cliques, 0);
    const porDiaMap = new Map<string, { leads: number; investimento: number }>();
    for (const d of ds) { const v = porDiaMap.get(d.data) ?? { leads: 0, investimento: 0 }; v.leads += d.leads; v.investimento += d.investimento; porDiaMap.set(d.data, v); }
    const inicio = comGasto[0] ?? null, ultimo = comGasto.at(-1) ?? null;
    return {
      id: p.id, nome: p.nome, ativo: !!ultimo && ultimo >= ultimoDia, inicio, fim: ultimo,
      investimento: r2(inv), leadsMeta: leads, cpl: div(inv, leads), impressoes: imp, cliques: cli,
      ctr: imp > 0 ? r2((cli / imp) * 100) : null, cpc: div(inv, cli),
      campanhas: campanhas.filter(c => c.produto === p.id).map(c => c.nome),
      porDia: inicio && ultimo ? diasEntre(inicio, ultimo).map(data => ({ data, leads: porDiaMap.get(data)?.leads ?? 0, investimento: r2(porDiaMap.get(data)?.investimento ?? 0) })) : [],
    };
  }).filter(p => p.investimento > 0 || p.leadsMeta > 0);

  const invDia = new Map<string, Record<string, number>>();
  for (const d of meta) {
    const regra = REGRAS.find(r => r.produtos.includes(d.produto))?.id ?? d.produto;
    const v = invDia.get(d.data) ?? {};
    v[regra] = r2((v[regra] ?? 0) + d.investimento);
    invDia.set(d.data, v);
  }
  return { campanhas, produtos, invDia };
}

/** Dados brutos (Meta por dia e campanha), buscados uma vez e guardados em cache. */
type Dados = { meta: MetaDia[]; hoje: string; hora: string; erros: Relatorio["erros"] };

async function coletar(): Promise<Dados> {
  const { data: hoje, hora } = agoraSP();
  const erros: Relatorio["erros"] = {};
  const limite = <T,>(p: Promise<T>, nome: string) => Promise.race([p, new Promise<never>((_, rej) =>
    setTimeout(() => rej(new Error(`${nome} demorou mais de 110 segundos para responder.`)), 110000))]);
  let meta: MetaDia[] = [];
  try { meta = await limite(lerMeta(INICIO, hoje), "O Ads Editor"); }
  catch (e) { erros.meta = String((e as Error)?.message ?? e); }
  return { meta, hoje, hora, erros };
}

const ROTULOS: Record<string, string> = {
  hoje: "Hoje", ontem: "Ontem", "7d": "Últimos 7 dias", "30d": "Últimos 30 dias",
  mes: "Este mês", "mes-passado": "Mês passado", tudo: "Todo o período", personalizado: "Personalizado",
};

/** Converte o filtro da página (preset ou datas) em um intervalo de datas. */
export function resolverPeriodo(hoje: string, preset?: string, de?: string, ate?: string): Periodo {
  const dia = (d: string, n: number) => new Date(Date.parse(d + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
  const valida = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) ? d : undefined);
  const lim = (d: string) => (d < INICIO ? INICIO : d > hoje ? hoje : d);
  const mesIni = hoje.slice(0, 8) + "01";
  const mesPassadoFim = dia(mesIni, -1);
  const tabela: Record<string, [string, string]> = {
    hoje: [hoje, hoje], ontem: [dia(hoje, -1), dia(hoje, -1)], "7d": [dia(hoje, -6), hoje], "30d": [dia(hoje, -29), hoje],
    mes: [mesIni, hoje], "mes-passado": [mesPassadoFim.slice(0, 8) + "01", mesPassadoFim], tudo: [INICIO, hoje],
  };
  const d1 = valida(de), d2 = valida(ate);
  if ((d1 || d2) && (!preset || preset === "personalizado")) {
    let a = lim(d1 ?? INICIO), b = lim(d2 ?? hoje);
    if (a > b) [a, b] = [b, a];
    return { de: a, ate: b, preset: "personalizado", rotulo: ROTULOS.personalizado! };
  }
  const p = preset && tabela[preset] ? preset : "tudo";
  const [a, b] = tabela[p]!;
  return { de: lim(a), ate: lim(b), preset: p, rotulo: ROTULOS[p]! };
}

/** Monta o relatório para um período a partir dos dados em cache. */
function montar(d: Dados, periodo: Periodo): Relatorio {
  const { hoje, hora, erros } = d;
  const { de, ate } = periodo;
  const noPeriodo = (x: string) => x >= de && x <= ate;
  const meta = d.meta.filter(x => noPeriodo(x.data));
  // Status (ativo/pausado) sempre olha os dados completos, não o filtro.
  const ultimoGastoCamp = new Map<string, string>();
  for (const x of d.meta) if (x.investimento > 0 && x.data > (ultimoGastoCamp.get(x.campanhaId) ?? "")) ultimoGastoCamp.set(x.campanhaId, x.data);
  const ontem = new Date(Date.parse(hoje + "T12:00:00Z") - 864e5).toISOString().slice(0, 10);
  const ativa = (id: string) => (ultimoGastoCamp.get(id) ?? "") >= ontem;

  const vagas = montarVagas(meta.filter(x => x.produto === VAGAS), hoje);
  vagas.campanhas = vagas.campanhas.map(c => ({ ...c, ativa: ativa(c.id) }));
  vagas.ativo = d.meta.some(x => x.produto === VAGAS && ativa(x.campanhaId));
  const metaFeiroes = meta.filter(x => x.produto !== VAGAS);
  const { campanhas: camps, produtos: prods, invDia } = montarMeta(metaFeiroes, hoje);
  const campanhas = camps.map(c => ({ ...c, ativa: ativa(c.id) }));
  const produtos = prods.map(p => ({ ...p, ativo: d.meta.some(x => x.produto === p.id && ativa(x.campanhaId)) }));
  const investimento = r2(produtos.reduce((s, p) => s + p.investimento, 0));
  const leadsMeta = produtos.reduce((s, p) => s + p.leadsMeta, 0);
  const investimentoDia = diasEntre(de, ate).map(data => ({ data, valores: invDia.get(data) ?? {} }));
  const geradoEm = `${hoje.slice(8, 10)}/${hoje.slice(5, 7)}/${hoje.slice(0, 4)} às ${hora}`;

  // CRM pela foto do NotificaLead: vale só até a data da foto. A comparação
  // com o Meta usa só os dias que os dois lados cobrem.
  const fotoIni = FOTO.dias[0]![0], fotoFim = FOTO.ate;
  const cobre = de <= fotoFim && ate >= fotoIni ? { de: de > fotoIni ? de : fotoIni, ate: ate < fotoFim ? ate : fotoFim } : null;
  const completo = de <= INICIO && ate >= fotoFim;
  const diasFoto = cobre ? FOTO.dias.filter(([x]) => x >= cobre.de && x <= cobre.ate) : [];
  const idx: Record<string, number> = { corre: 1, servidor: 2 };
  const metaCobre = cobre ? metaFeiroes.filter(x => x.data >= cobre.de && x.data <= cobre.ate) : [];
  const regras = REGRAS.map(r => {
    const ds = metaCobre.filter(x => r.produtos.includes(x.produto));
    const inv = ds.reduce((s, x) => s + x.investimento, 0), lm = ds.reduce((s, x) => s + x.leads, 0);
    if (!cobre) {
      const todo = metaFeiroes.filter(x => r.produtos.includes(x.produto));
      return { id: r.id, nome: r.nome, investimento: r2(todo.reduce((s, x) => s + x.investimento, 0)), leadsMeta: todo.reduce((s, x) => s + x.leads, 0), leadsCrm: null, diferenca: null, cplCrm: null, inicio: null, fim: null };
    }
    const comLead = diasFoto.filter(row => (row[idx[r.id]!] as number) > 0).map(row => row[0]);
    const lc = diasFoto.reduce((s, row) => s + (row[idx[r.id]!] as number), 0);
    return { id: r.id, nome: r.nome, investimento: r2(inv), leadsMeta: lm, leadsCrm: lc, diferenca: lc - lm, cplCrm: div(inv, lc), inicio: comLead[0] ?? null, fim: comLead.at(-1) ?? null };
  });
  const leadsCrm = cobre ? regras.reduce((s, r) => s + (r.leadsCrm ?? 0), 0) : null;
  const invCobre = regras.reduce((s, r) => s + r.investimento, 0);
  const nomeRegra = (id: string) => REGRAS.find(r => r.id === id)?.nome ?? id;

  return {
    geradoEm, inicio: INICIO, fim: hoje, erros,
    periodo: { ...periodo, completo: de <= INICIO && ate >= hoje },
    crm: { fonte: "foto", extraidoEm: FOTO.extraidoEm, ate: fotoFim, cobre, detalhesNoPeriodo: completo },
    totais: {
      investimento, leadsMeta, leadsCrm,
      leadsUnicos: completo ? FOTO.regras.reduce((s, r) => s + r.unicos, 0) - FOTO.repetidosEntreRegras : null,
      cplCrm: cobre ? div(invCobre, leadsCrm ?? 0) : null, repetidos: FOTO.repetidos, repetidosEntreRegras: FOTO.repetidosEntreRegras,
    },
    regras, produtos, campanhas, investimentoDia,
    leadsDia: diasEntre(de, ate).map(data => {
      const row = FOTO.dias.find(([x]) => x === data);
      return { data, valores: (row ? { corre: row[1], servidor: row[2] } : {}) as Record<string, number> };
    }),
    horas: FOTO.horas.map((leads, h) => ({ hora: h, leads })),
    formularios: FOTO.formularios.map(f => ({ ...f, regra: nomeRegra(f.regra) })),
    qualidade: FOTO.regras.map(r => ({ regra: nomeRegra(r.id), leads: r.leads, unicos: r.unicos, semEmail: r.semEmail, telefoneInvalido: r.telefoneInvalido })),
    situacoes: FOTO.situacoes, semRegra: 0, vagas,
  };
}

// Dados com alguma fonte em erro não entram no cache, para a próxima visita
// já tentar de novo.
class Parcial extends Error { constructor(public dados: Dados) { super("dados parciais"); } }
const emCache = unstable_cache(async () => {
  const d = await coletar();
  if (d.erros.meta) throw new Parcial(d);
  return d;
}, ["relatorio-feiroes-dados-v1"], { revalidate: CACHE_SEGUNDOS });

/** Relatório do período pedido. Os dados ficam 10 minutos em cache. */
export async function obterRelatorio(filtro: { p?: string; de?: string; ate?: string } = {}): Promise<Relatorio> {
  let d: Dados;
  try { d = await emCache(); }
  catch (e) { if (e instanceof Parcial) d = e.dados; else throw e; }
  return montar(d, resolverPeriodo(d.hoje, filtro.p, filtro.de, filtro.ate));
}
