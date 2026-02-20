"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, AlertCircle, Save } from "lucide-react";
import type { Player, AgeGroup } from "@/types/database";

type AttendanceStatus = "present" | "absent" | "injured";
type AttendanceState = Record<string, AttendanceStatus>;

export default function AttendancePage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [noSession, setNoSession] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [ageGroup, setAgeGroup] = useState<AgeGroup | null>(null);
  const [attendance, setAttendance] = useState<AttendanceState>({});
  const [sessionId, setSessionId] = useState<string | null>(null);

  const today = format(new Date(), "EEEE, d 'de' MMMM", { locale: pt });
  const todayDate = format(new Date(), "yyyy-MM-dd");

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // Buscar escalão e primeira equipa
    const { data: ag } = await supabase
      .from("age_groups")
      .select("*, teams(*)")
      .eq("coordinator_id", user.id)
      .single();

    if (!ag) {
      setLoading(false);
      return;
    }
    setAgeGroup(ag);

    const firstTeam = ag.teams?.[0];
    if (!firstTeam) {
      setLoading(false);
      return;
    }
    // Buscar todos os atletas ACTIVOS do escalão
    const { data: playersData } = await supabase
      .from("players")
      .select("*")
      .eq("age_group_id", ag.id)
      .eq("status", "active")
      .order("last_name");

    const activePlayers = playersData || [];
    setPlayers(activePlayers);

    // Procurar sessão de hoje — consulta por age_group_id para ser consistente com o calendário
    const { data: existingSession } = await supabase
      .from("training_sessions")
      .select("id")
      .eq("age_group_id", ag.id)
      .eq("session_date", todayDate)
      .maybeSingle();

    if (!existingSession) {
      // Criar sessão para hoje com age_group_id (consistente com o calendário)
      const { data: newSession } = await supabase
        .from("training_sessions")
        .insert({
          age_group_id: ag.id,
          team_id: firstTeam.id,
          session_date: todayDate,
          start_time: "18:00",
          status: "scheduled",
        })
        .select()
        .single();

      if (!newSession) {
        setNoSession(true);
        setLoading(false);
        return;
      }
      setSessionId(newSession.id);
    } else {
      setSessionId(existingSession.id);
    }

    // Buscar presenças já guardadas
    const sessionIdToUse = existingSession?.id;
    if (sessionIdToUse) {
      const { data: existingAttendance } = await supabase
        .from("training_attendance")
        .select("player_id, status")
        .eq("training_session_id", sessionIdToUse);

      const initialAttendance: AttendanceState = {};
      activePlayers.forEach((player) => {
        const saved = existingAttendance?.find(
          (a) => a.player_id === player.id,
        );
        initialAttendance[player.id] = saved
          ? (saved.status as AttendanceStatus)
          : "present";
      });
      setAttendance(initialAttendance);
    } else {
      // Sessão nova — todos presentes por defeito
      const initialAttendance: AttendanceState = {};
      activePlayers.forEach((player) => {
        initialAttendance[player.id] = "present";
      });
      setAttendance(initialAttendance);
    }

    setLoading(false);
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

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const records = Object.entries(attendance).map(([player_id, status]) => ({
      training_session_id: sessionId,
      player_id,
      status,
      marked_by: user?.id,
      marked_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("training_attendance")
      .upsert(records, { onConflict: "training_session_id,player_id" });

    if (!error) {
      await supabase
        .from("training_sessions")
        .update({ status: "completed" })
        .eq("id", sessionId);
      setSaved(true);
    }

    setSaving(false);
  }

  // Contadores — calculados directamente do estado actual
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
        <h2 className="font-semibold text-slate-700 mb-2">Erro ao criar sessão</h2>
        <p className="text-slate-500 text-sm">
          Não foi possível criar a sessão de treino. Tenta novamente.
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
      {/* Header */}
      <div className="mb-5">
        <p className="text-slate-500 text-sm capitalize">{today}</p>
        <h1 className="text-2xl font-bold text-slate-900">Presenças</h1>
        <p className="text-slate-400 text-sm">
          {ageGroup.name} · {ageGroup.club_name}
        </p>
      </div>

      {/* Contadores */}
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

      {/* Legenda */}
      <p className="text-xs text-slate-400 mb-3 px-1">
        Toca num atleta para alternar estado: Presente → Ausente → Lesionado
      </p>

      {/* Lista */}
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
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-bold text-slate-500">
                  {player.first_name[0]}
                  {player.last_name[0]}
                </span>
              </div>

              {/* Nome */}
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

              {/* Estado */}
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

      {/* Botão Guardar */}
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
