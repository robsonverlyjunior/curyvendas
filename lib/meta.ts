import { ADS_EDITOR_URL, CAMPANHAS_EXCLUIDAS, CAMPANHAS_VAGAS, VAGAS, META_ACCOUNT_ID, META_LEAD_ACTION, PRODUTOS } from "./config";

/**
 * Leitura do Meta Ads pelo Ads Editor (MCP sobre HTTP). Só chama ferramentas
 * de leitura; nada é criado ou alterado na conta.
 */

const PROTOCOL_VERSION = "2025-06-18";

type RpcResponse = { id?: number; result?: unknown; error?: { message: string } };

function parseSse(text: string, id: number): RpcResponse | undefined {
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block.split(/\r?\n/).filter(l => l.startsWith("data:")).map(l => l.slice(5).trimStart()).join("\n");
    if (!data) continue;
    try {
      const msg = JSON.parse(data) as RpcResponse;
      if (msg?.id === id) return msg;
    } catch { /* keep-alive */ }
  }
  return undefined;
}

class McpClient {
  private session: string | null = null;
  private nextId = 1;
  private ready = false;
  constructor(private url: string, private token: string) {}

  private async post(body: Record<string, unknown>, expect: boolean): Promise<RpcResponse | undefined> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": PROTOCOL_VERSION,
    };
    if (this.session) headers["Mcp-Session-Id"] = this.session;
    const res = await fetch(this.url, {
      method: "POST", headers, body: JSON.stringify(body),
      signal: AbortSignal.timeout(45000), cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) throw new Error("O Ads Editor recusou o token (ADS_EDITOR_TOKEN).");
    if (!res.ok && res.status !== 202) throw new Error(`O Ads Editor respondeu HTTP ${res.status}.`);
    const s = res.headers.get("mcp-session-id");
    if (s) this.session = s;
    if (!expect) { await res.body?.cancel(); return undefined; }
    const text = await res.text();
    const id = body.id as number;
    let msg: RpcResponse | undefined;
    if ((res.headers.get("content-type") ?? "").includes("text/event-stream")) msg = parseSse(text, id);
    else { try { msg = JSON.parse(text); } catch { msg = undefined; } }
    if (!msg) throw new Error("O Ads Editor não devolveu uma resposta válida.");
    if (msg.error) throw new Error(`Ads Editor: ${msg.error.message}`);
    return msg;
  }

  private async request(method: string, params: Record<string, unknown>) {
    return (await this.post({ jsonrpc: "2.0", id: this.nextId++, method, params }, true))!.result;
  }

  async call(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.ready) {
      await this.request("initialize", { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "curyvendas-relatorio", version: "1.0.0" } });
      await this.post({ jsonrpc: "2.0", method: "notifications/initialized" }, false);
      this.ready = true;
    }
    const result = await this.request("tools/call", { name, arguments: args }) as {
      isError?: boolean; structuredContent?: unknown; content?: { type: string; text?: string }[];
    };
    const text = result?.content?.filter(c => c.type === "text").map(c => c.text ?? "").join("") ?? "";
    if (result?.isError) throw new Error(`Ads Editor (${name}): ${text}`.slice(0, 300));
    if (result?.structuredContent !== undefined) return result.structuredContent;
    return JSON.parse(text);
  }

  async close() {
    if (!this.session) return;
    try {
      await fetch(this.url, { method: "DELETE", headers: { Authorization: `Bearer ${this.token}`, "Mcp-Session-Id": this.session }, signal: AbortSignal.timeout(5000) });
    } catch { /* melhor esforço */ }
  }
}

export type MetaDia = {
  data: string; campanhaId: string; campanha: string; produto: string;
  investimento: number; impressoes: number; cliques: number; leads: number;
};

type Row = {
  campaign_id?: string; campaign_name?: string; spend?: string; impressions?: string; clicks?: string;
  actions?: { action_type?: string; value?: string }[]; date_start?: string;
};

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export function produtoDaCampanha(nome: string): string | null {
  if (CAMPANHAS_EXCLUIDAS.test(nome)) return null;
  if (CAMPANHAS_VAGAS.test(nome)) return VAGAS;
  return PRODUTOS.find(p => p.campanha.test(nome))?.id ?? null;
}

/** Janelas de até 30 dias, para não estourar o limite de linhas por chamada. */
function janelas(inicio: string, fim: string) {
  const out: [string, string][] = [];
  let a = new Date(inicio + "T12:00:00Z");
  const z = new Date(fim + "T12:00:00Z");
  while (a <= z) {
    const b = new Date(Math.min(a.getTime() + 29 * 864e5, z.getTime()));
    out.push([a.toISOString().slice(0, 10), b.toISOString().slice(0, 10)]);
    a = new Date(b.getTime() + 864e5);
  }
  return out;
}

/** Investimento, impressões, cliques e leads por dia e campanha dos feirões. */
export async function lerMeta(inicio: string, fim: string): Promise<MetaDia[]> {
  const token = process.env.ADS_EDITOR_TOKEN?.trim();
  if (!token) throw new Error("Falta a variável ADS_EDITOR_TOKEN (gere em app.adseditor.com.br/mcp).");
  const mcp = new McpClient(ADS_EDITOR_URL, token);
  try {
    const dias: MetaDia[] = [];
    for (const [since, until] of janelas(inicio, fim)) {
      const payload = await mcp.call("get_insights_breakdown", {
        account_id: META_ACCOUNT_ID, date_since: since, date_until: until,
        time_increment: "1", level: "campaign", limit: 2000,
      }) as { status?: string; data?: { rows?: Row[]; has_more?: boolean } };
      const rows = payload?.data?.rows;
      if (!Array.isArray(rows)) throw new Error("O Ads Editor devolveu os insights em formato inesperado.");
      if (payload.data?.has_more) throw new Error("O Ads Editor cortou a lista de campanhas (has_more). Reduza o período.");
      for (const r of rows) {
        const campanha = String(r.campaign_name ?? "").trim();
        const produto = produtoDaCampanha(campanha);
        if (!produto || !r.date_start) continue;
        const lead = (r.actions ?? []).find(a => a.action_type === META_LEAD_ACTION);
        dias.push({
          data: r.date_start, campanhaId: String(r.campaign_id ?? ""), campanha, produto,
          investimento: num(r.spend), impressoes: num(r.impressions), cliques: num(r.clicks), leads: num(lead?.value),
        });
      }
    }
    return dias;
  } finally {
    await mcp.close();
  }
}
