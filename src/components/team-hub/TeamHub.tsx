"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import {
  Users,
  ClipboardList,
  Swords,
  Trophy,
  Dumbbell,
  BarChart3,
  BookOpen,
  Sword,
  Pencil,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";

type AgeGroupSummary = {
  id: string;
  name: string;
  age_level: string | null;
  tactical_system: string | null;
  football_format: string | null;
  club_id: string | null;
  club_name: string | null;
  club_short_name: string | null;
};

type Counts = {
  players: number;
  staff: number;
  games: { total: number; scheduled: number; completed: number };
  trainings: { total: number; scheduled: number; completed: number };
  opponents: number;
  competitions: number;
};

type Kpis = {
  recent_form: ("V" | "E" | "D")[];
  goals: { scored: number; conceded: number; diff: number };
  attendance_rate: number | null;
};

type NextEvent = {
  type: "game" | "training";
  id: string;
  title: string;
  datetime: string;
  location: string | null;
} | null;

type UpcomingItem = {
  type: "game" | "training";
  id: string;
  title: string;
  datetime: string;
};

type HubData = {
  success: boolean;
  ageGroup: AgeGroupSummary;
  counts: Counts;
  kpis: Kpis;
  next_event: NextEvent;
  upcoming_calendar: UpcomingItem[];
};

type InternalTab = "atletas" | "staff" | "planeamento" | "adversarios" | "configuracoes";

interface Props {
  ageGroupId: string;
  /** Callback para mudar para uma tab interna existente (Staff, Adversários, etc). */
  onChangeTab: (tab: InternalTab) => void;
}

type FetchState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: HubData };

export function TeamHub({ ageGroupId, onChangeTab }: Props) {
  const [state, setState] = useState<FetchState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/age-groups/${ageGroupId}/hub-summary`, {
      cache: "no-store",
    })
      .then((res) => res.json().catch(() => null))
      .then((payload) => {
        if (cancelled) return;
        if (!payload?.success) {
          setState({
            status: "error",
            message: payload?.error || "Erro ao carregar resumo.",
          });
          return;
        }
        setState({ status: "success", data: payload as HubData });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ status: "error", message: "Erro de ligação." });
      });

    return () => {
      cancelled = true;
    };
  }, [ageGroupId]);

  const handleEditPlaceholder = useCallback(() => {
    toast.info("Em breve — modo edição do escalão estará disponível.");
  }, []);

  if (state.status === "loading") return <HubSkeleton />;
  if (state.status === "error") return <HubError message={state.message} />;

  const { ageGroup, counts, kpis, next_event, upcoming_calendar } = state.data;
  const initial = (ageGroup.name || "?").charAt(0).toUpperCase();
  const subtitleParts = [
    ageGroup.age_level,
    ageGroup.tactical_system,
  ].filter((v): v is string => !!v);

  return (
    <div className="space-y-4">
      {/* Header com Editar placeholder */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-sky-500 to-blue-700 text-white flex items-center justify-center font-bold text-lg flex-shrink-0">
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-slate-900 truncate">
            {ageGroup.name}
          </h2>
          <p className="text-xs text-slate-500 truncate">
            {subtitleParts.length > 0
              ? subtitleParts.join(" · ")
              : "Sem metadados"}
          </p>
        </div>
        <button
          type="button"
          onClick={handleEditPlaceholder}
          className="px-3 py-1.5 text-sm border border-slate-300 rounded-md hover:bg-slate-50 inline-flex items-center gap-1.5 text-slate-700 flex-shrink-0"
        >
          <Pencil size={13} />
          <span className="hidden sm:inline">Editar</span>
        </button>
      </div>

      {/* Quick stats — 3 KPIs */}
      <div className="grid grid-cols-3 gap-px bg-slate-200 rounded-lg overflow-hidden">
        <KpiCell
          label="Assiduidade"
          value={
            kpis.attendance_rate !== null
              ? `${kpis.attendance_rate.toFixed(1)}%`
              : "—"
          }
          meta="treinos"
        />
        <KpiCell
          label="Forma"
          value={
            kpis.recent_form.length > 0 ? kpis.recent_form.join(" ") : "—"
          }
          meta={`últimos ${kpis.recent_form.length || 0}`}
          valueClassName="text-emerald-600 tracking-wider"
        />
        <KpiCell
          label="Golos"
          value={
            kpis.goals.diff >= 0 ? `+${kpis.goals.diff}` : `${kpis.goals.diff}`
          }
          meta={`${kpis.goals.scored} / ${kpis.goals.conceded}`}
          valueClassName={
            kpis.goals.diff > 0
              ? "text-emerald-600"
              : kpis.goals.diff < 0
                ? "text-rose-600"
                : "text-slate-900"
          }
        />
      </div>

      {/* Próximo evento destacado */}
      {next_event && <NextEventCard event={next_event} />}

      {/* Grid de cards de entrada */}
      <div className="grid grid-cols-2 gap-2">
        <HubCard
          icon={<Users size={16} />}
          label="Plantel"
          value={counts.players}
          meta="atletas activos"
          href={`/players?ageGroupId=${ageGroupId}`}
        />
        <HubCard
          icon={<ClipboardList size={16} />}
          label="Staff"
          value={counts.staff}
          meta="treinadores"
          onClick={() => onChangeTab("staff")}
        />
        <HubCard
          icon={<Sword size={16} />}
          label="Jogos"
          value={counts.games.total}
          meta={`${counts.games.completed} concluídos`}
          href={`/games?team=${ageGroupId}`}
        />
        <HubCard
          icon={<Dumbbell size={16} />}
          label="Treinos"
          value={counts.trainings.completed}
          meta={`de ${counts.trainings.total} totais`}
          href={`/trainings?team=${ageGroupId}`}
        />
        <HubCard
          icon={<Trophy size={16} />}
          label="Competições"
          value={counts.competitions}
          meta="associadas"
          href="/competitions"
        />
        <HubCard
          icon={<Swords size={16} />}
          label="Adversários"
          value={counts.opponents}
          meta="registados"
          onClick={() => onChangeTab("adversarios")}
        />
        <HubCard
          icon={<BookOpen size={16} />}
          label="Exercícios"
          value="—"
          meta="biblioteca"
          href="/exercises"
        />
        <HubCard
          icon={<BarChart3 size={16} />}
          label="Estatísticas"
          value="★"
          meta="insights"
          href="/statistics"
        />
      </div>

      {/* Upcoming calendar */}
      {upcoming_calendar.length > 0 && (
        <UpcomingCalendarCard items={upcoming_calendar} />
      )}
    </div>
  );
}

function KpiCell({
  label,
  value,
  meta,
  valueClassName,
}: {
  label: string;
  value: string;
  meta?: string;
  valueClassName?: string;
}) {
  return (
    <div className="bg-white p-3 text-center">
      <div className="text-[10px] uppercase text-slate-500 tracking-wider mb-1">
        {label}
      </div>
      <div
        className={`text-sm font-semibold ${valueClassName ?? "text-slate-900"}`}
      >
        {value}
      </div>
      {meta && <div className="text-[11px] text-slate-400 mt-0.5">{meta}</div>}
    </div>
  );
}

function HubCard({
  icon,
  label,
  value,
  meta,
  href,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  meta: string;
  href?: string;
  onClick?: () => void;
}) {
  const inner = (
    <div className="bg-white p-3.5 rounded-lg border border-slate-200 hover:border-slate-400 hover:shadow-sm transition-all flex flex-col gap-0.5 h-full cursor-pointer">
      <div className="w-7 h-7 rounded-md bg-slate-100 flex items-center justify-center text-slate-600 mb-1">
        {icon}
      </div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-bold text-slate-900 leading-tight">
        {value}
      </div>
      <div className="text-[11px] text-slate-400">{meta}</div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left w-full"
    >
      {inner}
    </button>
  );
}

function NextEventCard({ event }: { event: NonNullable<NextEvent> }) {
  let dateObj: Date | null = null;
  try {
    dateObj = parseISO(event.datetime);
  } catch {
    dateObj = null;
  }
  const day = dateObj ? dateObj.getDate() : "?";
  const dayLabel = dateObj
    ? format(dateObj, "EEE", { locale: pt }).toUpperCase().replace(".", "")
    : "";
  const timeLabel = dateObj ? format(dateObj, "HH:mm") : "";

  return (
    <Link
      href={event.type === "game" ? `/games/${event.id}` : `/trainings/${event.id}`}
      className="block bg-white p-3.5 rounded-lg border border-slate-200 hover:border-slate-400 transition-all"
    >
      <div className="flex items-center gap-3">
        <div className="bg-slate-900 text-white px-2 py-2 rounded text-center min-w-[52px] flex-shrink-0">
          <div className="text-lg font-bold leading-none">{day}</div>
          <div className="text-[10px] uppercase opacity-70 mt-0.5">
            {dayLabel}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase text-slate-500 tracking-wider">
            Próximo · {event.type === "game" ? "Jogo" : "Treino"}
          </div>
          <div className="text-sm font-semibold text-slate-900 truncate">
            {event.title}
          </div>
          {(timeLabel || event.location) && (
            <div className="text-[11px] text-slate-500 truncate">
              {[timeLabel, event.location].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
        <ArrowRight size={16} className="text-slate-400 flex-shrink-0" />
      </div>
    </Link>
  );
}

function UpcomingCalendarCard({ items }: { items: UpcomingItem[] }) {
  return (
    <div className="bg-white p-3.5 rounded-lg border border-slate-200">
      <div className="text-[10px] uppercase text-slate-500 tracking-wider mb-2">
        Próximos eventos
      </div>
      <div className="space-y-1.5">
        {items.map((it) => {
          let dt: Date | null = null;
          try {
            dt = parseISO(it.datetime);
          } catch {
            dt = null;
          }
          const label = dt
            ? format(dt, "d MMM · HH:mm", { locale: pt })
            : it.datetime;
          return (
            <Link
              key={`${it.type}-${it.id}`}
              href={
                it.type === "game"
                  ? `/games/${it.id}`
                  : `/trainings/${it.id}`
              }
              className="flex items-center gap-2 text-xs hover:bg-slate-50 rounded px-1 py-1 -mx-1"
            >
              <span className="text-slate-500 w-24 flex-shrink-0 truncate">
                {label}
              </span>
              <span className="text-slate-900 truncate">{it.title}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function HubSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-14 bg-slate-100 rounded-lg" />
      <div className="grid grid-cols-3 gap-px bg-slate-200 rounded-lg overflow-hidden">
        <div className="h-16 bg-white" />
        <div className="h-16 bg-white" />
        <div className="h-16 bg-white" />
      </div>
      <div className="h-20 bg-slate-100 rounded-lg" />
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 bg-slate-100 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function HubError({ message }: { message: string }) {
  return (
    <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-sm">
      Não foi possível carregar o resumo do escalão.
      <span className="block mt-1 text-xs opacity-70">{message}</span>
    </div>
  );
}
