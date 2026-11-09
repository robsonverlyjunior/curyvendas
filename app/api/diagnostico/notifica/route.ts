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
