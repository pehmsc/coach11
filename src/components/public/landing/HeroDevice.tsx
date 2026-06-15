import {
  Check,
  X,
  ChevronLeft,
  Goal,
  Square,
  RefreshCw,
  Bell,
} from "lucide-react";

/**
 * Mockup do produto para o hero — iPhone 15 Pro fiel (server component, zero JS).
 *
 * Medidas reais respeitadas (NAO inventadas):
 * - Ecra com viewport 393 x 852 CSS px -> racio exacto via `aspect-[393/852]`.
 * - Cantos continuos: raio do corpo ≈ 0.14 x largura (iPhone 15 Pro).
 * - Bezels finos e UNIFORMES nos 4 lados (padding igual a toda a volta).
 * - Dynamic Island: pilula ~31% da largura / ~3.9% da altura, ~1.5% abaixo do topo.
 * - Moldura em titanio escuro (gradiente) com anel fino a sugerir o metal.
 *
 * SLOT DO SCREENSHOT REAL: ver comentario dentro de <PhoneScreen>. Trocar a
 * recriacao DOM por <Image> e UMA linha. RGPD: o screenshot real nao pode
 * conter dados de menores reais (nomes/fotos) — usar conta demo ou desfocar.
 * Enquanto nao ha screenshot, mostramos a recriacao DOM com atletas ficticios.
 */

// ── Status bar (realismo; DI fica por cima, centrada) ──
function StatusBar() {
  return (
    <div className="flex items-center justify-between px-6 pt-3 text-[11px] font-semibold text-slate-900">
      <span>9:41</span>
      <div className="flex items-center gap-1.5">
        <span className="flex items-end gap-[2px]" aria-hidden>
          <span className="h-1.5 w-[3px] rounded-sm bg-slate-900" />
          <span className="h-2 w-[3px] rounded-sm bg-slate-900" />
          <span className="h-2.5 w-[3px] rounded-sm bg-slate-900" />
          <span className="h-3 w-[3px] rounded-sm bg-slate-300" />
        </span>
        <span
          className="ml-0.5 flex h-3 w-6 items-center rounded-[3px] border border-slate-900/70 p-[2px]"
          aria-hidden
        >
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

// ── Moldura iPhone 15 Pro ──
function PhoneScreen({ children }: { children: React.ReactNode }) {
  return (
    // Corpo em titanio: anel de metal (ring) + gradiente + sombra de profundidade.
    <div className="rounded-[2.6rem] bg-gradient-to-b from-slate-600 via-slate-800 to-slate-700 p-[2px] shadow-[0_40px_90px_-30px_rgba(2,6,23,0.85),0_18px_45px_-25px_rgba(16,185,129,0.25)] ring-1 ring-white/15">
      {/* Bezel preto uniforme */}
      <div className="rounded-[2.5rem] bg-black p-[9px]">
        {/* Ecra — racio exacto 393:852 */}
        <div className="relative aspect-[393/852] overflow-hidden rounded-[1.95rem] bg-white">
          {/* Dynamic Island */}
          <div className="absolute left-1/2 top-[1.5%] z-20 flex h-[3.9%] w-[31%] -translate-x-1/2 items-center justify-end rounded-full bg-black pr-2">
            <span className="h-1 w-1 rounded-full bg-slate-700" aria-hidden />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Ecra 1: Presencas (preenche o ecra) ──
const PLAYERS = [
  { name: "Joao M.", initials: "JM", hue: "bg-emerald-500", present: true },
  { name: "Rui C.", initials: "RC", hue: "bg-sky-500", present: true },
  { name: "Diogo S.", initials: "DS", hue: "bg-violet-500", present: true },
  { name: "Martim P.", initials: "MP", hue: "bg-amber-500", present: false },
  { name: "Tomas L.", initials: "TL", hue: "bg-rose-500", present: true },
  { name: "Afonso R.", initials: "AR", hue: "bg-indigo-500", present: true },
  { name: "Goncalo F.", initials: "GF", hue: "bg-teal-500", present: true },
];

function AttendanceScreen() {
  return (
    <div className="absolute inset-0 flex flex-col">
      {/*  SLOT DO SCREENSHOT REAL — trocar este bloco por UMA linha:
           <Image src="/screenshots/presencas.png" alt="" fill priority className="object-cover" />
           (garantir que nao expoe dados de menores reais) */}
      <StatusBar />
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-center gap-1.5 text-slate-400">
          <ChevronLeft className="h-4 w-4" />
          <span className="text-[11px] font-medium uppercase tracking-wide">
            Treino · Ter 14 Jun
          </span>
        </div>
        <h3 className="mt-1.5 text-[19px] font-bold text-slate-900">Presenças</h3>
        <p className="text-[12px] text-slate-500">Sub-13 · Infantis A</p>
      </div>

      <div className="mx-5 mb-3 flex items-center justify-between rounded-xl bg-emerald-50 px-3.5 py-2.5">
        <span className="text-[12px] font-semibold text-emerald-700">
          18 / 20 presentes
        </span>
        <span className="h-1.5 w-20 overflow-hidden rounded-full bg-emerald-100">
          <span className="block h-full w-[90%] rounded-full bg-emerald-500" />
        </span>
      </div>

      <div className="flex-1 space-y-1 px-3">
        {PLAYERS.map((p) => (
          <div key={p.name} className="flex items-center gap-3 rounded-xl px-2 py-1.5">
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

      <div className="px-3 pb-7 pt-2">
        <div className="flex items-center justify-center rounded-xl bg-emerald-600 py-3.5 text-[13px] font-bold text-white shadow-lg shadow-emerald-600/30">
          Guardar presenças
        </div>
      </div>
    </div>
  );
}

// ── Ecra 2: Jogo live (telemovel secundario) ──
const EVENTS = [
  { icon: Goal, min: "64'", text: "Golo · Joao M.", tint: "text-emerald-600 bg-emerald-50" },
  { icon: Square, min: "58'", text: "Amarelo · Rui C.", tint: "text-amber-600 bg-amber-50" },
  { icon: RefreshCw, min: "52'", text: "Entra Diogo S.", tint: "text-sky-600 bg-sky-50" },
  { icon: Goal, min: "31'", text: "Golo · Martim P.", tint: "text-emerald-600 bg-emerald-50" },
  { icon: Goal, min: "12'", text: "Golo · Tomas L.", tint: "text-emerald-600 bg-emerald-50" },
];

function LiveScreen() {
  return (
    <div className="absolute inset-0 flex flex-col">
      <StatusBar />
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-rose-500">
          <span className="h-2 w-2 rounded-full bg-rose-500" />
          Ao vivo
        </span>
        <span className="text-[12px] font-semibold text-slate-500">2ª parte</span>
      </div>

      <div className="mx-5 mb-3 rounded-2xl bg-slate-900 px-4 py-3.5 text-white">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold">EFB</span>
          <span className="text-2xl font-extrabold tabular-nums">3 — 1</span>
          <span className="text-[13px] font-semibold text-white/70">Olivais</span>
        </div>
        <div className="mt-1 text-center text-[11px] font-medium text-emerald-400">
          68&apos; · a decorrer
        </div>
      </div>

      <div className="flex-1 space-y-2 px-4">
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

      <div className="grid grid-cols-3 gap-2 px-3 pb-7 pt-2">
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
    <div aria-hidden className="relative mx-auto w-[250px] sm:w-[272px] lg:w-[290px]">
      {/* Telemovel secundario (jogo live) — espreita atras/direita, so em xl.
          Offset e mais pequeno; NUNCA tapa o principal (z menor, dimmed). */}
      <div className="absolute -right-[44%] top-16 z-0 hidden w-[78%] rotate-[5deg] opacity-90 xl:block">
        <PhoneScreen>
          <LiveScreen />
        </PhoneScreen>
      </div>

      {/* Telemovel principal (presencas) — sempre totalmente visivel */}
      <div className="relative z-10">
        <PhoneScreen>
          <AttendanceScreen />
        </PhoneScreen>
      </div>

      {/* Chip flutuante de evento — vida subtil, float gentil (md+).
          Reforca a tese "registo live" sem um segundo telemovel apertado. */}
      <div className="c11-float absolute -left-6 top-[34%] z-20 hidden rounded-2xl border border-white/10 bg-slate-900/90 px-3.5 py-2.5 shadow-xl shadow-black/40 backdrop-blur md:block">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
            <Goal className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <div className="text-[12px] font-bold text-white">Golo · 64&apos;</div>
            <div className="text-[10px] text-white/55">Registado em 2 toques</div>
          </div>
        </div>
      </div>

      {/* Chip flutuante de notificacao push (md+) */}
      <div className="c11-float-delayed absolute -bottom-5 right-2 z-20 hidden rounded-2xl border border-white/10 bg-slate-900/90 px-3.5 py-2.5 shadow-xl shadow-black/40 backdrop-blur md:block">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/20 text-sky-400">
            <Bell className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <div className="text-[12px] font-bold text-white">Convocatória enviada</div>
            <div className="text-[10px] text-white/55">18 atletas notificados</div>
          </div>
        </div>
      </div>
    </div>
  );
}
