import { Check, X, ChevronLeft, Goal, Square, RefreshCw } from "lucide-react";

/**
 * Mockup do produto para o hero — renderizado em DOM (server component, zero JS).
 *
 * Decisao de craft: em vez de screenshots PNG usamos uma recriacao fiel dos
 * ecras reais. Vantagens: nitido em qualquer DPI, anima melhor, e — critico —
 * RGPD-safe por construcao (todos os atletas sao ficticios; nenhum dado de
 * menor real e exposto). O frame esta pronto a aceitar <Image> reais no futuro.
 *
 * Dois ecras provam a tese field-first: (1) presencas em segundos e
 * (2) eventos live durante o jogo.
 */

// ── Status bar minimal (so realismo) ──
function StatusBar() {
  return (
    <div className="flex items-center justify-between px-5 pt-3 pb-1 text-[11px] font-semibold text-slate-900">
      <span>9:41</span>
      <div className="flex items-center gap-1">
        <span className="flex items-end gap-[2px]" aria-hidden>
          <span className="h-1.5 w-[3px] rounded-sm bg-slate-900" />
          <span className="h-2 w-[3px] rounded-sm bg-slate-900" />
          <span className="h-2.5 w-[3px] rounded-sm bg-slate-900" />
          <span className="h-3 w-[3px] rounded-sm bg-slate-300" />
        </span>
        <span className="ml-1 h-3 w-6 rounded-[3px] border border-slate-900/70 p-[2px]" aria-hidden>
          <span className="block h-full w-2/3 rounded-[1px] bg-slate-900" />
        </span>
      </div>
    </div>
  );
}

// ── Avatar de iniciais (sem fotos — dados ficticios) ──
function Avatar({ initials, hue }: { initials: string; hue: string }) {
  return (
    <div
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${hue}`}
    >
      {initials}
    </div>
  );
}

// ── Frame do telemovel ──
function Phone({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-[2.4rem] border border-white/10 bg-slate-900 p-2 shadow-2xl shadow-emerald-950/40 ring-1 ring-black/40 ${className}`}
    >
      <div className="relative overflow-hidden rounded-[1.9rem] bg-white">
        {/* Dynamic island */}
        <div className="absolute left-1/2 top-2 z-10 h-4 w-20 -translate-x-1/2 rounded-full bg-slate-900" />
        {children}
      </div>
    </div>
  );
}

// ── Ecra 1: Presencas ──
const PLAYERS = [
  { name: "Joao M.", initials: "JM", hue: "bg-emerald-500", present: true },
  { name: "Rui C.", initials: "RC", hue: "bg-sky-500", present: true },
  { name: "Diogo S.", initials: "DS", hue: "bg-violet-500", present: true },
  { name: "Martim P.", initials: "MP", hue: "bg-amber-500", present: false },
  { name: "Tomas L.", initials: "TL", hue: "bg-rose-500", present: true },
];

function AttendanceScreen() {
  return (
    <div className="flex h-full flex-col">
      <StatusBar />
      {/* App header */}
      <div className="px-5 pt-2 pb-3">
        <div className="flex items-center gap-2 text-slate-400">
          <ChevronLeft className="h-4 w-4" />
          <span className="text-[11px] font-medium uppercase tracking-wide">
            Treino · Ter 14 Jun
          </span>
        </div>
        <h3 className="mt-1 text-[17px] font-bold text-slate-900">Presenças</h3>
        <p className="text-[12px] text-slate-500">Sub-13 · Infantis A</p>
      </div>

      {/* Summary chip */}
      <div className="mx-5 mb-3 flex items-center justify-between rounded-xl bg-emerald-50 px-3.5 py-2">
        <span className="text-[12px] font-semibold text-emerald-700">
          18 / 20 presentes
        </span>
        <span className="h-1.5 w-20 overflow-hidden rounded-full bg-emerald-100">
          <span className="block h-full w-[90%] rounded-full bg-emerald-500" />
        </span>
      </div>

      {/* Player rows */}
      <div className="flex-1 space-y-1.5 px-3">
        {PLAYERS.map((p) => (
          <div
            key={p.name}
            className="flex items-center gap-3 rounded-xl px-2 py-2"
          >
            <Avatar initials={p.initials} hue={p.hue} />
            <span className="flex-1 text-[13px] font-medium text-slate-800">
              {p.name}
            </span>
            {p.present ? (
              <span className="flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-semibold text-white">
                <Check className="h-3 w-3" strokeWidth={3} />
                Presente
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                <X className="h-3 w-3" strokeWidth={3} />
                Falta
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Sticky save */}
      <div className="px-3 pb-4 pt-2">
        <div className="flex items-center justify-center rounded-xl bg-emerald-600 py-3 text-[13px] font-bold text-white shadow-lg shadow-emerald-600/30">
          Guardar presenças
        </div>
      </div>
    </div>
  );
}

// ── Ecra 2: Jogo live ──
const EVENTS = [
  { icon: Goal, min: "64'", text: "Golo · Joao M.", tint: "text-emerald-600 bg-emerald-50" },
  { icon: Square, min: "58'", text: "Amarelo · Rui C.", tint: "text-amber-600 bg-amber-50" },
  { icon: RefreshCw, min: "52'", text: "Entra Diogo S.", tint: "text-sky-600 bg-sky-50" },
  { icon: Goal, min: "31'", text: "Golo · Martim P.", tint: "text-emerald-600 bg-emerald-50" },
];

function LiveScreen() {
  return (
    <div className="flex h-full flex-col">
      <StatusBar />
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-2 pb-3">
        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-rose-500">
          <span className="h-2 w-2 rounded-full bg-rose-500" />
          Ao vivo
        </span>
        <span className="text-[12px] font-semibold text-slate-500">2ª parte</span>
      </div>

      {/* Scoreboard */}
      <div className="mx-5 mb-3 rounded-2xl bg-slate-900 px-4 py-3 text-white">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold">EFB</span>
          <span className="text-2xl font-extrabold tabular-nums">3 — 1</span>
          <span className="text-[13px] font-semibold text-white/70">Olivais</span>
        </div>
        <div className="mt-1 text-center text-[11px] font-medium text-emerald-400">
          68&apos; · a decorrer
        </div>
      </div>

      {/* Event feed */}
      <div className="flex-1 space-y-1.5 px-4">
        {EVENTS.map((e, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${e.tint}`}>
              <e.icon className="h-3.5 w-3.5" />
            </span>
            <span className="w-7 text-[12px] font-bold tabular-nums text-slate-400">
              {e.min}
            </span>
            <span className="text-[12px] font-medium text-slate-700">{e.text}</span>
          </div>
        ))}
      </div>

      {/* Action row — registo em 2 toques */}
      <div className="grid grid-cols-3 gap-2 px-3 pb-4 pt-2">
        <div className="flex items-center justify-center rounded-xl bg-emerald-600 py-2.5 text-[12px] font-bold text-white">
          Golo
        </div>
        <div className="flex items-center justify-center rounded-xl bg-slate-100 py-2.5 text-[12px] font-bold text-slate-700">
          Cartão
        </div>
        <div className="flex items-center justify-center rounded-xl bg-slate-100 py-2.5 text-[12px] font-bold text-slate-700">
          Subst.
        </div>
      </div>
    </div>
  );
}

export function HeroDevice() {
  return (
    <div
      aria-hidden
      className="relative mx-auto w-full max-w-[300px] lg:max-w-[360px]"
    >
      {/* Telemovel secundario (jogo live) — atras/direita, so em ecras largos */}
      <div className="absolute -right-28 top-10 hidden w-[230px] rotate-[6deg] lg:block">
        <Phone className="opacity-95">
          <div className="h-[470px]">
            <LiveScreen />
          </div>
        </Phone>
      </div>

      {/* Telemovel principal (presencas) — a frente */}
      <div className="relative z-10">
        <Phone>
          <div className="h-[520px]">
            <AttendanceScreen />
          </div>
        </Phone>
      </div>
    </div>
  );
}
