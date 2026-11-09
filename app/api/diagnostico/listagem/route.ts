export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Investiga a listagem de leads da API do CV (/api/v1/comercial/leads):
 * campos que cada lead traz, valores dos campos de origem/usuário e quais
 * filtros a API aceita (compara o total com e sem cada parâmetro).
 * Protegido por DIAG_CHAVE. Não devolve dados pessoais.
 */

const PESSOAIS = /nome$|^nome|email|telefone|celular|fone|cpf|cnpj|documento|rg$|endereco|logradouro|cep|bairro|nascimento|renda|link|url|senha|token|whats/i;

function credenciais() {
  const url = process.env.CV_URL?.trim().replace(/\/+$/, "");
  const email = process.env.CV_EMAIL?.trim();
  const token = process.env.CV_TOKEN?.trim();
  if (!url || !email || !token) throw new Error("Faltam CV_URL, CV_EMAIL ou CV_TOKEN.");
  return { url, email, token };
}

const espera = (ms: number) => new Promise(r => setTimeout(r, ms));

async function listar(params: Record<string, string>) {
  const { url, email, token } = credenciais();
  const qs = new URLSearchParams(params);
  for (let t = 0; ; t++) {
    const res = await fetch(`${url}/api/v1/comercial/leads?${qs}`, {
      headers: { email, token, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(30000),
    });
    if (res.status === 429 && t < 4) { await espera(3000 * (t + 1)); continue; }
    const texto = await res.text();
    let corpo: unknown = null;
    try { corpo = JSON.parse(texto); } catch { /* não é JSON */ }
    return { status: res.status, corpo, texto: corpo ? undefined : texto.slice(0, 200) };
  }
}

type Lista = { total?: unknown; leads?: Record<string, unknown>[] } & Record<string, unknown>;

/** Descreve um valor sem expor conteúdo pessoal. */
function forma(v: unknown, chave: string): unknown {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.length ? [forma(v[0], chave)] : [];
  if (typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, forma(x, k)]));
  if (PESSOAIS.test(chave)) return `(${typeof v}, oculto)`;
  const s = String(v);
  return s.length > 60 ? `${s.slice(0, 60)}…` : s;
}

/** Valores mais comuns de um campo (só os que se repetem). */
function contar(leads: Record<string, unknown>[], chave: string) {
  const m = new Map<string, number>();
  for (const l of leads) {
    const v = l[chave];
    const vals = Array.isArray(v) ? v : [v];
    for (const x of vals) {
      const s = x && typeof x === "object"
        ? String((x as Record<string, unknown>).nome ?? (x as Record<string, unknown>).titulo ?? JSON.stringify(x)).slice(0, 80)
        : String(x ?? "(vazio)");
      m.set(s, (m.get(s) ?? 0) + 1);
    }
  }
  return [...m.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 25);
}

export async function GET(req: Request) {
  const chave = process.env.DIAG_CHAVE?.trim();
  const busca = new URL(req.url).searchParams;
  if (!chave || chave.length < 8 || busca.get("chave") !== chave)
    return Response.json({ erro: "Não autorizado." }, { status: 401 });

  try {
    // 1) Sem filtro: estrutura e total.
    const base = await listar({ offset: "0" });
    const corpoBase = base.corpo as Lista | null;
    const totalBase = corpoBase?.total ?? null;
    const amostra: Record<string, unknown>[] = [...(corpoBase?.leads ?? [])];
    for (const off of [30, 60, 90]) {
      const p = await listar({ offset: String(off) });
      amostra.push(...(((p.corpo as Lista | null)?.leads) ?? []));
    }
    const chaves = amostra[0] ? Object.keys(amostra[0]) : [];
    const interessantes = chaves.filter(k => !PESSOAIS.test(k) && /origem|midia|usuario|cadastr|criad|conversao|regra|fila|canal|tag|situacao|gestor|corretor|empreend|integra|fonte|campanha|form/i.test(k));

    // 2) Filtros candidatos: se o total mudar, a API aceita o filtro.
    const extra = busca.get("testar"); // ex.: testar=idusuario_cadastro=123,origem=FB
    const candidatos: [string, string][] = [
      ["data_cad_inicio", "2026-11-01"], ["data_inicio", "2026-11-01"], ["data_cadastro_inicio", "2026-11-01"],
      ["dt_inicio", "2026-11-01"], ["a_partir_data", "2026-11-01"], ["data_cad", "2026-11-01"],
      ["idusuario", "1"], ["idusuario_cadastro", "1"], ["usuario", "1"], ["idgestor", "1"], ["idcorretor", "1"],
      ["origem", "FB"], ["midia", "Facebook"], ["idsituacao", "1"], ["situacao", "1"], ["limit", "5"], ["limite", "5"],
      ...(extra ? extra.split(",").map(p => p.split("=") as [string, string]).filter(p => p.length === 2) : []),
    ];
    const filtros: Record<string, unknown> = {};
    for (const [k, v] of candidatos) {
      const r = await listar({ offset: "0", [k]: v });
      const c = r.corpo as Lista | null;
      filtros[`${k}=${v}`] = { status: r.status, total: c?.total ?? null, veio: c?.leads?.length ?? null, mudou: c?.total != null && String(c.total) !== String(totalBase) };
      await espera(400);
    }

    return Response.json({
      status: base.status, total: totalBase, chavesDaResposta: corpoBase ? Object.keys(corpoBase) : base.texto,
      leadsNaAmostra: amostra.length, camposDoLead: chaves,
      exemploDeLead: amostra[0] ? forma(amostra[0], "") : null,
      valores: Object.fromEntries(interessantes.map(k => [k, contar(amostra, k)])),
      filtros,
    });
  } catch (e) {
    return Response.json({ erro: (e as Error).message }, { status: 502 });
  }
}
