import { obterRelatorio } from "@/lib/relatorio";
import { REGRAS } from "@/lib/config";
import { Barras, BarrasDia, Mini, type Serie } from "./graficos";

// A página é refeita no máximo a cada 10 minutos, quando alguém abre.
export const revalidate = 600;

const CORES = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)"];
const brl = (n: number | null) => (n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const brlCurto = (n: number) => (n >= 1000 ? `R$ ${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : `R$ ${Math.round(n)}`);
const int = (n: number) => n.toLocaleString("pt-BR");
const pct = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`);
const dm = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "—");
const sinal = (n: number) => (n > 0 ? `+${n}` : String(n));

export default async function Pagina() {
  const r = await obterRelatorio();
  const series: Serie[] = REGRAS.map((g, i) => ({ id: g.id, nome: g.nome, cor: CORES[i % CORES.length]! }));
  const temCv = !r.erros.cv;
  const temMeta = !r.erros.meta;
  const emNovo = r.situacoes.find(s => /^novo$/i.test(s.situacao))?.leads ?? 0;

  return (
    <main className="pagina">
      <header className="topo">
        <p className="marca">Cury Vendas RJ</p>
        <h1>Feirões — Meta Ads × leads no CRM</h1>
        {temCv && temMeta ? (
          <p className="lede">
            Com <b>{brl(r.totais.investimento)}</b> investidos nas campanhas de leads dos feirões, entraram{" "}
            <b>{int(r.totais.leadsCrm)}</b> leads no CV, a <b>{brl(r.totais.cplCrm)}</b> por lead. O Meta registrou{" "}
            <b>{int(r.totais.leadsMeta)}</b> leads no mesmo período.
          </p>
        ) : null}
        <p className="sub">
          De {dm(r.inicio)} a {dm(r.fim)}/{r.fim.slice(0, 4)} · atualizado em {r.geradoEm} (renova a cada 10 minutos). Só campanhas de leads de
          venda dos feirões; vagas de corretor e tráfego para o Instagram ficam de fora.
        </p>
        {(r.erros.meta || r.erros.cv) && (
          <div className="aviso" role="alert">
            {r.erros.meta && <p><b>Meta Ads indisponível:</b> {r.erros.meta}</p>}
            {r.erros.cv && <p><b>CV indisponível:</b> {r.erros.cv}</p>}
          </div>
        )}
      </header>

      <section className="kpis" aria-label="Indicadores">
        <Kpi rotulo="Investimento no Meta" valor={temMeta ? brl(r.totais.investimento) : "—"} nota={`${r.campanhas.length} campanhas de leads`} />
        <Kpi rotulo="Leads no CRM" valor={temCv ? int(r.totais.leadsCrm) : "—"} nota={`desde ${dm(r.inicio)}`} />
        <Kpi rotulo="Custo por lead no CRM" valor={temCv && temMeta ? brl(r.totais.cplCrm) : "—"} nota="investimento ÷ leads no CV" />
        <Kpi rotulo="Leads no Meta" valor={temMeta ? int(r.totais.leadsMeta) : "—"} nota="formulários do Facebook/Instagram" />
        <Kpi rotulo="Leads únicos (por telefone)" valor={temCv ? int(r.totais.leadsUnicos) : "—"}
          nota={`${r.totais.repetidos} telefones repetidos${r.totais.repetidosEntreRegras ? `, ${r.totais.repetidosEntreRegras} em mais de um feirão` : ""}`} />
        {REGRAS.map(g => {
          const x = r.regras.find(y => y.id === g.id);
          return <Kpi key={g.id} rotulo={g.nome} valor={temCv ? int(x?.leadsCrm ?? 0) : "—"} nota={x?.inicio ? `${dm(x.inicio)} a ${dm(x.fim)}` : "sem leads no período"} />;
        })}
      </section>

      <section className="card" id="conciliacao">
        <h2>Meta Ads × CRM, por feirão</h2>
        <p className="sub">Cada feirão junta as campanhas cujos formulários caem na mesma regra do CRM. Porto e Zona Norte usam o formulário do Corre, então entram nele.</p>
        <div className="tabela"><table>
          <thead><tr><th>Feirão</th><th>Leads no CRM de</th><th className="n">Investimento</th><th className="n">Leads no Meta</th><th className="n">Leads no CRM</th><th className="n">Diferença</th><th className="n">Custo por lead (CRM)</th></tr></thead>
          <tbody>{r.regras.map(x => (
            <tr key={x.id}><td>{x.nome}</td><td>{x.inicio ? `${dm(x.inicio)} a ${dm(x.fim)}` : "—"}</td><td className="n">{brl(x.investimento)}</td>
              <td className="n">{int(x.leadsMeta)}</td><td className="n">{int(x.leadsCrm)}</td>
              <td className={`n ${Math.abs(x.diferenca) > Math.max(10, x.leadsMeta * 0.05) ? "alerta" : ""}`}>{sinal(x.diferenca)}</td><td className="n">{brl(x.cplCrm)}</td></tr>
          ))}</tbody>
        </table></div>
        {r.semRegra > 0 && <p className="sub">Outros {int(r.semRegra)} leads entraram no CV no período por outras origens e não fazem parte deste relatório.</p>}
      </section>

      <section className="card" id="investimento-dia">
        <h2>Investimento por dia</h2>
        <Legenda series={series} />
        <BarrasDia dias={r.investimentoDia} series={series} formato={brlCurto} titulo="Investimento por dia" />
      </section>

      <section id="produtos">
        <h2>Campanhas por produto</h2>
        <div className="grupos">
          {r.produtos.map((p, i) => (
            <article className="card grupo" key={p.id}>
              <div className="cab"><h3>{p.nome}</h3><span className={`pilula ${p.ativo ? "on" : ""}`}>{p.ativo ? "Ativo" : "Pausado"}</span></div>
              <p className="sub">{dm(p.inicio)} a {dm(p.fim)}</p>
              <div className="stats">
                <Stat r="Investimento" v={brl(p.investimento)} /><Stat r="Leads no Meta" v={int(p.leadsMeta)} />
                <Stat r="Custo por lead" v={brl(p.cpl)} /><Stat r="Impressões" v={int(p.impressoes)} />
                <Stat r="Cliques" v={int(p.cliques)} /><Stat r="CTR" v={pct(p.ctr)} /><Stat r="Custo por clique" v={brl(p.cpc)} />
              </div>
              <p className="rot">Leads por dia no Meta</p>
              <Mini pontos={p.porDia} cor={CORES[i % CORES.length]!} />
              <p className="camps">Campanhas: {p.campanhas.join(", ")}</p>
            </article>
          ))}
        </div>
        <details className="card">
          <summary>Ver as {r.campanhas.length} campanhas separadas</summary>
          <div className="tabela"><table>
            <thead><tr><th>Campanha</th><th>Produto</th><th>Status</th><th className="n">Investimento</th><th className="n">Leads no Meta</th><th className="n">Custo por lead</th><th className="n">Cliques</th></tr></thead>
            <tbody>{r.campanhas.map(c => (
              <tr key={c.id}><td>{c.nome}</td><td>{r.produtos.find(p => p.id === c.produto)?.nome ?? c.produto}</td>
                <td className={c.ativa ? "ok" : ""}>{c.ativa ? "Ativa" : "Pausada"}</td><td className="n">{brl(c.investimento)}</td>
                <td className="n">{int(c.leadsMeta)}</td><td className="n">{brl(c.cpl)}</td><td className="n">{int(c.cliques)}</td></tr>
            ))}</tbody>
          </table></div>
        </details>
      </section>

      <section className="card" id="leads-dia">
        <h2>Leads no CRM por dia</h2>
        <Legenda series={series} />
        <BarrasDia dias={r.leadsDia} series={series} formato={int} titulo="Leads no CRM por dia" />
      </section>

      <section className="card" id="formularios">
        <h2>Leads por formulário</h2>
        <div className="tabela"><table>
          <thead><tr><th>Feirão</th><th>Formulário / conversão</th><th className="n">Leads</th><th>Início</th><th>Fim</th></tr></thead>
          <tbody>{r.formularios.map(f => (
            <tr key={f.regra + f.formulario}><td>{f.regra}</td><td>{f.formulario}</td><td className="n">{int(f.leads)}</td><td>{dm(f.inicio)}</td><td>{dm(f.fim)}</td></tr>
          ))}</tbody>
        </table></div>
      </section>

      <section className="card" id="horarios">
        <h2>Horário de chegada dos leads</h2>
        <p className="sub">Os feirões somados, por hora do dia (horário de Brasília).</p>
        <Barras itens={r.horas.map(h => ({ chave: String(h.hora), valor: h.leads }))} rotulo={c => `${c}h`} cor="var(--s1)" titulo="Leads por hora do dia" />
      </section>

      <section className="duas">
        <div className="card" id="situacao">
          <h2>Em que etapa estão</h2>
          <p className="sub">{r.totais.leadsCrm ? `${Math.round((emNovo / r.totais.leadsCrm) * 100)}% dos leads ainda estão em "Novo".` : "Situação atual dos leads no CV."}</p>
          <div className="tabela"><table>
            <thead><tr><th>Situação no CV</th><th className="n">Leads</th><th className="n">%</th></tr></thead>
            <tbody>{r.situacoes.map(s => (
              <tr key={s.situacao}><td>{s.situacao}</td><td className="n">{int(s.leads)}</td><td className="n">{pct(r.totais.leadsCrm ? Math.round((s.leads / r.totais.leadsCrm) * 1000) / 10 : null)}</td></tr>
            ))}</tbody>
          </table></div>
        </div>
        <div className="card" id="qualidade">
          <h2>Qualidade dos contatos</h2>
          <p className="sub">"Telefone inválido" inclui vazios e números fora do padrão DDD + número.</p>
          <div className="tabela"><table>
            <thead><tr><th>Feirão</th><th className="n">Leads</th><th className="n">Únicos</th><th className="n">Sem e-mail</th><th className="n">Tel. inválido</th></tr></thead>
            <tbody>{r.qualidade.map(q => (
              <tr key={q.regra}><td>{q.regra}</td><td className="n">{int(q.leads)}</td><td className="n">{int(q.unicos)}</td><td className="n">{int(q.semEmail)}</td><td className="n">{int(q.telefoneInvalido)}</td></tr>
            ))}</tbody>
          </table></div>
        </div>
      </section>

      <footer className="rodape">Dados do Meta Ads (via Ads Editor) e do CV CRM. Nenhum dado pessoal de lead é exibido nesta página.</footer>
    </main>
  );
}

function Kpi({ rotulo, valor, nota }: { rotulo: string; valor: string; nota: string }) {
  return <div className="card kpi"><p className="rot">{rotulo}</p><p className="valor">{valor}</p><p className="nota">{nota}</p></div>;
}
function Stat({ r, v }: { r: string; v: string }) {
  return <div><p className="rot">{r}</p><p className="sv">{v}</p></div>;
}
function Legenda({ series }: { series: Serie[] }) {
  return <p className="legenda">{series.map(s => <span key={s.id}><i style={{ background: s.cor }} />{s.nome}</span>)}</p>;
}
