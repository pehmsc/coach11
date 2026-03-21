"use client";

import { useEffect, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { format, addDays, subDays, parseISO, isToday } from "date-fns";
import { pt } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import {
  getPresencePromptState,
  type PresencePromptState,
} from "@/lib/events/presence-window";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Save,
  ChevronLeft,
  ChevronRight,
  Clock3,
} from "lucide-react";
import { ApiFetchError, apiFetch } from "@/lib/http/apiFetch";
import { useMeContext } from "@/lib/hooks/useMeContext";
import { queryKeys } from "@/lib/query/keys";
import type { Player, AgeGroup, AttendanceStatus } from "@/types/database";

type AttendanceState = Record<string, AttendanceStatus>;

interface AttendanceApiSession {
  id: string;
  status?: string;
  session_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
}

interface AttendanceApiResponse {
  success?: boolean;
  linked?: boolean;
  noSession?: boolean;
  ageGroup?: AgeGroup | null;
  players?: Player[];
  session?: AttendanceApiSession | null;
  attendance?: Record<string, AttendanceStatus>;
  presencePromptState?: PresencePromptState;
  sessionStatus?: string | null;
  error?: string;
}

const VALID_STATUSES: AttendanceStatus[] = ["present", "late", "absent", "injured"];

function isValidStatus(value: unknown): value is AttendanceStatus {
  return typeof value === "string" && VALID_STATUSES.includes(value as AttendanceStatus);
}

function normalizeDateParam(value: string | null): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : format(new Date(), "yyyy-MM-dd");
}

export default function AttendancePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const meContextQuery = useMeContext();
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const [selectedDate, setSelectedDate] = useState(() =>
    normalizeDateParam(searchParams.get("date")),
  );

  const [saved, setSaved] = useState(false);
  const [noSession, setNoSession] = useState(false);
  const [sessionClosed, setSessionClosed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [ageGroup, setAgeGroup] = useState<AgeGroup | null>(null);
  const [attendance, setAttendance] = useState<AttendanceState>({});
  const [initialAttendance, setInitialAttendance] = useState<AttendanceState>({});
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [presencePromptState, setPresencePromptState] =
    useState<PresencePromptState>("hidden");
  const canManageClosedAttendance = meContextQuery.data?.canManageStaff === true;

  const attendanceQuery = useQuery({
    queryKey: queryKeys.attendance.today(selectedDate),
    queryFn: () =>
      apiFetch<AttendanceApiResponse>(`/api/attendance/today?date=${selectedDate}`),
  });

  const saveAttendanceMutation = useMutation({
    mutationFn: (params: {
      sessionId: string;
      attendance: AttendanceState;
      finalize: boolean;
    }) =>
      apiFetch<AttendanceApiResponse>("/api/attendance/today", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      }),
  });

  const dateLabel = isToday(parseISO(selectedDate))
    ? "Hoje"
    : format(parseISO(selectedDate), "EEEE, d 'de' MMMM", { locale: pt });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const payload = attendanceQuery.data;
    if (!payload) return;

    setError(null);

    if (!payload?.linked) {
      setError(
        payload?.error ||
          "Não foi possível identificar o escalão desta conta para marcar presenças.",
      );
      setPlayers([]);
      setAgeGroup(null);
      setSessionId(null);
      setNoSession(true);
      setSessionClosed(false);
      setPresencePromptState("hidden");
      setInitialAttendance({});
      return;
    }

    const incomingPlayers = Array.isArray(payload.players) ? payload.players : [];
    const incomingAttendance =
      payload.attendance && typeof payload.attendance === "object"
        ? payload.attendance
        : {};

    setPlayers(incomingPlayers);
    setAgeGroup(payload.ageGroup ?? null);
    setSessionId(payload.session?.id ?? null);
    setNoSession(Boolean(payload.noSession) || !payload.session);
    setSessionClosed(payload.session?.status === "completed");
    setPresencePromptState(
      payload.presencePromptState ||
        getPresencePromptState(
          payload.session?.session_date,
          payload.session?.start_time,
          payload.session?.end_time,
          payload.session?.status ?? null,
        ),
    );

    const nextAttendance: AttendanceState = {};
    incomingPlayers.forEach((player) => {
      const status = incomingAttendance[player.id];
      nextAttendance[player.id] = isValidStatus(status) ? status : "present";
    });
    setAttendance(nextAttendance);
    setInitialAttendance(nextAttendance);
  }, [attendanceQuery.data]);

  useEffect(() => {
    if (!attendanceQuery.error || attendanceQuery.data) return;
    const message =
      attendanceQuery.error instanceof ApiFetchError
        ? attendanceQuery.error.message
        : "Erro de ligação ao carregar presenças.";
    setError(message);
    setPlayers([]);
    setAgeGroup(null);
    setSessionId(null);
    setNoSession(true);
    setSessionClosed(false);
    setPresencePromptState("hidden");
    setInitialAttendance({});
  }, [attendanceQuery.error, attendanceQuery.data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const loading = attendanceQuery.isPending && !attendanceQuery.data;

  function goToPrevDay() {
    setSaved(false);
    setSelectedDate((d) => format(subDays(parseISO(d), 1), "yyyy-MM-dd"));
  }

  function goToNextDay() {
    setSaved(false);
    setSelectedDate((d) => format(addDays(parseISO(d), 1), "yyyy-MM-dd"));
  }

  function toggleAttendance(playerId: string) {
    if (sessionClosed && !canManageClosedAttendance) {
      return;
    }

    setAttendance((prev) => {
      const current = prev[playerId] ?? "present";
      const cycle: Record<AttendanceStatus, AttendanceStatus> = {
        present: "late",
        late: "absent",
        absent: "injured",
        injured: "present",
      };
      return { ...prev, [playerId]: cycle[current] };
    });
    setSaved(false);
  }

  async function handleSave() {
    if (!sessionId || (sessionClosed && !canManageClosedAttendance)) return;
    setError(null);
    const finalize = !sessionClosed && presencePromptState === "close";

    try {
      const payload = await saveAttendanceMutation.mutateAsync({
        sessionId,
        attendance,
        finalize,
      });
      if (!payload?.success) {
        setError(payload?.error || "Erro ao guardar presenças.");
        return;
      }

      setSaved(true);
      const isCompleted = payload.sessionStatus === "completed";
      setSessionClosed(isCompleted);
      setPresencePromptState(isCompleted ? "closed" : "mark");
      setInitialAttendance(attendance);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.attendance.today(selectedDate),
      });
      toast.success("Presenças guardadas com sucesso");
      router.push("/dashboard");
    } catch (mutationError) {
      const message =
        mutationError instanceof ApiFetchError
          ? mutationError.message
          : "Erro de ligação ao guardar presenças.";
      setError(message);
    }
  }

  const counts = players.reduce(
    (acc, player) => {
      const status = attendance[player.id] ?? "present";
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    { present: 0, late: 0, absent: 0, injured: 0 } as Record<AttendanceStatus, number>,
  );

  const statusConfig = {
    present: {
      icon: <CheckCircle2 size={28} className="text-emerald-500 flex-shrink-0" />,
      bg: "bg-white border-emerald-200",
      label: "Presente",
      labelColor: "text-emerald-600",
    },
    late: {
      icon: <Clock3 size={28} className="text-amber-500 flex-shrink-0" />,
      bg: "bg-amber-50 border-amber-200",
      label: "Atrasado",
      labelColor: "text-amber-700",
    },
    absent: {
      icon: <XCircle size={28} className="text-red-500 flex-shrink-0" />,
      bg: "bg-red-50 border-red-200",
      label: "Ausente",
      labelColor: "text-red-600",
    },
    injured: {
      icon: <AlertCircle size={28} className="text-orange-500 flex-shrink-0" />,
      bg: "bg-orange-50 border-orange-200",
      label: "Lesionado",
      labelColor: "text-orange-600",
    },
  };
  const isClosingWindow = !sessionClosed && presencePromptState === "close";
  const hasAttendanceChanges = players.some((player) => {
    const current = attendance[player.id] ?? "present";
    const baseline = initialAttendance[player.id] ?? "present";
    return current !== baseline;
  });
  const saving = saveAttendanceMutation.isPending;
  const saveDisabled =
    saving || (sessionClosed && !canManageClosedAttendance);

  // ── Header de navegação de datas ──
  const dateNav = (
    <div className="flex items-center justify-between mb-5">
      <button
        onClick={goToPrevDay}
        className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
        aria-label="Dia anterior"
      >
        <ChevronLeft size={20} className="text-slate-600" />
      </button>

      <div className="text-center flex-1">
        <p className="text-slate-500 text-xs uppercase tracking-wide">Presenças</p>
        <p className="font-bold text-slate-900 capitalize">{dateLabel}</p>
        {ageGroup && (
          <p className="text-slate-400 text-xs">
            {ageGroup.name} · {ageGroup.club_name}
          </p>
        )}
      </div>

      <button
        onClick={goToNextDay}
        disabled={selectedDate >= todayStr}
        className="p-2 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Próximo dia"
      >
        <ChevronRight size={20} className="text-slate-600" />
      </button>
    </div>
  );

  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-lg mx-auto">
        {dateNav}
        <div className="flex items-center justify-center min-h-[30vh]">
          <p className="text-slate-500">A carregar...</p>
        </div>
      </div>
    );
  }

  if (!ageGroup) {
    if (error) {
      return (
        <div className="p-4 md:p-8 max-w-lg mx-auto">
          {dateNav}
          <div className="text-center py-10">
            <AlertCircle className="mx-auto mb-4 text-red-400" size={48} />
            <h2 className="font-semibold text-slate-700 mb-2">Erro ao carregar presenças</h2>
            <p className="text-slate-500 text-sm">{error}</p>
          </div>
        </div>
      );
    }

    return (
      <div className="p-4 md:p-8 max-w-lg mx-auto">
        {dateNav}
        <div className="text-center py-10">
          <CheckCircle2 className="mx-auto mb-4 text-slate-300" size={48} />
          <h2 className="font-semibold text-slate-700 mb-2">Escalão não configurado</h2>
          <p className="text-slate-500 text-sm">
            Configura o escalão em Configurações antes de registar presenças.
          </p>
        </div>
      </div>
    );
  }

  if (noSession) {
    return (
      <div className="p-4 md:p-8 max-w-lg mx-auto">
        {dateNav}
        <div className="text-center py-10">
          <CheckCircle2 className="mx-auto mb-4 text-slate-300" size={48} />
          <h2 className="font-semibold text-slate-700 mb-2">Sem treino neste dia</h2>
          <p className="text-slate-500 text-sm">
            Não existe sessão de treino para este dia no calendário.
          </p>
        </div>
      </div>
    );
  }

  if (players.length === 0) {
    return (
      <div className="p-4 md:p-8 max-w-lg mx-auto">
        {dateNav}
        <div className="text-center py-10">
          <CheckCircle2 className="mx-auto mb-4 text-slate-300" size={48} />
          <h2 className="font-semibold text-slate-700 mb-2">Sem atletas activos</h2>
          <p className="text-slate-500 text-sm">
            Adiciona atletas ao plantel para registar presenças.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-lg mx-auto">
      {dateNav}

      {/* Badge histórico */}
      {sessionClosed && (
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 mb-4">
          <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
          <p className="text-sm text-slate-600">
            {canManageClosedAttendance
              ? "Treino fechado — podes corrigir e guardar novamente."
              : "Treino fechado — só o coordenador pode corrigir presenças."}
          </p>
        </div>
      )}

      {!sessionClosed && presencePromptState === "mark" && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5">
          <Clock3 size={16} className="text-emerald-600 flex-shrink-0" />
          <p className="text-sm text-emerald-800">
            A janela para marcar presenças já abriu. Podes guardar o registo sem fechar o treino.
          </p>
        </div>
      )}

      {isClosingWindow && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5">
          <AlertCircle size={16} className="text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-800">
            O treino chegou à hora de fecho. Revê as presenças e confirma para fechar.
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg border border-red-200 mb-4">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mb-4 sm:grid-cols-4">
        <div className="bg-emerald-50 rounded-xl p-3 text-center">
          <p className="text-3xl font-bold text-emerald-600">{counts.present}</p>
          <p className="text-xs text-emerald-700 font-medium mt-0.5">Presentes</p>
        </div>
        <div className="bg-amber-50 rounded-xl p-3 text-center">
          <p className="text-3xl font-bold text-amber-600">{counts.late}</p>
          <p className="text-xs text-amber-700 font-medium mt-0.5">Atrasados</p>
        </div>
        <div className="bg-red-50 rounded-xl p-3 text-center">
          <p className="text-3xl font-bold text-red-500">{counts.absent}</p>
          <p className="text-xs text-red-700 font-medium mt-0.5">Ausentes</p>
        </div>
        <div className="bg-orange-50 rounded-xl p-3 text-center">
          <p className="text-3xl font-bold text-orange-500">{counts.injured}</p>
          <p className="text-xs text-orange-700 font-medium mt-0.5">Lesionados</p>
        </div>
      </div>

      <p className="text-xs text-slate-400 mb-3 px-1">
        Toca num atleta para alternar estado: Presente → Atrasado → Ausente → Lesionado
      </p>

      <div className="space-y-2 pb-32 md:pb-6">
        {players.map((player) => {
          const status = attendance[player.id] ?? "present";
          const config = statusConfig[status];

          return (
            <button
              key={player.id}
              onClick={() => toggleAttendance(player.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all active:scale-[0.98] text-left ${config.bg}`}
              disabled={sessionClosed && !canManageClosedAttendance}
            >
              <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-bold text-slate-500">
                  {player.first_name[0]}
                  {player.last_name[0]}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900 truncate">
                  {player.first_name} {player.last_name}
                </p>
                {player.preferred_position && (
                  <p className="text-xs text-slate-400">{player.preferred_position}</p>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-xs font-medium hidden sm:block ${config.labelColor}`}>
                  {config.label}
                </span>
                {config.icon}
              </div>
            </button>
          );
        })}
      </div>

      <div className="fixed bottom-[calc(var(--mobile-footer-height)+env(safe-area-inset-bottom))] left-0 right-0 z-40 border-t border-slate-200 bg-white p-4 shadow-lg md:relative md:bottom-auto md:left-auto md:right-auto md:border-0 md:bg-transparent md:p-0 md:shadow-none md:mt-4">
        <div className="max-w-lg mx-auto">
          {saved && (
            <div className="bg-emerald-50 border-2 border-emerald-200 text-emerald-700 p-3 rounded-xl text-center font-semibold text-sm mb-2">
              ✓ {sessionClosed ? "Atualizado" : "Presenças guardadas"}! ({counts.present} presentes · {counts.late} atrasados · {counts.absent} ausentes ·{" "}
              {counts.injured} lesionados)
            </div>
          )}
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-lg">
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-12 flex-1"
                onClick={() => router.back()}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                className={`h-12 flex-1 text-base font-semibold ${
                  isClosingWindow
                    ? "bg-amber-600 hover:bg-amber-700"
                    : "bg-emerald-600 hover:bg-emerald-700"
                }`}
                disabled={saveDisabled}
              >
                <Save size={18} className="mr-2" />
                {saving
                  ? "A guardar..."
                  : hasAttendanceChanges
                    ? "Guardar alterações"
                    : "Confirmar presenças"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
