"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, XCircle, AlertCircle, Save } from "lucide-react";
import type { Player, Team, AgeGroup } from "@/types/database";

type AttendanceStatus = "present" | "absent" | "injured";

interface AttendanceState {
  [playerId: string]: AttendanceStatus;
}

export default function AttendancePage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [attendance, setAttendance] = useState<AttendanceState>({});
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [ageGroup, setAgeGroup] = useState<AgeGroup | null>(null);

  const today = format(new Date(), "EEEE, d 'de' MMMM", { locale: pt });
  const todayDate = format(new Date(), "yyyy-MM-dd");

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedTeamId && players.length > 0) {
      loadOrCreateSession();
    }
  }, [selectedTeamId]);

  async function loadData() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: ag } = await supabase
      .from("age_groups")
      .select("*, teams(*)")
      .eq("coordinator_id", user.id)
      .single();

    if (ag) {
      setAgeGroup(ag);
      setTeams(ag.teams || []);

      // Selecionar primeira equipa por defeito
      if (ag.teams && ag.teams.length > 0) {
        setSelectedTeamId(ag.teams[0].id);
      }

      // Buscar atletas
      const { data: playersData } = await supabase
        .from("players")
        .select("*")
        .eq("age_group_id", ag.id)
        .eq("status", "active")
        .order("last_name");

      setPlayers(playersData || []);
    }

    setLoading(false);
  }

  async function loadOrCreateSession() {
    // Verificar se já existe sessão para hoje nesta equipa
    const { data: existingSession } = await supabase
      .from("training_sessions")
      .select("id")
      .eq("team_id", selectedTeamId)
      .eq("session_date", todayDate)
      .single();

    let currentSessionId: string;

    if (existingSession) {
      currentSessionId = existingSession.id;
    } else {
      // Criar sessão para hoje
      const { data: newSession } = await supabase
        .from("training_sessions")
        .insert({
          team_id: selectedTeamId,
          session_date: todayDate,
          start_time: "18:00",
          status: "scheduled",
        })
        .select()
        .single();

      if (!newSession) return;
      currentSessionId = newSession.id;
    }

    setSessionId(currentSessionId);

    // Buscar presenças existentes
    const { data: existingAttendance } = await supabase
      .from("training_attendance")
      .select("player_id, status")
      .eq("training_session_id", currentSessionId);

    // Construir estado inicial: todos presentes por defeito
    const initialAttendance: AttendanceState = {};
    players.forEach((player) => {
      const existing = existingAttendance?.find(
        (a) => a.player_id === player.id,
      );
      initialAttendance[player.id] = existing
        ? (existing.status as AttendanceStatus)
        : "present";
    });

    setAttendance(initialAttendance);
  }

  function toggleAttendance(playerId: string) {
    setAttendance((prev) => {
      const current = prev[playerId] || "present";
      const next: Record<AttendanceStatus, AttendanceStatus> = {
        present: "absent",
        absent: "injured",
        injured: "present",
      };
      return { ...prev, [playerId]: next[current] };
    });
    setSaved(false);
  }

  async function handleSave() {
    if (!sessionId) return;
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Upsert de todos os registos de presença
    const records = Object.entries(attendance).map(([player_id, status]) => ({
      training_session_id: sessionId,
      player_id,
      status,
      marked_by: user?.id,
      marked_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("training_attendance")
      .upsert(records, {
        onConflict: "training_session_id,player_id",
      });

    if (!error) {
      // Marcar sessão como completada
      await supabase
        .from("training_sessions")
        .update({ status: "completed" })
        .eq("id", sessionId);

      setSaved(true);
    }

    setSaving(false);
  }

  const counts = {
    present: Object.values(attendance).filter((s) => s === "present").length,
    absent: Object.values(attendance).filter((s) => s === "absent").length,
    injured: Object.values(attendance).filter((s) => s === "injured").length,
  };

  if (loading) {
    return (
      <div className="p-4 md:p-8">
        <p className="text-slate-500">A carregar...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-4">
        <p className="text-slate-500 text-sm capitalize">{today}</p>
        <h1 className="text-2xl font-bold text-slate-900">Presenças</h1>
      </div>

      {/* Selector de equipa */}
      {teams.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {teams.map((team) => (
            <button
              key={team.id}
              onClick={() => setSelectedTeamId(team.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                selectedTeamId === team.id
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {team.name}
            </button>
          ))}
        </div>
      )}

      {/* Contador */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-emerald-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-emerald-600">
            {counts.present}
          </p>
          <p className="text-xs text-emerald-700">Presentes</p>
        </div>
        <div className="bg-red-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-red-500">{counts.absent}</p>
          <p className="text-xs text-red-700">Ausentes</p>
        </div>
        <div className="bg-orange-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-orange-500">{counts.injured}</p>
          <p className="text-xs text-orange-700">Lesionados</p>
        </div>
      </div>

      {/* Legenda */}
      <div className="flex gap-4 text-xs text-slate-500 mb-3 px-1">
        <span className="flex items-center gap-1">
          <CheckCircle2 size={12} className="text-emerald-500" /> Presente
        </span>
        <span className="flex items-center gap-1">
          <XCircle size={12} className="text-red-500" /> Ausente
        </span>
        <span className="flex items-center gap-1">
          <AlertCircle size={12} className="text-orange-500" /> Lesionado
        </span>
        <span className="text-slate-400">· Toca para alternar</span>
      </div>

      {/* Lista de atletas */}
      <div className="space-y-2 mb-6">
        {players.map((player) => {
          const status = attendance[player.id] || "present";

          const statusConfig = {
            present: {
              icon: <CheckCircle2 size={28} className="text-emerald-500" />,
              bg: "bg-white border-emerald-200",
              label: "Presente",
              labelColor: "text-emerald-600",
            },
            absent: {
              icon: <XCircle size={28} className="text-red-500" />,
              bg: "bg-red-50 border-red-200",
              label: "Ausente",
              labelColor: "text-red-600",
            },
            injured: {
              icon: <AlertCircle size={28} className="text-orange-500" />,
              bg: "bg-orange-50 border-orange-200",
              label: "Lesionado",
              labelColor: "text-orange-600",
            },
          };

          const config = statusConfig[status];

          return (
            <button
              key={player.id}
              onClick={() => toggleAttendance(player.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all active:scale-[0.98] ${config.bg}`}
            >
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-semibold text-slate-500">
                  {player.first_name[0]}
                  {player.last_name[0]}
                </span>
              </div>

              {/* Nome */}
              <div className="flex-1 text-left">
                <p className="font-semibold text-slate-900">
                  {player.first_name} {player.last_name}
                </p>
                {player.preferred_position && (
                  <p className="text-xs text-slate-400">
                    {player.preferred_position}
                  </p>
                )}
              </div>

              {/* Estado */}
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium ${config.labelColor}`}>
                  {config.label}
                </span>
                {config.icon}
              </div>
            </button>
          );
        })}
      </div>

      {/* Botão guardar — fixo no fundo em mobile */}
      <div className="sticky bottom-20 md:static md:bottom-auto">
        {saved ? (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-4 rounded-xl text-center font-medium">
            ✓ Presenças guardadas!
          </div>
        ) : (
          <Button
            onClick={handleSave}
            className="w-full bg-emerald-600 hover:bg-emerald-700 h-14 text-base font-semibold"
            disabled={saving || players.length === 0}
          >
            <Save size={20} className="mr-2" />
            {saving ? "A guardar..." : `Guardar Presenças`}
          </Button>
        )}
      </div>
    </div>
  );
}
