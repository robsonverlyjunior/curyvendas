"use client";

import { useRef, useState, type ReactNode } from "react";

/**
 * Mostra uma dica ao passar o mouse (ou tocar) em qualquer elemento do
 * gráfico que tenha data-dica. A dica fica sempre dentro do gráfico.
 */
export function ComDica({ children }: { children: ReactNode }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [dica, setDica] = useState<{ texto: string[]; x: number; y: number } | null>(null);

  const mover = (e: React.PointerEvent) => {
    const alvo = (e.target as Element).closest("[data-dica]");
    const el = caixa.current;
    if (!alvo || !el) { setDica(null); return; }
    const r = el.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - r.left, 70), r.width - 70);
    const y = Math.max(e.clientY - r.top - 12, 0);
    setDica({ texto: (alvo.getAttribute("data-dica") ?? "").split("\n"), x, y });
  };

  return (
    <div ref={caixa} className="com-dica" onPointerMove={mover} onPointerDown={mover} onPointerLeave={() => setDica(null)}>
      {children}
      {dica && (
        <div className="dica" style={{ left: dica.x, top: dica.y }} role="status">
          <strong>{dica.texto[0]}</strong>
          {dica.texto.slice(1).map((t, i) => <span key={i}>{t}</span>)}
        </div>
      )}
    </div>
  );
}
