import { ComDica } from "./dica";

/** Gráficos em SVG desenhados no servidor, com dica ao passar o mouse. */

export type Serie = { id: string; nome: string; cor: string };

const fmtData = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const diaSemana = (d: string) => SEMANA[new Date(d + "T12:00:00Z").getUTCDay()];
const W = 960;

function escala(max: number) {
  if (max <= 0) return { topo: 1, passos: [0, 1] };
  const bruto = max / 4;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map(m => m * mag).find(p => p >= bruto)!;
  const topo = Math.ceil(max / passo) * passo;
  return { topo, passos: Array.from({ length: Math.round(topo / passo) + 1 }, (_, i) => i * passo) };
}

/** Barras empilhadas por dia, com total do dia na dica. */
export function BarrasDia({ dias, series, formato, formatoEixo, altura = 260, titulo }: {
  dias: { data: string; valores: Record<string, number> }[]; series: Serie[];
  formato: (n: number) => string; formatoEixo?: (n: number) => string; altura?: number; titulo: string;
}) {
  if (!dias.length) return <p className="vazio">Sem dados no período.</p>;
  const eixo = formatoEixo ?? formato;
  const m = { t: 12, r: 8, b: 30, l: 64 };
  const totais = dias.map(d => series.reduce((s, x) => s + (d.valores[x.id] ?? 0), 0));
  const { topo, passos } = escala(Math.max(...totais));
  const iw = W - m.l - m.r, ih = altura - m.t - m.b;
  const bw = iw / dias.length;
  const y = (v: number) => m.t + ih - (v / topo) * ih;
  const cada = Math.max(1, Math.ceil(dias.length / 9));
  return (
    <ComDica>
      <div className="rolagem">
        <svg viewBox={`0 0 ${W} ${altura}`} className="grafico" role="img" aria-label={titulo}>
          {passos.map(p => (
            <g key={p}>
              <line x1={m.l} x2={W - m.r} y1={y(p)} y2={y(p)} className={p === 0 ? "base" : "grade"} />
              <text x={m.l - 10} y={y(p)} dy="0.32em" textAnchor="end" className="eixo">{eixo(p)}</text>
            </g>
          ))}
          {dias.map((d, i) => {
            let acum = 0;
            const x = m.l + i * bw;
            const total = totais[i]!;
            const linhas = series.filter(s => (d.valores[s.id] ?? 0) > 0).map(s => `${s.nome}: ${formato(d.valores[s.id]!)}`);
            const dica = [`${diaSemana(d.data)}, ${fmtData(d.data)} · ${formato(total)}`, ...(series.length > 1 ? linhas : [])].join("\n");
            return (
              <g key={d.data} data-dica={dica} className="coluna">
                <rect x={x} y={m.t} width={bw} height={ih} className="alvo" />
                {series.map(s => {
                  const v = d.valores[s.id] ?? 0;
                  if (!v) return null;
                  const y0 = y(acum + v), h = y(acum) - y0;
                  acum += v;
                  return <rect key={s.id} x={x + bw * 0.14} y={y0} width={Math.max(1.5, bw * 0.72)} height={Math.max(0.5, h)} fill={s.cor} rx={Math.min(2, bw * 0.15)} />;
                })}
                {i % cada === 0 && <text x={x + bw / 2} y={altura - 10} textAnchor="middle" className="eixo">{fmtData(d.data)}</text>}
              </g>
            );
          })}
        </svg>
      </div>
    </ComDica>
  );
}

/** Barras simples (ex.: leads por hora), com destaque nas maiores. */
export function Barras({ itens, rotulo, cor, destaque = 3, altura = 260, largura = 560, titulo, unidade }: {
  itens: { chave: string; valor: number }[]; rotulo: (c: string) => string; cor: string; destaque?: number; altura?: number; largura?: number; titulo: string; unidade: string;
}) {
  const W = largura;
  const m = { t: 12, r: 6, b: 28, l: 34 };
  const { topo, passos } = escala(Math.max(...itens.map(i => i.valor)));
  const iw = W - m.l - m.r, ih = altura - m.t - m.b;
  const bw = iw / itens.length;
  const y = (v: number) => m.t + ih - (v / topo) * ih;
  const total = itens.reduce((s, i) => s + i.valor, 0);
  const corte = [...itens].sort((a, b) => b.valor - a.valor)[destaque - 1]?.valor ?? Infinity;
  return (
    <ComDica>
      <div>
        <svg viewBox={`0 0 ${W} ${altura}`} className="grafico encaixado" role="img" aria-label={titulo}>
          {passos.map(p => (
            <g key={p}>
              <line x1={m.l} x2={W - m.r} y1={y(p)} y2={y(p)} className={p === 0 ? "base" : "grade"} />
              <text x={m.l - 8} y={y(p)} dy="0.32em" textAnchor="end" className="eixo">{p}</text>
            </g>
          ))}
          {itens.map((it, i) => (
            <g key={it.chave} className="coluna" data-dica={`${rotulo(it.chave)} · ${it.valor} ${unidade}\n${total ? Math.round((it.valor / total) * 1000) / 10 : 0}% do total`}>
              <rect x={m.l + i * bw} y={m.t} width={bw} height={ih} className="alvo" />
              <rect x={m.l + i * bw + bw * 0.16} y={y(it.valor)} width={bw * 0.68} height={Math.max(0, y(0) - y(it.valor))} fill={cor} opacity={it.valor >= corte ? 1 : 0.45} rx={2} />
              {i % 3 === 0 && <text x={m.l + i * bw + bw / 2} y={altura - 8} textAnchor="middle" className="eixo">{rotulo(it.chave)}</text>}
            </g>
          ))}
        </svg>
      </div>
    </ComDica>
  );
}

/** Linha compacta de leads por dia (cartão de produto). */
export function Mini({ pontos, cor }: { pontos: { data: string; leads: number; investimento: number }[]; cor: string }) {
  if (pontos.length < 2) return <p className="vazio">Poucos dias para o gráfico.</p>;
  const w = 320, h = 64, m = 3;
  const max = Math.max(1, ...pontos.map(p => p.leads));
  const x = (i: number) => m + (i / (pontos.length - 1)) * (w - 2 * m);
  const y = (v: number) => h - m - (v / max) * (h - 2 * m);
  const d = pontos.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.leads).toFixed(1)}`).join("");
  const fatia = w / pontos.length;
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return (
    <ComDica>
      <svg viewBox={`0 0 ${w} ${h}`} className="mini" role="img" aria-label="Leads por dia no Meta" preserveAspectRatio="none">
        <path d={`${d}L${x(pontos.length - 1)},${h}L${x(0)},${h}Z`} fill={cor} opacity={0.14} />
        <path d={d} fill="none" stroke={cor} strokeWidth={1.8} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {pontos.map((p, i) => (
          <rect key={p.data} x={x(i) - fatia / 2} y={0} width={fatia} height={h} fill="transparent"
            data-dica={`${diaSemana(p.data)}, ${fmtData(p.data)}\n${p.leads} leads · ${brl(p.investimento)}`} />
        ))}
      </svg>
    </ComDica>
  );
}

/** Barra horizontal de proporção (ex.: participação de cada situação). */
export function Proporcao({ partes }: { partes: { nome: string; valor: number; cor: string }[] }) {
  const total = partes.reduce((s, p) => s + p.valor, 0) || 1;
  return (
    <ComDica>
      <div className="proporcao">
        {partes.filter(p => p.valor > 0).map(p => (
          <span key={p.nome} style={{ width: `${(p.valor / total) * 100}%`, background: p.cor }}
            data-dica={`${p.nome}\n${p.valor.toLocaleString("pt-BR")} · ${Math.round((p.valor / total) * 1000) / 10}%`} />
        ))}
      </div>
    </ComDica>
  );
}
