"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  to: number;
  suffix?: string;
  durationMs?: number;
  className?: string;
}

/**
 * Count-up ao entrar na viewport. IntersectionObserver dispara um loop de
 * requestAnimationFrame (NAO setInterval; NAO setState sincrono no corpo do
 * effect). Respeita prefers-reduced-motion e degrada para o valor final se
 * nao houver IO. tabular-nums + bloco fixo evitam layout shift.
 */
export function CountUp({ to, suffix = "", durationMs = 1100, className }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  // Valor final por defeito: SSR, no-JS e reduced-motion mostram-no sem setState
  // sincrono no effect (evita o lint react-hooks/set-state-in-effect e CLS).
  const [value, setValue] = useState(to);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver === "undefined") return; // ja mostra `to`

    let raf = 0;
    let started = false;

    const run = (start: number) => {
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / durationMs);
        const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
        setValue(Math.round(eased * to));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    const obs = new IntersectionObserver(
      (entries) => {
        // setState aqui (callback do observer) e o padrao recomendado, nao o
        // anti-padrao de setState sincrono no corpo do effect.
        if (entries[0]?.isIntersecting && !started) {
          started = true;
          setValue(0);
          run(performance.now());
          obs.disconnect();
        }
      },
      { threshold: 0.6 },
    );
    obs.observe(el);

    return () => {
      obs.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to, durationMs]);

  return (
    <span ref={ref} className={className}>
      <span className="tabular-nums">{value}</span>
      {suffix}
    </span>
  );
}
