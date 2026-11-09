/** Gráficos em SVG puro, desenhados no servidor (sem biblioteca de gráficos). */

export type Serie = { id: string; nome: string; cor: string };

const fmtData = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const W = 720;

function escala(max: number) {
  if (max <= 0) return { topo: 1, passos: [0, 1] };
  const bruto = max / 4;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map(m => m * mag).find(p => p >= bruto)!;
  const topo = Math.ceil(max / passo) * passo;
  return { topo, passos: Array.from({ length: Math.round(topo / passo) + 1 }, (_, i) => i * passo) };
}

/** Barras empilhadas por dia. */
export function BarrasDia({ dias, series, formato, altura = 220, titulo }: {
  dias: { data: string; valores: Record<string, number> }[]; series: Serie[];
  formato: (n: number) => string; altura?: number; titulo: string;
}) {
  if (!dias.length) return <p className="vazio">Sem dados no período.</p>;
  const margem = { t: 10, r: 8, b: 26, l: 52 };
  const totais = dias.map(d => series.reduce((s, x) => s + (d.valores[x.id] ?? 0), 0));
  const { topo, passos } = escala(Math.max(...totais));
  const iw = W - margem.l - margem.r, ih = altura - margem.t - margem.b;
  const bw = iw / dias.length;
  const y = (v: number) => margem.t + ih - (v / topo) * ih;
  const cadaRotulo = Math.max(1, Math.ceil(dias.length / 10));
  return (
    <div className="rolagem"><svg viewBox={`0 0 ${W} ${altura}`} className="grafico" role="img" aria-label={titulo}>
      {passos.map(p => (
        <g key={p}>
          <line x1={margem.l} x2={W - margem.r} y1={y(p)} y2={y(p)} className="grade" />
          <text x={margem.l - 6} y={y(p)} dy="0.32em" textAnchor="end" className="eixo">{formato(p)}</text>
        </g>
      ))}
      {dias.map((d, i) => {
        let acum = 0;
        const x = margem.l + i * bw;
        const detalhe = series.map(s => `${s.nome}: ${formato(d.valores[s.id] ?? 0)}`).join("\n");
        return (
          <g key={d.data}>
            <title>{`${fmtData(d.data)}\n${detalhe}`}</title>
            <rect x={x} y={margem.t} width={bw} height={ih} className="alvo" />
            {series.map(s => {
              const v = d.valores[s.id] ?? 0;
              if (!v) return null;
              const y0 = y(acum + v), h = y(acum) - y0;
              acum += v;
              return <rect key={s.id} x={x + bw * 0.12} y={y0} width={Math.max(1, bw * 0.76)} height={h} fill={s.cor} rx={1.5} />;
            })}
            {i % cadaRotulo === 0 && <text x={x + bw / 2} y={altura - 8} textAnchor="middle" className="eixo">{fmtData(d.data)}</text>}
          </g>
        );
      })}
    </svg></div>
  );
}

/** Barras simples (ex.: leads por hora). */
export function Barras({ itens, rotulo, cor, altura = 200, titulo }: {
  itens: { chave: string; valor: number }[]; rotulo: (c: string) => string; cor: string; altura?: number; titulo: string;
}) {
  const margem = { t: 16, r: 8, b: 26, l: 36 };
  const { topo, passos } = escala(Math.max(...itens.map(i => i.valor)));
  const iw = W - margem.l - margem.r, ih = altura - margem.t - margem.b;
  const bw = iw / itens.length;
  const y = (v: number) => margem.t + ih - (v / topo) * ih;
  return (
    <div className="rolagem"><svg viewBox={`0 0 ${W} ${altura}`} className="grafico" role="img" aria-label={titulo}>
      {passos.map(p => (
        <g key={p}>
          <line x1={margem.l} x2={W - margem.r} y1={y(p)} y2={y(p)} className="grade" />
          <text x={margem.l - 6} y={y(p)} dy="0.32em" textAnchor="end" className="eixo">{p}</text>
        </g>
      ))}
      {itens.map((it, i) => (
        <g key={it.chave}>
          <title>{`${rotulo(it.chave)}: ${it.valor}`}</title>
          <rect x={margem.l + i * bw} y={margem.t} width={bw} height={ih} className="alvo" />
          <rect x={margem.l + i * bw + bw * 0.15} y={y(it.valor)} width={bw * 0.7} height={Math.max(0, y(0) - y(it.valor))} fill={cor} rx={1.5} />
          {i % 3 === 0 && <text x={margem.l + i * bw + bw / 2} y={altura - 8} textAnchor="middle" className="eixo">{rotulo(it.chave)}</text>}
        </g>
      ))}
    </svg></div>
  );
}

/** Mini gráfico de linha (leads por dia de um produto). */
export function Mini({ pontos, cor }: { pontos: { data: string; leads: number }[]; cor: string }) {
  if (pontos.length < 2) return <p className="vazio">Poucos dias para o gráfico.</p>;
  const w = 300, h = 70, m = 4;
  const max = Math.max(1, ...pontos.map(p => p.leads));
  const x = (i: number) => m + (i / (pontos.length - 1)) * (w - 2 * m);
  const y = (v: number) => h - m - (v / max) * (h - 2 * m - 10);
  const d = pontos.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.leads).toFixed(1)}`).join("");
  const pico = pontos.reduce((a, b) => (b.leads > a.leads ? b : a));
  const ip = pontos.indexOf(pico);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mini" role="img" aria-label="Leads por dia no Meta">
      <path d={`${d}L${x(pontos.length - 1)},${h - m}L${x(0)},${h - m}Z`} fill={cor} opacity={0.12} />
      <path d={d} fill="none" stroke={cor} strokeWidth={1.6} />
      {pontos.map((p, i) => (
        <g key={p.data}><title>{`${fmtData(p.data)}: ${p.leads} leads`}</title>
          <rect x={x(i) - (w / pontos.length) / 2} y={0} width={w / pontos.length} height={h} fill="transparent" /></g>
      ))}
      <circle cx={x(ip)} cy={y(pico.leads)} r={2.5} fill={cor} />
      <text x={Math.min(x(ip), w - 60)} y={y(pico.leads) - 4} className="eixo">{`pico ${pico.leads} em ${fmtData(pico.data)}`}</text>
    </svg>
  );
}
