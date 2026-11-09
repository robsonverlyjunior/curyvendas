/**
 * Números do NotificaLead (conta Cury Rio) extraídos em 09/11/2026, usados
 * enquanto a leitura ao vivo do NotificaLead não estiver configurada.
 * Só agregados: nenhum dado pessoal.
 */
export const FOTO = {
  extraidoEm: "09/11/2026",
  ate: "2026-11-09",
  regras: [
    { id: "corre", leads: 684, unicos: 680, semEmail: 43, telefoneInvalido: 38, inicio: "2026-09-21", fim: "2026-11-09" },
    { id: "servidor", leads: 168, unicos: 168, semEmail: 7, telefoneInvalido: 8, inicio: "2026-10-24", fim: "2026-11-01" },
  ],
  /** Telefones repetidos: 7 no total, 3 deles nos dois feirões. */
  repetidos: 7,
  repetidosEntreRegras: 3,
  formularios: [
    { regra: "corre", formulario: "Form_zonanorte_teste", leads: 411, inicio: "2026-10-11", fim: "2026-11-09" },
    { regra: "corre", formulario: "Formulário_Feirao_do_Corre-2", leads: 261, inicio: "2026-09-23", fim: "2026-09-28" },
    { regra: "servidor", formulario: "feirao_do_servidor", leads: 168, inicio: "2026-10-24", fim: "2026-11-01" },
    { regra: "corre", formulario: "Formulário_Feirao_do_Corre", leads: 12, inicio: "2026-09-21", fim: "2026-09-22" },
  ],
  /** Leads por hora (0 a 23), os dois feirões somados. */
  horas: [25, 26, 19, 17, 12, 18, 28, 31, 23, 32, 40, 35, 37, 48, 40, 38, 48, 46, 54, 44, 43, 65, 44, 39],
  /** Situação no NotificaLead: todos estavam em "Novo" na extração. */
  situacoes: [{ situacao: "Novo", leads: 852 }],
  /** Leads por dia: [data, Corre, Servidor]. */
  dias: [
    ["2026-09-21", 5, 0], ["2026-09-22", 7, 0], ["2026-09-23", 57, 0], ["2026-09-24", 44, 0], ["2026-09-25", 60, 0],
    ["2026-09-26", 62, 0], ["2026-09-27", 31, 0], ["2026-09-28", 7, 0], ["2026-09-29", 0, 0], ["2026-09-30", 0, 0],
    ["2026-10-01", 0, 0], ["2026-10-02", 0, 0], ["2026-10-03", 0, 0], ["2026-10-04", 0, 0], ["2026-10-05", 0, 0],
    ["2026-10-06", 0, 0], ["2026-10-07", 0, 0], ["2026-10-08", 0, 0], ["2026-10-09", 0, 0], ["2026-10-10", 0, 0],
    ["2026-10-11", 11, 0], ["2026-10-12", 4, 0], ["2026-10-13", 3, 0], ["2026-10-14", 2, 0], ["2026-10-15", 3, 0],
    ["2026-10-16", 8, 0], ["2026-10-17", 3, 0], ["2026-10-18", 4, 0], ["2026-10-19", 6, 0], ["2026-10-20", 4, 0],
    ["2026-10-21", 3, 0], ["2026-10-22", 0, 0], ["2026-10-23", 1, 0], ["2026-10-24", 3, 2], ["2026-10-25", 0, 4],
    ["2026-10-26", 0, 12], ["2026-10-27", 2, 21], ["2026-10-28", 7, 29], ["2026-10-29", 7, 20], ["2026-10-30", 17, 19],
    ["2026-10-31", 20, 33], ["2026-11-01", 22, 28], ["2026-11-02", 33, 0], ["2026-11-03", 12, 0], ["2026-11-04", 47, 0],
    ["2026-11-05", 34, 0], ["2026-11-06", 61, 0], ["2026-11-07", 46, 0], ["2026-11-08", 31, 0], ["2026-11-09", 17, 0],
  ] as [string, number, number][],
};
