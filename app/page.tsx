import { obterRelatorio, type Relatorio } from "@/lib/relatorio";
import { REGRAS } from "@/lib/config";
import { Barras, BarrasDia, Mini, Proporcao, type Serie } from "./graficos";

// Gerada quando alguém abre (nunca no build). Os dados ficam em cache por
// 10 minutos em lib/relatorio.ts, então só a primeira visita espera a busca.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const COR_REGRA: Record<string, string> = { corre: "var(--c-corre)", servidor: "var(--c-servidor)" };
const COR_PRODUTO: Record<string, string> = { corre: "var(--c-corre)", porto: "var(--c-porto)", "zona-norte": "var(--c-zn)", servidor: "var(--c-servidor)" };

const brl = (n: number | null) => (n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const brl0 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const brlEixo = (n: number) => (n >= 1000 ? `R$ ${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : `R$ ${Math.round(n)}`);
const int = (n: number) => n.toLocaleString("pt-BR");
const pct = (n: number | null, casas = 1) => (n == null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: casas })}%`);
const dm = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "—");
const sinal = (n: number) => (n > 0 ? `+${int(n)}` : int(n));

/** Destaques escritos a partir dos próprios números (nada fixo no texto). */
function destaques(r: Relatorio): string[] {
  const out: string[] = [];
  const foto = r.crm.fonte === "foto";
  const difs = r.regras.map(x => `${x.nome.replace("Feirão do ", "")} ${sinal(x.diferenca)}`).join(", ");
  const batem = r.regras.every(x => Math.abs(x.diferenca) <= Math.max(10, x.leadsMeta * 0.05));
  if (r.regras.some(x => x.leadsMeta > 0))
    out.push(batem
      ? `Meta e ${foto ? "NotificaLead" : "CRM"} batem: a diferença de leads é pequena (${difs}). Não há perda entre o anúncio e o CRM.`
      : `Atenção: diferença relevante de leads entre Meta e CRM (${difs}). Vale checar a integração dos formulários.`);
  const ativos = r.produtos.filter(p => p.ativo);
  for (const p of ativos) {
    const ult = p.porDia.slice(-7), ant = p.porDia.slice(-14, -7);
    const cpl = (xs: typeof ult) => { const l = xs.reduce((s, d) => s + d.leads, 0); return l ? xs.reduce((s, d) => s + d.investimento, 0) / l : null; };
    const a = cpl(ult), b = cpl(ant);
    const gasto = ult.reduce((s, d) => s + d.investimento, 0) / Math.max(1, ult.length);
    out.push(`${p.nome} é o produto ativo: nos últimos 7 dias gastou em média ${brl0(gasto)}/dia com custo por lead de ${brl(a)}${b ? ` (${a! > b ? "subiu" : "caiu"} de ${brl(b)} na semana anterior)` : ""}.`);
  }
  const comVolume = r.produtos.filter(p => p.leadsMeta >= 30 && p.cpl != null).sort((a, b) => a.cpl! - b.cpl!);
  if (comVolume.length > 1)
    out.push(`Menor custo por lead no Meta: ${comVolume[0]!.nome} (${brl(comVolume[0]!.cpl)}). Maior: ${comVolume.at(-1)!.nome} (${brl(comVolume.at(-1)!.cpl)}).`);
  const horas = [...r.horas].sort((a, b) => b.leads - a.leads).slice(0, 3).map(h => `${h.hora}h`);
  const noite = r.horas.filter(h => h.hora >= 18).reduce((s, h) => s + h.leads, 0);
  const totH = r.horas.reduce((s, h) => s + h.leads, 0);
  if (totH) out.push(`Os leads chegam mais à noite: ${pct((noite / totH) * 100, 0)} entre 18h e 23h, com pico às ${horas.join(", ")}. É o horário para o atendimento estar disponível.`);
  const novo = r.situacoes.find(s => /^novo$/i.test(s.situacao))?.leads ?? 0;
  if (r.totais.leadsCrm && novo / r.totais.leadsCrm > 0.8)
    out.push(`${pct((novo / r.totais.leadsCrm) * 100, 0)} dos leads ainda estão em "Novo"${foto ? " no NotificaLead" : ""}: ou o retorno não está sendo registrado, ou os leads não foram trabalhados.`);
  return out;
}

export default async function Pagina() {
  const r = await obterRelatorio();
  const foto = r.crm.fonte === "foto";
  const crm = foto ? "NotificaLead" : "CV";
  const temMeta = !r.erros.meta;
  const temCrm = !r.erros.cv;
  const series: Serie[] = REGRAS.map(g => ({ id: g.id, nome: g.nome, cor: COR_REGRA[g.id] ?? "var(--c-porto)" }));
  const invAteFoto = r.regras.reduce((s, x) => s + x.investimento, 0);
  const metaAteFoto = r.regras.reduce((s, x) => s + x.leadsMeta, 0);
  const lista = destaques(r);
  const totalHoras = r.horas.reduce((s, h) => s + h.leads, 0);

  return (
    <main className="pagina">
      <header className="topo">
        <p className="sobre">Cury Vendas RJ · Relatório de performance</p>
        <h1>Feirões: Meta Ads × leads no CRM</h1>
        <p className="periodo">Período de {dm(r.inicio)} a {dm(r.fim)}/{r.fim.slice(0, 4)} · campanhas de leads de venda dos feirões</p>
        <div className="fontes">
          <span className={`fonte ${temMeta ? "viva" : "erro"}`}><i />Meta Ads {temMeta ? `ao vivo · ${r.geradoEm.split(" às ")[1]}` : "indisponível"}</span>
          <span className={`fonte ${foto ? "fixa" : temCrm ? "viva" : "erro"}`}><i />{foto ? `NotificaLead · dados de ${r.crm.extraidoEm}` : `CV ${temCrm ? "ao vivo" : "indisponível"}`}</span>
        </div>
        {(r.erros.meta || r.erros.cv) && (
          <div className="aviso" role="alert">
            {r.erros.meta && <p><b>Meta Ads:</b> {r.erros.meta}</p>}
            {r.erros.cv && <p><b>CV:</b> {r.erros.cv}</p>}
          </div>
        )}
      </header>

      <section className="kpis" aria-label="Indicadores principais">
        <Kpi rotulo="Investimento no Meta" valor={temMeta ? brl(r.totais.investimento) : "—"} nota={`${r.campanhas.length} campanhas · ${r.produtos.length} produtos`} />
        <Kpi rotulo="Leads no Meta" valor={temMeta ? int(r.totais.leadsMeta) : "—"} nota={`custo por lead ${brl(r.totais.leadsMeta ? r.totais.investimento / r.totais.leadsMeta : null)}`} />
        <Kpi rotulo={`Leads no ${crm}`} valor={temCrm ? int(r.totais.leadsCrm) : "—"} nota={`${int(r.totais.leadsUnicos)} únicos por telefone${foto ? ` · até ${dm(r.crm.ate)}` : ""}`} />
        <Kpi rotulo="Custo por lead no CRM" valor={temCrm && temMeta ? brl(r.totais.cplCrm) : "—"} nota={foto ? `${brl0(invAteFoto)} até ${dm(r.crm.ate)} ÷ ${int(r.totais.leadsCrm)} leads` : "investimento ÷ leads no CV"} destaque />
      </section>

      {lista.length > 0 && (
        <section className="card destaques" aria-labelledby="t-destaques">
          <h2 id="t-destaques">Destaques</h2>
          <ul>{lista.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </section>
      )}

      <Secao n={1} titulo="Resultado por feirão" sub={`Investimento e leads do Meta comparados com os leads que entraram no ${crm}${foto ? `, até ${dm(r.crm.ate)}` : ""}. Porto e Zona Norte usam o formulário do Corre, por isso entram no Corre.`}>
        <div className="feiroes">
          {r.regras.map(x => {
            const share = metaAteFoto ? (x.leadsMeta / metaAteFoto) * 100 : 0;
            return (
              <article className="card feirao" key={x.id} style={{ ["--cor" as string]: COR_REGRA[x.id] }}>
                <header><h3>{x.nome}</h3><span className="datas">{x.inicio ? `${dm(x.inicio)} a ${dm(x.fim)}` : "sem leads"}</span></header>
                <div className="grande"><span>{int(x.leadsCrm)}</span><small>leads no {crm}</small></div>
                <dl className="grade-3">
                  <div><dt>Investimento</dt><dd>{brl(x.investimento)}</dd></div>
                  <div><dt>Leads no Meta</dt><dd>{int(x.leadsMeta)}</dd></div>
                  <div><dt>Diferença</dt><dd className={Math.abs(x.diferenca) > Math.max(10, x.leadsMeta * 0.05) ? "alerta" : ""}>{sinal(x.diferenca)}</dd></div>
                  <div><dt>Custo por lead</dt><dd>{brl(x.cplCrm)}</dd></div>
                  <div><dt>Participação</dt><dd>{pct(share, 0)}</dd></div>
                </dl>
              </article>
            );
          })}
        </div>
      </Secao>

      <Secao n={2} titulo="Evolução diária" sub="Passe o mouse (ou toque) nas barras para ver o valor de cada dia.">
        <div className="card">
          <div className="cab-grafico"><h3>Investimento por dia</h3><Legenda series={series} /></div>
          <BarrasDia dias={r.investimentoDia} series={series} formato={brl} formatoEixo={brlEixo} titulo="Investimento por dia" />
        </div>
        <div className="card">
          <div className="cab-grafico"><h3>Leads no {crm} por dia</h3><Legenda series={series} /></div>
          <BarrasDia dias={r.leadsDia} series={series} formato={n => `${int(n)} leads`} formatoEixo={int} titulo={`Leads no ${crm} por dia`} />
        </div>
      </Secao>

      <Secao n={3} titulo="Produtos e campanhas" sub="Números do Meta Ads por produto, com a curva de leads por dia.">
        <div className="produtos">
          {r.produtos.map(p => (
            <article className="card produto" key={p.id} style={{ ["--cor" as string]: COR_PRODUTO[p.id] }}>
              <header>
                <h3>{p.nome}</h3>
                <span className={`selo ${p.ativo ? "on" : ""}`}>{p.ativo ? "Ativo" : "Pausado"}</span>
              </header>
              <p className="datas">{dm(p.inicio)} a {dm(p.fim)} · {p.campanhas.length} {p.campanhas.length === 1 ? "campanha" : "campanhas"}</p>
              <dl className="grade-3">
                <div><dt>Investimento</dt><dd>{brl(p.investimento)}</dd></div>
                <div><dt>Leads</dt><dd>{int(p.leadsMeta)}</dd></div>
                <div><dt>Custo por lead</dt><dd>{brl(p.cpl)}</dd></div>
                <div><dt>Impressões</dt><dd>{int(p.impressoes)}</dd></div>
                <div><dt>CTR</dt><dd>{pct(p.ctr, 2)}</dd></div>
                <div><dt>Custo por clique</dt><dd>{brl(p.cpc)}</dd></div>
              </dl>
              <Mini pontos={p.porDia} cor={COR_PRODUTO[p.id] ?? "var(--c-porto)"} />
            </article>
          ))}
        </div>
        <div className="card">
          <h3>Campanhas</h3>
          <div className="tabela cartoes"><table>
            <thead><tr><th>Campanha</th><th>Produto</th><th>Status</th><th className="n">Investimento</th><th className="n">Leads</th><th className="n">Custo por lead</th><th className="n">Cliques</th></tr></thead>
            <tbody>{r.campanhas.map(c => (
              <tr key={c.id}>
                <td className="campanha">{c.nome}</td>
                <td data-r="Produto"><span className="ponto" style={{ background: COR_PRODUTO[c.produto] }} />{r.produtos.find(p => p.id === c.produto)?.nome ?? c.produto}</td>
                <td data-r="Status"><span className={`selo pequeno ${c.ativa ? "on" : ""}`}>{c.ativa ? "Ativa" : "Pausada"}</span></td>
                <td className="n" data-r="Investimento">{brl(c.investimento)}</td><td className="n" data-r="Leads">{int(c.leadsMeta)}</td><td className="n" data-r="Custo por lead">{brl(c.cpl)}</td><td className="n" data-r="Cliques">{int(c.cliques)}</td>
              </tr>
            ))}</tbody>
            <tfoot><tr><td className="campanha">Total</td><td className="vazia" /><td className="vazia" /><td className="n" data-r="Investimento">{brl(r.totais.investimento)}</td><td className="n" data-r="Leads">{int(r.totais.leadsMeta)}</td><td className="n" data-r="Custo por lead">{brl(r.totais.leadsMeta ? r.totais.investimento / r.totais.leadsMeta : null)}</td><td className="n" data-r="Cliques">{int(r.campanhas.reduce((s, c) => s + c.cliques, 0))}</td></tr></tfoot>
          </table></div>
        </div>
      </Secao>

      <Secao n={4} titulo="Origem e horário dos leads">
        <div className="duas">
          <div className="card">
            <h3>Leads por formulário</h3>
            <div className="tabela cartoes"><table>
              <thead><tr><th>Formulário</th><th>Feirão</th><th className="n">Leads</th><th>Período</th></tr></thead>
              <tbody>{r.formularios.map(f => (
                <tr key={f.regra + f.formulario}><td className="campanha">{f.formulario}</td><td data-r="Feirão">{f.regra.replace("Feirão do ", "")}</td><td className="n" data-r="Leads">{int(f.leads)}</td><td data-r="Período">{dm(f.inicio)} a {dm(f.fim)}</td></tr>
              ))}</tbody>
            </table></div>
            <p className="nota">"Form_zonanorte_teste" é usado pelas campanhas do Porto e da Zona Norte, apesar do nome.</p>
          </div>
          <div className="card">
            <h3>Horário de chegada</h3>
            <p className="sub">Feirões somados, horário de Brasília. As 3 horas de pico em destaque.</p>
            <Barras itens={r.horas.map(h => ({ chave: String(h.hora), valor: h.leads }))} rotulo={c => `${c}h`} cor="var(--c-corre)" titulo="Leads por hora do dia" unidade="leads" />
            {totalHoras > 0 && <p className="nota">{pct((r.horas.filter(h => h.hora >= 18).reduce((s, h) => s + h.leads, 0) / totalHoras) * 100, 0)} dos leads chegam entre 18h e 23h.</p>}
          </div>
        </div>
      </Secao>

      <Secao n={5} titulo="Qualidade e andamento">
        <div className="duas">
          <div className="card">
            <h3>Qualidade dos contatos</h3>
            <div className="tabela cartoes"><table>
              <thead><tr><th>Feirão</th><th className="n">Leads</th><th className="n">Únicos</th><th className="n">Sem e-mail</th><th className="n">Telefone inválido</th></tr></thead>
              <tbody>{r.qualidade.map(q => (
                <tr key={q.regra}><td className="campanha">{q.regra}</td><td className="n" data-r="Leads">{int(q.leads)}</td><td className="n" data-r="Únicos">{int(q.unicos)}</td>
                  <td className="n" data-r="Sem e-mail">{int(q.semEmail)} <small>{pct(q.leads ? (q.semEmail / q.leads) * 100 : null)}</small></td>
                  <td className="n" data-r="Telefone inválido">{int(q.telefoneInvalido)} <small>{pct(q.leads ? (q.telefoneInvalido / q.leads) * 100 : null)}</small></td></tr>
              ))}</tbody>
            </table></div>
            <p className="nota">{int(r.totais.repetidos)} telefones aparecem mais de uma vez{r.totais.repetidosEntreRegras ? `, ${int(r.totais.repetidosEntreRegras)} deles nos dois feirões` : ""}. Telefone inválido inclui vazios e números fora do padrão DDD + número.</p>
          </div>
          <div className="card">
            <h3>Em que etapa estão</h3>
            <Proporcao partes={r.situacoes.map((s, i) => ({ nome: s.situacao, valor: s.leads, cor: ["var(--c-corre)", "var(--c-porto)", "var(--c-zn)", "var(--c-servidor)", "var(--suave)"][i % 5]! }))} />
            <div className="tabela"><table>
              <thead><tr><th>Situação no {crm}</th><th className="n">Leads</th><th className="n">%</th></tr></thead>
              <tbody>{r.situacoes.map(s => (
                <tr key={s.situacao}><td>{s.situacao}</td><td className="n">{int(s.leads)}</td><td className="n">{pct(r.totais.leadsCrm ? (s.leads / r.totais.leadsCrm) * 100 : null)}</td></tr>
              ))}</tbody>
            </table></div>
            {foto && <p className="nota">Situação registrada no NotificaLead. O andamento real no CV (atendimento, simulação, reserva) entra quando a leitura automática for ligada.</p>}
          </div>
        </div>
      </Secao>

      <footer className="rodape">
        <h2>Como ler este relatório</h2>
        <ul>
          <li><b>Leads no Meta</b>: envios de formulário registrados pelo Meta Ads em cada campanha.</li>
          <li><b>Leads no {crm}</b>: leads que efetivamente chegaram ao {crm} pelos formulários dos feirões.</li>
          <li><b>Custo por lead no CRM</b>: investimento no Meta dividido pelos leads que chegaram ao {crm}{foto ? `, usando só os dias até ${dm(r.crm.ate)}` : ""}.</li>
          <li><b>Únicos</b>: leads contados uma vez por telefone. Campanhas de vaga de corretor e de tráfego para o Instagram ficam fora.</li>
        </ul>
        <p>Fontes: Meta Ads via Ads Editor{foto ? `, NotificaLead (dados de ${r.crm.extraidoEm})` : ", CV CRM"}. Atualizado em {r.geradoEm}. Nenhum dado pessoal de lead é exibido.</p>
      </footer>
    </main>
  );
}

function Secao({ n, titulo, sub, children }: { n: number; titulo: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="secao" aria-labelledby={`s${n}`}>
      <div className="secao-cab">
        <span className="num">{String(n).padStart(2, "0")}</span>
        <div><h2 id={`s${n}`}>{titulo}</h2>{sub && <p className="sub">{sub}</p>}</div>
      </div>
      {children}
    </section>
  );
}

function Kpi({ rotulo, valor, nota, destaque }: { rotulo: string; valor: string; nota: string; destaque?: boolean }) {
  return (
    <div className={`card kpi ${destaque ? "kpi-destaque" : ""}`}>
      <p className="rot">{rotulo}</p>
      <p className="valor">{valor}</p>
      <p className="nota">{nota}</p>
    </div>
  );
}

function Legenda({ series }: { series: Serie[] }) {
  return <p className="legenda">{series.map(s => <span key={s.id}><i style={{ background: s.cor }} />{s.nome}</span>)}</p>;
}
