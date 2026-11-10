import { detalheLeadNL, nlGet, type LeadNL } from "@/lib/notifica";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Investiga a API do NotificaLead: quem é o usuário do login, regras de
 * distribuição, quantos leads ele enxerga e que campos vêm na lista e no
 * detalhe. Protegido por DIAG_CHAVE. Não devolve nome, e-mail ou telefone.
 */
const PESSOAIS = /^name$|nome|email|phone|telefone|celular|cpf|documento|endereco|address|first_name|last_name|full_name|description|notes|note|message/i;

function forma(v: unknown, chave = ""): unknown {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.length ? [forma(v[0], chave)] : [];
  if (typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, forma(x, k)]));
  if (PESSOAIS.test(chave)) return `(${typeof v}, oculto)`;
  const s = String(v);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}

function contar(leads: LeadNL[], campo: string) {
  const m = new Map<string, number>();
  for (const l of leads) { const s = typeof l[campo] === "object" ? JSON.stringify(l[campo]) : String(l[campo] ?? "(vazio)"); m.set(s, (m.get(s) ?? 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
}

export async function GET(req: Request) {
  const chave = process.env.DIAG_CHAVE?.trim();
  if (!chave || new URL(req.url).searchParams.get("chave") !== chave)
    return Response.json({ erro: "Não autorizado." }, { status: 401 });

  const out: Record<string, unknown> = {};
  const qs = new URL(req.url).searchParams;

  // Modo "lead": detalhe de um lead com regra e histórico completos
  // (telefones e e-mails mascarados), para achar onde fica o código do CRM.
  const leadId = qs.get("lead");
  if (leadId && /^\d+$/.test(leadId)) {
    const mascarar = (v: unknown): unknown => {
      if (typeof v === "string") return v.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "(e-mail)").replace(/\+?\d[\d\s()-]{8,}\d/g, m => (m.replace(/\D/g, "").length <= 7 ? m : "(telefone)"));
      if (Array.isArray(v)) return v.map(mascarar);
      if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, /^(name|email|phone)$/.test(k) && k !== "name" ? "(oculto)" : mascarar(x)]));
      return v;
    };
    try {
      const d = await nlGet<{ data?: Record<string, unknown> }>(`/api/v1/agent/leads/${leadId}`);
      const l = { ...(d.data ?? {}) };
      delete l.name; delete l.email; delete l.phone;
      if (l.settings && typeof l.settings === "object") { const s = { ...(l.settings as Record<string, unknown>) }; delete s.name; delete s.email; delete s.phone; l.settings = s; }
      return Response.json(mascarar(l));
    } catch (e) { return Response.json({ erro: (e as Error).message }, { status: 502 }); }
  }

  // Modo "regras": conta leads por regra nas primeiras N páginas e testa
  // parâmetros de filtro da lista (filtro=nome=valor).
  if (qs.get("regras")) {
    const paginas = Math.min(Number(qs.get("paginas") ?? 6), 20);
    const extra = Object.fromEntries((qs.get("filtro") ?? "").split(",").map(p => p.split("=")).filter(p => p.length === 2));
    const m = new Map<string, number>();
    let total = 0, antigo = "";
    for (let page = 1; page <= paginas; page++) {
      const r = await nlGet<{ data?: { leads?: LeadNL[]; pagination?: { total?: number } } }>("/api/v1/agent/leads", { page: String(page), per_page: "100", ...extra });
      const ls = r.data?.leads ?? [];
      total = Number(r.data?.pagination?.total ?? 0);
      for (const l of ls) { const dr = l.distribution_rule as { id?: string; name?: string } | undefined; const k = `${dr?.id ?? "—"} · ${dr?.name ?? "sem regra"}`; m.set(k, (m.get(k) ?? 0) + 1); antigo = String(l.created_at ?? antigo); }
      if (ls.length < 100) break;
    }
    return Response.json({ filtro: extra, total, ateData: antigo, porRegra: [...m.entries()].sort((a, b) => b[1] - a[1]) });
  }

  // Modo sondagem: testa rotas GET não documentadas (só status e chaves).
  const sondar = new URL(req.url).searchParams.get("sondar");
  if (sondar) {
    const { nlGetBruto } = await import("@/lib/notifica");
    for (const caminho of sondar.split(",").slice(0, 12)) {
      try {
        const r = await nlGetBruto(caminho);
        const corpo = r.json as Record<string, unknown> | null;
        const data = (corpo?.data ?? corpo) as Record<string, unknown> | unknown[] | null;
        out[caminho] = {
          status: r.status, tipo: r.tipo,
          chaves: data && typeof data === "object" ? (Array.isArray(data) ? [`array(${data.length})`] : Object.keys(data)) : null,
          paginacao: data && !Array.isArray(data) ? forma((data as Record<string, unknown>).pagination ?? (data as Record<string, unknown>).meta ?? null) : null,
          contagens: data && !Array.isArray(data) ? Object.fromEntries(Object.entries(data).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as unknown[]).length])) : null,
          exemplo: data && !Array.isArray(data) ? forma(Object.values(data).find(v => Array.isArray(v) && v.length) ? (Object.values(data).find(v => Array.isArray(v) && v.length) as unknown[])[0] : null) : Array.isArray(data) ? forma(data[0]) : null,
        };
      } catch (e) { out[caminho] = { erro: (e as Error).message }; }
    }
    return Response.json(out);
  }
  const tentar = async (nome: string, fn: () => Promise<unknown>) => {
    try { out[nome] = await fn(); } catch (e) { out[nome] = { erro: (e as Error).message }; }
  };

  await tentar("perfil", async () => {
    const p = await nlGet<{ data?: { user?: Record<string, unknown>; account?: unknown; permissions?: unknown } }>("/api/v1/auth/profile");
    return { papel: p.data?.user?.role, ativo: p.data?.user?.active, conta: forma(p.data?.account), permissoes: forma(p.data?.permissions) };
  });
  await tentar("regras", async () => {
    const r = await nlGet<{ data?: { distribution_rules?: Record<string, unknown>[] } }>("/api/v1/agent/distribution_rules");
    return (r.data?.distribution_rules ?? []).map(x => ({ id: x.id, nome: x.name, modo: x.allocation_mode, ativa: x.active, agentes: Array.isArray(x.rotation_queue) ? x.rotation_queue.length : null }));
  });
  await tentar("painel", async () => forma((await nlGet<{ data?: { stats?: unknown } }>("/api/v1/agent/dashboard")).data?.stats));

  let amostra: LeadNL[] = [];
  await tentar("lista", async () => {
    const r = await nlGet<{ data?: { leads?: LeadNL[]; pagination?: unknown } }>("/api/v1/agent/leads", { page: "1", per_page: "100" });
    amostra = r.data?.leads ?? [];
    return {
      paginacao: r.data?.pagination, veio: amostra.length,
      campos: amostra[0] ? Object.keys(amostra[0]) : [],
      exemplo: amostra[0] ? forma(amostra[0]) : null,
      delivery_status: contar(amostra, "delivery_status"), funnel_stage: contar(amostra, "funnel_stage"),
      datas: amostra.length ? { mais_novo: amostra[0]?.created_at, mais_antigo: amostra.at(-1)?.created_at } : null,
    };
  });
  await tentar("detalhes", async () => {
    const ds = await Promise.all(amostra.slice(0, 3).map(l => detalheLeadNL(l.id)));
    return ds.map(d => forma(d));
  });
  return Response.json(out);
}
