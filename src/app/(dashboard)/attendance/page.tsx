"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, AlertCircle, Save } from "lucide-react";
import type { Player, AgeGroup } from "@/types/database";

type AttendanceStatus = "present" | "absent" | "injured";
type AttendanceState = Record<string, AttendanceStatus>;

interface AttendanceApiSession {
  id: string;
}

interface AttendanceApiResponse {
  success?: boolean;
  linked?: boolean;
  noSession?: boolean;
  ageGroup?: AgeGroup | null;
  players?: Player[];
  session?: AttendanceApiSession | null;
  attendance?: Record<string, AttendanceStatus>;
  error?: string;
}

const VALID_STATUSES: AttendanceStatus[] = ["present", "absent", "injured"];

function isValidStatus(value: unknown): value is AttendanceStatus {
  return typeof value === "string" && VALID_STATUSES.includes(value as AttendanceStatus);
}

export default function AttendancePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [noSession, setNoSession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [ageGroup, setAgeGroup] = useState<AgeGroup | null>(null);
  const [attendance, setAttendance] = useState<AttendanceState>({});
  const [sessionId, setSessionId] = useState<string | null>(null);

  const today = format(new Date(), "EEEE, d 'de' MMMM", { locale: pt });
  const todayDate = format(new Date(), "yyyy-MM-dd");

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/attendance/today?date=${todayDate}`, {
        cache: "no-store",
        credentials: "include",
      });
      const payload = (await res.json().catch(() => ({}))) as AttendanceApiResponse;

      if (!res.ok) {
        setError(payload?.error || "Erro ao carregar presenças.");
        setPlayers([]);
        setAgeGroup(null);
        setSessionId(null);
        setNoSession(true);
        return;
      }

      if (!payload?.linked) {
        setPlayers([]);
        setAgeGroup(null);
        setSessionId(null);
        setNoSession(true);
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

      const initialAttendance: AttendanceState = {};
      incomingPlayers.forEach((player) => {
        const status = incomingAttendance[player.id];
        initialAttendance[player.id] = isValidStatus(status) ? status : "present";
      });
      setAttendance(initialAttendance);
    } catch {
      setError("Erro de ligação ao carregar presenças.");
      setPlayers([]);
      setAgeGroup(null);
      setSessionId(null);
      setNoSession(true);
    } finally {
      setLoading(false);
    }
  }

  function toggleAttendance(playerId: string) {
    setAttendance((prev) => {
      const current = prev[playerId] ?? "present";
      const cycle: Record<AttendanceStatus, AttendanceStatus> = {
        present: "absent",
        absent: "injured",
        injured: "present",
      };
      return { ...prev, [playerId]: cycle[current] };
    });
    setSaved(false);
  }

  async function handleSave() {
    if (!sessionId) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/attendance/today", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sessionId,
          attendance,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as AttendanceApiResponse;

      if (!res.ok || !payload?.success) {
        setError(payload?.error || "Erro ao guardar presenças.");
        setSaving(false);
        return;
      }

      setSaved(true);
    } catch {
      setError("Erro de ligação ao guardar presenças.");
    } finally {
      setSaving(false);
    }
  }

  const counts = players.reduce(
    (acc, player) => {
      const status = attendance[player.id] ?? "present";
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    { present: 0, absent: 0, injured: 0 } as Record<AttendanceStatus, number>,
  );

  const statusConfig = {
    present: {
      icon: (
        <CheckCircle2 size={28} className="text-emerald-500 flex-shrink-0" />
      ),
      bg: "bg-white border-emerald-200",
      label: "Presente",
      labelColor: "text-emerald-600",
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

  if (loading) {
    return (
      <div className="p-4 md:p-8 flex items-center justify-center min-h-[50vh]">
        <p className="text-slate-500">A carregar...</p>
      </div>
    );
  }

  if (!ageGroup) {
    return (
      <div className="p-4 md:p-8 text-center py-16">
        <CheckCircle2 className="mx-auto mb-4 text-slate-300" size={48} />
        <h2 className="font-semibold text-slate-700 mb-2">
          Escalão não configurado
        </h2>
        <p className="text-slate-500 text-sm">
          Configura o escalão em Configurações antes de registar presenças.
        </p>
      </div>
    );
  }

  if (noSession) {
    return (
      <div className="p-4 md:p-8 text-center py-16">
        <CheckCircle2 className="mx-auto mb-4 text-slate-300" size={48} />
        <h2 className="font-semibold text-slate-700 mb-2">Sem treino hoje</h2>
        <p className="text-slate-500 text-sm">
          Não existe sessão de treino para hoje no calendário.
        </p>
      </div>
    );
  }

  if (players.length === 0) {
    return (
      <div className="p-4 md:p-8 text-center py-16">
        <CheckCircle2 className="mx-auto mb-4 text-slate-300" size={48} />
        <h2 className="font-semibold text-slate-700 mb-2">
          Sem atletas activos
        </h2>
        <p className="text-slate-500 text-sm">
          Adiciona atletas ao plantel para registar presenças.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-lg mx-auto">
      <div className="mb-5">
        <p className="text-slate-500 text-sm capitalize">{today}</p>
        <h1 className="text-2xl font-bold text-slate-900">Presenças</h1>
        <p className="text-slate-400 text-sm">
          {ageGroup.name} · {ageGroup.club_name}
        </p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg border border-red-200 mb-4">
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-emerald-50 rounded-xl p-3 text-center">
          <p className="text-3xl font-bold text-emerald-600">
            {counts.present}
          </p>
          <p className="text-xs text-emerald-700 font-medium mt-0.5">
            Presentes
          </p>
        </div>
        <div className="bg-red-50 rounded-xl p-3 text-center">
          <p className="text-3xl font-bold text-red-500">{counts.absent}</p>
          <p className="text-xs text-red-700 font-medium mt-0.5">Ausentes</p>
        </div>
        <div className="bg-orange-50 rounded-xl p-3 text-center">
          <p className="text-3xl font-bold text-orange-500">{counts.injured}</p>
          <p className="text-xs text-orange-700 font-medium mt-0.5">
            Lesionados
          </p>
        </div>
      </div>

      <p className="text-xs text-slate-400 mb-3 px-1">
        Toca num atleta para alternar estado: Presente → Ausente → Lesionado
      </p>

      <div className="space-y-2 mb-6">
        {players.map((player) => {
          const status = attendance[player.id] ?? "present";
          const config = statusConfig[status];

          return (
            <button
              key={player.id}
              onClick={() => toggleAttendance(player.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all active:scale-[0.98] text-left ${config.bg}`}
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
                  <p className="text-xs text-slate-400">
                    {player.preferred_position}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <span
                  className={`text-xs font-medium hidden sm:block ${config.labelColor}`}
                >
                  {config.label}
                </span>
                {config.icon}
              </div>
            </button>
          );
        })}
      </div>

      <div className="sticky bottom-20 md:bottom-4">
        {saved ? (
          <div className="bg-emerald-50 border-2 border-emerald-200 text-emerald-700 p-4 rounded-xl text-center font-semibold">
            ✓ Presenças guardadas! ({counts.present} presentes · {counts.absent}{" "}
            ausentes · {counts.injured} lesionados)
          </div>
        ) : (
          <Button
            onClick={handleSave}
            className="w-full bg-emerald-600 hover:bg-emerald-700 h-14 text-base font-semibold rounded-xl shadow-lg"
            disabled={saving}
          >
            <Save size={20} className="mr-2" />
            {saving
              ? "A guardar..."
              : `Guardar — ${counts.present} presentes · ${counts.absent} ausentes`}
          </Button>
        )}
      </div>
    </div>
  );
}

