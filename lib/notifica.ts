/**
 * Cliente da API do NotificaLead (https://<conta>.notificalead.com.br).
 * Login com e-mail e senha de um usuário do portal; o token vale 1 hora.
 * Só leitura: não altera leads, etapas nem distribuição.
 */

type Tokens = { access_token: string; refresh_token?: string; expires_in?: number };

export type LeadNL = {
  id: number; name?: string; email?: string; phone?: string;
  delivery_status?: string; funnel_stage?: string; created_at?: string;
  origin?: unknown; source?: unknown; notes?: unknown;
  [k: string]: unknown;
};

function config() {
  const url = process.env.NL_URL?.trim().replace(/\/+$/, "");
  const email = process.env.NL_EMAIL?.trim();
  const senha = process.env.NL_SENHA;
  if (!url || !email || !senha) throw new Error("Faltam as variáveis do NotificaLead (NL_URL, NL_EMAIL e NL_SENHA).");
  if (!/^https:\/\/[a-z0-9-]+\.notificalead\.com\.br$/i.test(url)) throw new Error("NL_URL precisa ser no formato https://curyrj.notificalead.com.br");
  return { url, email, senha, subdominio: new URL(url).hostname.split(".")[0]! };
}

let sessao: { token: string; expira: number } | null = null;

async function login(): Promise<string> {
  if (sessao && Date.now() < sessao.expira) return sessao.token;
  const { url, email, senha, subdominio } = config();
  const res = await fetch(`${url}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "X-Account-Subdomain": subdominio },
    body: JSON.stringify({ user: { email, password: senha } }),
    cache: "no-store", signal: AbortSignal.timeout(20000),
  });
  if (res.status === 401) throw new Error("O NotificaLead recusou o e-mail/senha (NL_EMAIL e NL_SENHA).");
  if (!res.ok) throw new Error(`O NotificaLead respondeu HTTP ${res.status} no login.`);
  const body = await res.json() as { data?: { tokens?: Tokens } };
  const t = body.data?.tokens;
  if (!t?.access_token) throw new Error("O NotificaLead não devolveu token no login.");
  sessao = { token: t.access_token, expira: Date.now() + Math.max(60, (t.expires_in ?? 3600) - 120) * 1000 };
  return sessao.token;
}

export async function nlGet<T = unknown>(caminho: string, params: Record<string, string> = {}): Promise<T> {
  const { url } = config();
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const token = await login();
    const qs = new URLSearchParams(params);
    const res = await fetch(`${url}${caminho}${qs.size ? `?${qs}` : ""}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store", signal: AbortSignal.timeout(30000),
    });
    if (res.status === 401) { sessao = null; continue; }
    if (res.status === 429) { await new Promise(r => setTimeout(r, 2000 * (tentativa + 1))); continue; }
    if (!res.ok) throw new Error(`O NotificaLead respondeu HTTP ${res.status} em ${caminho}.`);
    return await res.json() as T;
  }
  throw new Error(`O NotificaLead não respondeu a ${caminho} depois de 3 tentativas.`);
}

/** GET sem tratar erro de status (para investigar rotas). Só caminhos /api/. */
export async function nlGetBruto(caminho: string): Promise<{ status: number; tipo: string; json: unknown }> {
  if (!/^\/api\/[a-z0-9_\/?=&.-]+$/i.test(caminho)) throw new Error("Caminho inválido.");
  const { url } = config();
  // A busca por código CRM (/leads/lookup) usa o token de integração da conta.
  const contaToken = process.env.NL_TOKEN?.trim();
  const headers: Record<string, string> = caminho.startsWith("/api/v1/leads/lookup")
    ? { "X-Notificalead-Token": contaToken ?? "", Accept: "application/json" }
    : { Authorization: `Bearer ${await login()}`, Accept: "application/json" };
  if (caminho.startsWith("/api/v1/leads/lookup") && !contaToken) throw new Error("Falta a variável NL_TOKEN (token de integração da conta).");
  const res = await fetch(`${url}${caminho}`, {
    headers,
    cache: "no-store", signal: AbortSignal.timeout(20000), redirect: "manual",
  });
  const tipo = res.headers.get("content-type") ?? "";
  let json: unknown = null;
  if (tipo.includes("json")) { try { json = await res.json(); } catch { json = null; } } else await res.body?.cancel();
  return { status: res.status, tipo: tipo.split(";")[0]!, json };
}

type PaginaLeads = { data?: { leads?: LeadNL[]; pagination?: { page?: number; per_page?: number; total?: number } } };

/** Todos os leads que o usuário do login enxerga. */
export async function listarLeadsNL(porPagina = 100): Promise<{ leads: LeadNL[]; total: number }> {
  const leads: LeadNL[] = [];
  let total = 0;
  for (let page = 1; page <= 200; page++) {
    const body = await nlGet<PaginaLeads>("/api/v1/agent/leads", { page: String(page), per_page: String(porPagina) });
    const lote = body.data?.leads ?? [];
    total = body.data?.pagination?.total ?? total;
    leads.push(...lote);
    if (!lote.length || leads.length >= total) break;
  }
  return { leads, total };
}

export async function detalheLeadNL(id: number): Promise<LeadNL | null> {
  const body = await nlGet<{ data?: LeadNL } & LeadNL>(`/api/v1/agent/leads/${id}`);
  return (body.data ?? body) as LeadNL;
}
