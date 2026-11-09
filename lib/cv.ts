import { REGRAS } from "./config";

/**
 * Leitura dos leads no CV CRM pela API CVDW (/api/v1/cvdw/leads).
 * Autenticação por e-mail + token do usuário de integração, nos cabeçalhos.
 * Dados pessoais (nome, e-mail, telefone) só são usados aqui no servidor,
 * para contar únicos e qualidade; nunca saem para a página.
 */

export type LeadCV = Record<string, unknown> & {
  idlead?: number; data_cad?: string; nome?: string; email?: string; telefone?: string;
  situacao?: string; empreendimento?: string; conversao?: string; conversao_original?: string;
  midia_original?: string; origem_nome?: string; tags?: string;
  campos_adicionais?: { nome?: string; valor?: string }[];
};

type Pagina = { pagina?: number; total_de_paginas?: number; dados?: LeadCV[] };

function credenciais() {
  const url = process.env.CV_URL?.trim().replace(/\/+$/, "");
  const email = process.env.CV_EMAIL?.trim();
  const token = process.env.CV_TOKEN?.trim();
  if (!url || !email || !token) throw new Error("Faltam as variáveis do CV (CV_URL, CV_EMAIL e CV_TOKEN).");
  if (!/^https:\/\/[a-z0-9-]+\.cvcrm\.com\.br$/i.test(url)) throw new Error("CV_URL precisa ser no formato https://cury.cvcrm.com.br");
  return { url, email, token };
}

/** Todos os leads com referência a partir de `inicio` (YYYY-MM-DD). */
export async function lerLeadsCV(inicio: string): Promise<LeadCV[]> {
  const { url, email, token } = credenciais();
  const espera = (ms: number) => new Promise(r => setTimeout(r, ms));
  let total = 1;
  const buscar = async (pagina: number): Promise<Pagina> => {
    const qs = new URLSearchParams({
      pagina: String(pagina), registros_por_pagina: "500", a_partir_data_referencia: inicio,
    });
    // O CV limita requisições por minuto: no 429 espera e tenta de novo.
    for (let tentativa = 0; ; tentativa++) {
      const res = await fetch(`${url}/api/v1/cvdw/leads?${qs}`, {
        headers: { email, token, Accept: "application/json" },
        signal: AbortSignal.timeout(40000), cache: "no-store",
      });
      if (res.status === 429 && tentativa < 5) {
        const s = Number(res.headers.get("retry-after"));
        await espera(Number.isFinite(s) && s > 0 ? Math.min(s, 20) * 1000 : 2000 * 2 ** tentativa);
        continue;
      }
      if (res.status === 204) return { dados: [] };
      if (res.status === 401) throw new Error("O CV recusou o e-mail/token (CV_EMAIL e CV_TOKEN).");
      if (res.status === 429) throw new Error(`O CV limitou as consultas (página ${pagina} de ${total}). A próxima visita tenta de novo.`);
      if (!res.ok) throw new Error(`O CV respondeu HTTP ${res.status} na página ${pagina} de ${total}.`);
      return await res.json() as Pagina;
    }
  };
  // Primeira página diz quantas existem; as demais vêm 2 por vez.
  const primeira = await buscar(1);
  total = Math.min(primeira.total_de_paginas ?? 1, 200);
  const leads: LeadCV[] = [...(primeira.dados ?? [])];
  const restantes = Array.from({ length: Math.max(0, total - 1) }, (_, i) => i + 2);
  for (let i = 0; i < restantes.length; i += 2) {
    const lote = await Promise.all(restantes.slice(i, i + 2).map(buscar));
    for (const p of lote) leads.push(...(p.dados ?? []));
  }
  // A API devolve uma linha por versão do lead; fica a mais recente de cada um.
  const porId = new Map<string, LeadCV>();
  for (const l of leads) porId.set(String(l.idlead ?? porId.size), l);
  return [...porId.values()];
}

export const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Textos do lead onde aparecem formulário, campanha ou regra. */
export function textosDoLead(l: LeadCV): string[] {
  const campos = [l.conversao, l.conversao_original, l.midia_original, l.origem_nome, l.tags,
    l.conversao_ultimo, l.midia_ultimo, l.origem_ultimo_nome, l.origem];
  const adicionais = Array.isArray(l.campos_adicionais) ? l.campos_adicionais.map(c => c?.valor) : [];
  return [...campos, ...adicionais].filter((v): v is string => typeof v === "string" && v.trim() !== "").map(normalizar);
}

export function regraDoLead(l: LeadCV): string | null {
  const textos = textosDoLead(l).join(" | ");
  for (const r of REGRAS) if (r.textos.some(t => textos.includes(normalizar(t)))) return r.id;
  return null;
}

/** Formulário de origem, quando o CV guarda o nome dele na conversão. */
export function formularioDoLead(l: LeadCV): string {
  return String(l.conversao_original || l.conversao || l.midia_original || "Não informado").trim();
}

export function telefoneNormalizado(tel: unknown): string | null {
  let d = String(tel ?? "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  return d.length === 10 || d.length === 11 ? d : null;
}

export function emailValido(email: unknown): boolean {
  const e = String(email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return false;
  return !/(sememail|naoinformado|nao_informado|semnome|@cvcrm|@teste|example\.)/.test(e);
}
