/**
 * Configuração do relatório. É o único arquivo que precisa mudar quando entra
 * um feirão novo, muda o período ou muda o nome de um formulário.
 */

/** Início do período do relatório (YYYY-MM-DD, horário de Brasília). */
export const INICIO = process.env.RELATORIO_INICIO?.trim() || "2026-09-21";

/** Conta de anúncios da Cury Vendas RJ no Meta (via Ads Editor). */
export const META_ACCOUNT_ID = process.env.ADS_EDITOR_ACCOUNT_ID?.trim() || "act_403396935310580";
export const ADS_EDITOR_URL = process.env.ADS_EDITOR_MCP_URL?.trim() || "https://app.adseditor.com.br/mcp";

/** Tipo de ação que o Meta usa para contar lead de formulário. */
export const META_LEAD_ACTION = "lead";

/** Quanto tempo (segundos) os dados ficam em cache antes de buscar de novo. */
export const CACHE_SEGUNDOS = 600;

/**
 * Produtos (grupos de campanhas no Meta). A primeira regra que casar com o
 * nome da campanha decide o produto. Campanhas que não casam com nenhuma
 * (vagas de corretor, Instagram/tráfego) ficam fora do relatório.
 */
export type Produto = { id: string; nome: string; campanha: RegExp };

export const PRODUTOS: Produto[] = [
  { id: "servidor", nome: "Feirão do Servidor", campanha: /SERVIDOR/i },
  { id: "corre", nome: "Feirão do Corre", campanha: /FEIR[AÃ]O[_ ]DO[_ ]CORRE/i },
  { id: "porto", nome: "Porto", campanha: /\[PORTO\]/i },
  { id: "zona-norte", nome: "Zona Norte", campanha: /\[ZONA ?NORTE\]/i },
];

/** Campanhas que nunca entram, mesmo que casem com um produto. */
export const CAMPANHAS_EXCLUIDAS = /\[INSTA\]/i;

/** Campanhas de leads para vaga de corretor (recrutamento): seção própria. */
export const CAMPANHAS_VAGAS = /\[VAGA\]|recrut/i;
export const VAGAS = "vagas";

/**
 * Regras do CRM: como os leads chegam separados no CV. Cada regra junta os
 * produtos do Meta que caem nela (Porto e Zona Norte usam o formulário
 * "Form_zonanorte_teste", que entra na regra do Corre) e diz que textos
 * identificam o lead no CV. A busca olha conversão, mídia, origem, tags e
 * campos adicionais do lead, sem diferenciar maiúsculas e acentos.
 */
export type Regra = { id: string; nome: string; produtos: string[]; textos: string[] };

export const REGRAS: Regra[] = [
  {
    id: "corre",
    nome: "Feirão do Corre",
    produtos: ["corre", "porto", "zona-norte"],
    textos: ["feirao do corre", "feirao_do_corre", "form_zonanorte_teste", "formulario_feirao_do_corre"],
  },
  {
    id: "servidor",
    nome: "Feirão do Servidor",
    produtos: ["servidor"],
    textos: ["feirao do servidor", "feirao_do_servidor"],
  },
];
