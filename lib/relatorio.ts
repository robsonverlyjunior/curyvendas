import { unstable_cache } from "next/cache";
import { CACHE_SEGUNDOS, INICIO, PRODUTOS, REGRAS } from "./config";
import { lerMeta, type MetaDia } from "./meta";
import { emailValido, formularioDoLead, lerLeadsCV, regraDoLead, telefoneNormalizado, type LeadCV } from "./cv";

/** Tudo o que a página mostra. Só números agregados: nenhum dado pessoal. */
export type Relatorio = {
  geradoEm: string; inicio: string; fim: string;
  erros: { meta?: string; cv?: string };
  totais: { investimento: number; leadsMeta: number; leadsCrm: number; leadsUnicos: number; cplCrm: number | null; repetidos: number; repetidosEntreRegras: number };
  regras: { id: string; nome: string; investimento: number; leadsMeta: number; leadsCrm: number; diferenca: number; cplCrm: number | null; inicio: string | null; fim: string | null }[];
  produtos: { id: string; nome: string; ativo: boolean; inicio: string | null; fim: string | null; investimento: number; leadsMeta: number; cpl: number | null; impressoes: number; cliques: number; ctr: number | null; cpc: number | null; campanhas: string[]; porDia: { data: string; leads: number }[] }[];
  campanhas: { id: string; nome: string; produto: string; ativa: boolean; investimento: number; leadsMeta: number; cpl: number | null; cliques: number }[];
  investimentoDia: { data: string; valores: Record<string, number> }[];
  leadsDia: { data: string; valores: Record<string, number> }[];
  horas: { hora: number; leads: number }[];
  formularios: { regra: string; formulario: string; leads: number; inicio: string; fim: string }[];
  qualidade: { regra: string; leads: number; unicos: number; semEmail: number; telefoneInvalido: number }[];
  situacoes: { situacao: string; leads: number }[];
  semRegra: number;
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

/** "2026-11-09 21:14:03" ou ISO → { data, hora } como o CV gravou (Brasília). */
function partesData(v: unknown): { data: string; hora: number } | null {
  const m = String(v ?? "").match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2})/);
  return m ? { data: m[1]!, hora: Number(m[2]) } : null;
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
    const porDiaMap = new Map<string, number>();
    for (const d of ds) porDiaMap.set(d.data, (porDiaMap.get(d.data) ?? 0) + d.leads);
    const inicio = comGasto[0] ?? null, ultimo = comGasto.at(-1) ?? null;
    return {
      id: p.id, nome: p.nome, ativo: !!ultimo && ultimo >= ultimoDia, inicio, fim: ultimo,
      investimento: r2(inv), leadsMeta: leads, cpl: div(inv, leads), impressoes: imp, cliques: cli,
      ctr: imp > 0 ? r2((cli / imp) * 100) : null, cpc: div(inv, cli),
      campanhas: campanhas.filter(c => c.produto === p.id).map(c => c.nome),
      porDia: inicio && ultimo ? diasEntre(inicio, ultimo).map(data => ({ data, leads: porDiaMap.get(data) ?? 0 })) : [],
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

export async function gerar(): Promise<Relatorio> {
  const { data: hoje, hora } = agoraSP();
  const erros: Relatorio["erros"] = {};
  // Cada fonte tem até 50 s; se uma travar, a outra ainda aparece na página.
  const limite = <T,>(p: Promise<T>, nome: string) => Promise.race([p, new Promise<never>((_, rej) =>
    setTimeout(() => rej(new Error(`${nome} demorou mais de 50 segundos para responder.`)), 50000))]);
  const [metaRes, cvRes] = await Promise.allSettled([limite(lerMeta(INICIO, hoje), "O Ads Editor"), limite(lerLeadsCV(INICIO), "O CV")]);
  const meta = metaRes.status === "fulfilled" ? metaRes.value : (erros.meta = String((metaRes.reason as Error)?.message ?? metaRes.reason), []);
  const todos = cvRes.status === "fulfilled" ? cvRes.value : (erros.cv = String((cvRes.reason as Error)?.message ?? cvRes.reason), []);

  // Leads do CV no período, com regra identificada.
  const doPeriodo = todos.filter(l => { const p = partesData(l.data_cad); return p && p.data >= INICIO && p.data <= hoje; });
  const leads = doPeriodo.map(l => ({ l, regra: regraDoLead(l), quando: partesData(l.data_cad)! })).filter(x => x.regra);
  const semRegra = doPeriodo.length - leads.length;

  const { campanhas, produtos, invDia } = montarMeta(meta, hoje);

  // Telefones repetidos (dentro e entre regras).
  const regrasPorTel = new Map<string, Set<string>>();
  const contagemTel = new Map<string, number>();
  for (const { l, regra } of leads) {
    const t = telefoneNormalizado(l.telefone); if (!t) continue;
    contagemTel.set(t, (contagemTel.get(t) ?? 0) + 1);
    (regrasPorTel.get(t) ?? regrasPorTel.set(t, new Set()).get(t)!).add(regra!);
  }
  const repetidos = [...contagemTel.values()].filter(n => n > 1).length;
  const repetidosEntreRegras = [...regrasPorTel.values()].filter(s => s.size > 1).length;
  const unicosDe = (ls: LeadCV[]) => {
    const tels = new Set<string>(); let semTel = 0;
    for (const l of ls) { const t = telefoneNormalizado(l.telefone); if (t) tels.add(t); else semTel++; }
    return tels.size + semTel;
  };

  const regras = REGRAS.map(r => {
    const ls = leads.filter(x => x.regra === r.id);
    const ps = produtos.filter(p => r.produtos.includes(p.id));
    const inv = ps.reduce((s, p) => s + p.investimento, 0);
    const lm = ps.reduce((s, p) => s + p.leadsMeta, 0);
    const datas = ls.map(x => x.quando.data).sort();
    return { id: r.id, nome: r.nome, investimento: r2(inv), leadsMeta: lm, leadsCrm: ls.length, diferenca: ls.length - lm, cplCrm: div(inv, ls.length), inicio: datas[0] ?? null, fim: datas.at(-1) ?? null };
  });

  const investimento = r2(produtos.reduce((s, p) => s + p.investimento, 0));
  const leadsMeta = produtos.reduce((s, p) => s + p.leadsMeta, 0);

  const diasMeta = [...invDia.keys()].sort();
  const investimentoDia = diasMeta.length ? diasEntre(diasMeta[0]!, diasMeta.at(-1)!).map(data => ({ data, valores: invDia.get(data) ?? {} })) : [];

  const leadsDiaMap = new Map<string, Record<string, number>>();
  for (const { regra, quando } of leads) { const v = leadsDiaMap.get(quando.data) ?? {}; v[regra!] = (v[regra!] ?? 0) + 1; leadsDiaMap.set(quando.data, v); }
  const diasCrm = [...leadsDiaMap.keys()].sort();
  const leadsDia = diasCrm.length ? diasEntre(diasCrm[0]!, diasCrm.at(-1)!).map(data => ({ data, valores: leadsDiaMap.get(data) ?? {} })) : [];

  const horas = Array.from({ length: 24 }, (_, hora) => ({ hora, leads: leads.filter(x => x.quando.hora === hora).length }));

  const formMap = new Map<string, Relatorio["formularios"][number]>();
  for (const { l, regra, quando } of leads) {
    const nomeRegra = REGRAS.find(r => r.id === regra)!.nome;
    const formulario = formularioDoLead(l);
    const k = `${nomeRegra}|${formulario}`;
    const f = formMap.get(k) ?? { regra: nomeRegra, formulario, leads: 0, inicio: quando.data, fim: quando.data };
    f.leads++; if (quando.data < f.inicio) f.inicio = quando.data; if (quando.data > f.fim) f.fim = quando.data;
    formMap.set(k, f);
  }

  const qualidade = REGRAS.map(r => {
    const ls = leads.filter(x => x.regra === r.id).map(x => x.l);
    return { regra: r.nome, leads: ls.length, unicos: unicosDe(ls), semEmail: ls.filter(l => !emailValido(l.email)).length, telefoneInvalido: ls.filter(l => !telefoneNormalizado(l.telefone)).length };
  });

  const sitMap = new Map<string, number>();
  for (const { l } of leads) { const s = String(l.situacao || "Sem situação"); sitMap.set(s, (sitMap.get(s) ?? 0) + 1); }

  return {
    geradoEm: `${hoje.slice(8, 10)}/${hoje.slice(5, 7)}/${hoje.slice(0, 4)} às ${hora}`,
    inicio: INICIO, fim: hoje, erros,
    totais: { investimento, leadsMeta, leadsCrm: leads.length, leadsUnicos: unicosDe(leads.map(x => x.l)), cplCrm: div(investimento, leads.length), repetidos, repetidosEntreRegras },
    regras, produtos, campanhas, investimentoDia, leadsDia, horas,
    formularios: [...formMap.values()].sort((a, b) => b.leads - a.leads),
    qualidade,
    situacoes: [...sitMap.entries()].map(([situacao, n]) => ({ situacao, leads: n })).sort((a, b) => b.leads - a.leads),
    semRegra,
  };
}

/** Relatório com cache de 10 minutos compartilhado entre todos os visitantes. */
// Relatório com alguma fonte em erro não entra no cache (erros não são
// guardados), para a próxima visita já tentar de novo.
class Parcial extends Error { constructor(public relatorio: Relatorio) { super("relatório parcial"); } }
const emCache = unstable_cache(async () => {
  const r = await gerar();
  if (r.erros.meta || r.erros.cv) throw new Parcial(r);
  return r;
}, ["relatorio-feiroes-v1"], { revalidate: CACHE_SEGUNDOS });

export async function obterRelatorio(): Promise<Relatorio> {
  try { return await emCache(); }
  catch (e) { if (e instanceof Parcial) return e.relatorio; throw e; }
}
