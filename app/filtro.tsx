"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

const PRESETS: [string, string][] = [
  ["hoje", "Hoje"], ["ontem", "Ontem"], ["7d", "7 dias"], ["30d", "30 dias"],
  ["mes", "Este mês"], ["mes-passado", "Mês passado"], ["tudo", "Tudo"],
];

/** Seletor de período: atalhos e datas personalizadas. Fica no endereço (?p= ou ?de=&ate=). */
export function FiltroPeriodo({ preset, de, ate, min, max }: { preset: string; de: string; ate: string; min: string; max: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [carregando, iniciar] = useTransition();
  const [aberto, setAberto] = useState(preset === "personalizado");
  const [d1, setD1] = useState(de);
  const [d2, setD2] = useState(ate);

  const ir = (q: Record<string, string>) => {
    const u = new URLSearchParams(params.toString());
    for (const k of ["p", "de", "ate"]) u.delete(k);
    for (const [k, v] of Object.entries(q)) if (v) u.set(k, v);
    iniciar(() => router.push(u.size ? `?${u}` : "?", { scroll: false }));
  };

  return (
    <div className={`filtro ${carregando ? "carregando" : ""}`} role="group" aria-label="Período do relatório">
      <div className="filtro-atalhos">
        {PRESETS.map(([id, nome]) => (
          <button key={id} type="button" aria-pressed={preset === id} className={preset === id ? "ativo" : ""}
            onClick={() => { setAberto(false); ir(id === "tudo" ? {} : { p: id }); }}>{nome}</button>
        ))}
        <button type="button" aria-pressed={preset === "personalizado"} className={preset === "personalizado" || aberto ? "ativo" : ""}
          onClick={() => setAberto(a => !a)}>Datas…</button>
      </div>
      {aberto && (
        <form className="filtro-datas" onSubmit={e => { e.preventDefault(); ir({ p: "personalizado", de: d1, ate: d2 }); }}>
          <label>De <input type="date" value={d1} min={min} max={max} onChange={e => setD1(e.target.value)} required /></label>
          <label>Até <input type="date" value={d2} min={min} max={max} onChange={e => setD2(e.target.value)} required /></label>
          <button type="submit" className="aplicar">Aplicar</button>
        </form>
      )}
    </div>
  );
}
