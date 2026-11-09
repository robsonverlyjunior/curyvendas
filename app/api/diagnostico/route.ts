import { INICIO, REGRAS } from "@/lib/config";
import { lerLeadsCV, regraDoLead } from "@/lib/cv";

export const dynamic = "force-dynamic";

/**
 * Mostra quais valores aparecem nos campos de origem dos leads do CV, para
 * ajustar as regras em lib/config.ts. Protegido por DIAG_CHAVE. Não devolve
 * nome, e-mail, telefone nem documento; só valores que se repetem (≥ 3 leads).
 */
const CAMPOS = ["conversao", "conversao_original", "conversao_ultimo", "midia_original", "midia_ultimo", "origem", "origem_nome", "origem_ultimo_nome", "tags", "situacao", "empreendimento", "ponto_venda"];

export async function GET(req: Request) {
  const chave = process.env.DIAG_CHAVE?.trim();
  if (!chave || chave.length < 16 || new URL(req.url).searchParams.get("chave") !== chave)
    return Response.json({ erro: "Não autorizado." }, { status: 401 });

  try {
    const leads = await lerLeadsCV(INICIO);
    const contar = (valores: unknown[]) => {
      const m = new Map<string, number>();
      for (const v of valores) { const s = String(v ?? "").trim() || "(vazio)"; m.set(s, (m.get(s) ?? 0) + 1); }
      return [...m.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([valor, leads]) => ({ valor, leads }));
    };
    const campos = Object.fromEntries(CAMPOS.map(c => [c, contar(leads.map(l => l[c]))]));
    const adicionais = new Map<string, unknown[]>();
    for (const l of leads) for (const c of Array.isArray(l.campos_adicionais) ? l.campos_adicionais : [])
      (adicionais.get(String(c?.nome)) ?? adicionais.set(String(c?.nome), []).get(String(c?.nome))!).push(c?.valor);
    const porRegra = Object.fromEntries([...REGRAS.map(r => r.id), "sem_regra"].map(id => [id, 0]));
    for (const l of leads) porRegra[regraDoLead(l) ?? "sem_regra"]++;
    return Response.json({
      inicio: INICIO, leadsLidos: leads.length, porRegra, campos,
      camposAdicionais: Object.fromEntries([...adicionais.entries()].map(([nome, vs]) => [nome, contar(vs)])),
    });
  } catch (e) {
    return Response.json({ erro: (e as Error).message }, { status: 502 });
  }
}
