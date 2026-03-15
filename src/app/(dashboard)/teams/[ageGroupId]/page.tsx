"use client";

import { useState, useEffect, useMemo, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  AlertTriangle,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Users,
  Trophy,
  Settings,
  ClipboardList,
  LayoutGrid,
} from "lucide-react";
import { toast } from "sonner";
import { PublicSharePanel } from "@/components/team/PublicSharePanel";
import type { AgeGroup, Player } from "@/types/database";

const TACTICAL_SYSTEMS = [
  "4-3-3", "4-4-2", "4-2-3-1", "4-1-4-1", "4-5-1",
  "3-5-2", "3-4-3", "5-3-2", "5-4-1",
  "3-2-3 (Fut9)", "3-3-2 (Fut9)", "3-4-1 (Fut9)", "2-5-1 (Fut9)", "2-4-2 (Fut9)", "4-3-1 (Fut9)",
  "1-4-1 (Fut7)", "2-3-1 (Fut7)", "3-1-2 (Fut7)",
];

type Tab = "geral" | "atletas" | "staff" | "planeamento" | "configuracoes";

interface StaffMember {
  id: string;
  profile_id: string;
  role: string;
  profiles: { full_name: string; email?: string | null } | null;
}

interface GameRow {
  id: string;
  scheduled_at?: string | null;
  opponent_name?: string | null;
  is_home?: boolean | null;
  status: string;
  competition_id?: string | null;
  title?: string | null;
}

interface TrainingRow {
  id: string;
  session_date: string;
  start_time: string;
  end_time?: string | null;
  title?: string | null;
  status: string;
}

interface AttendanceStat {
  status: string;
  count: number;
}

type PageParams = { ageGroupId: string };

function PieChart({
  slices,
}: {
  slices: { color: string; pct: number; label: string; count: number }[];
}) {
  const radius = 42;
  const cx = 50;
  const cy = 50;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const filtered = slices.filter((s) => s.pct > 0);
  const paths = filtered.reduce<{ d: string; color: string; key: number }[]>(
    (acc, slice, i) => {
      const cum = acc.reduce((s, _, j) => s + filtered[j].pct, 0);
      const startAngle = cum * 3.6 - 90;
      const endAngle = (cum + slice.pct) * 3.6 - 90;
      const x1 = cx + radius * Math.cos(toRad(startAngle));
      const y1 = cy + radius * Math.sin(toRad(startAngle));
      const x2 = cx + radius * Math.cos(toRad(endAngle));
      const y2 = cy + radius * Math.sin(toRad(endAngle));
      const largeArc = slice.pct > 50 ? 1 : 0;
      acc.push({ d: `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`, color: slice.color, key: i });
      return acc;
    },
    [],
  );

  return (
    <svg viewBox="0 0 100 100" className="w-24 h-24">
      {paths.map((p) => (
        <path key={p.key} d={p.d} fill={p.color} />
      ))}
      {slices.every((s) => s.pct === 0) && (
        <circle cx={cx} cy={cy} r={radius} fill="#e2e8f0" />
      )}
    </svg>
  );
}

function getWeekDates(referenceDate: Date): Date[] {
  const monday = new Date(referenceDate);
  const day = monday.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  monday.setDate(monday.getDate() + diff);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

const DAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export default function TeamDetailPage({ params }: { params: Promise<PageParams> }) {
  const { ageGroupId } = use(params);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [tab, setTab] = useState<Tab>("geral");
  const [loading, setLoading] = useState(true);

  // Data
  const [ageGroup, setAgeGroup] = useState<AgeGroup | null>(null);
  const [, setTeamId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [weekTrainings, setWeekTrainings] = useState<TrainingRow[]>([]);
  const [weekGames, setWeekGames] = useState<GameRow[]>([]);
  const [upcomingGames, setUpcomingGames] = useState<GameRow[]>([]);
  const [attendanceStats, setAttendanceStats] = useState<AttendanceStat[]>([]);
  const [gameResults, setGameResults] = useState({ wins: 0, draws: 0, losses: 0, total: 0 });

  // Week navigation
  const [weekOffset, setWeekOffset] = useState(0);
  const today = useMemo(() => new Date(), []);
  const weekDates = useMemo(() => {
    const ref = new Date(today);
    ref.setDate(today.getDate() + weekOffset * 7);
    return getWeekDates(ref);
  }, [today, weekOffset]);

  // Configurações tab state
  const [tacticalSystem, setTacticalSystem] = useState("");
  const [savingTactical, setSavingTactical] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  // User's other age groups for dropdown
  const [allTeams, setAllTeams] = useState<Array<{ id: string; name: string; club_name: string }>>([]);

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ageGroupId]);

  useEffect(() => {
    void loadWeekEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ageGroupId, weekDates]);

  async function loadAll() {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    // Profile & permissions
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_super_coordinator")
      .eq("id", user.id)
      .maybeSingle();

    // Age group
    const { data: ag } = await supabase
      .from("age_groups")
      .select("*")
      .eq("id", ageGroupId)
      .maybeSingle();

    if (!ag) { setLoading(false); return; }
    setAgeGroup(ag as AgeGroup);
    setTacticalSystem(ag.tactical_system || "");

    const isCoord = profile?.role === "coordinator" || profile?.is_super_coordinator;
    const isOwnAg = ag.coordinator_id === user.id;
    const { data: staffLink } = await supabase
      .from("age_group_staff")
      .select("role")
      .eq("age_group_id", ageGroupId)
      .eq("profile_id", user.id)
      .maybeSingle();

    const isPrincipal = staffLink?.role === "coach";
    setCanManage(isCoord || isOwnAg || isPrincipal || !!profile?.is_super_coordinator);

    // Team id
    const { data: teamRow } = await supabase
      .from("teams")
      .select("id")
      .eq("age_group_id", ageGroupId)
      .limit(1)
      .maybeSingle();
    setTeamId(teamRow?.id ?? null);

    // Players
    const { data: playersData } = await supabase
      .from("players")
      .select("*")
      .eq("age_group_id", ageGroupId)
      .order("first_name");
    setPlayers((playersData ?? []) as Player[]);

    // Staff
    const { data: staffData } = await supabase
      .from("age_group_staff")
      .select("id, profile_id, role, profiles(full_name, email)")
      .eq("age_group_id", ageGroupId);
    setStaff((staffData ?? []) as unknown as StaffMember[]);

    // Upcoming games (next 5)
    const { data: upGames } = await supabase
      .from("games")
      .select("id, scheduled_at, opponent_name, is_home, status, competition_id, title")
      .eq("age_group_id", ageGroupId)
      .in("status", ["scheduled", "live"])
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at")
      .limit(5);
    setUpcomingGames((upGames ?? []) as GameRow[]);

    // Attendance stats (all time for this age group via teams)
    if (teamRow?.id) {
      const { data: sessions } = await supabase
        .from("training_sessions")
        .select("id")
        .eq("age_group_id", ageGroupId);
      const sessionIds = (sessions ?? []).map((s) => s.id);
      if (sessionIds.length > 0) {
        const { data: att } = await supabase
          .from("training_attendance")
          .select("status")
          .in("session_id", sessionIds);
        if (att) {
          const counts: Record<string, number> = {};
          att.forEach((a) => {
            counts[a.status] = (counts[a.status] ?? 0) + 1;
          });
          setAttendanceStats(Object.entries(counts).map(([status, count]) => ({ status, count })));
        }
      }
    }

    // Game results (completed games)
    const { data: completedGames } = await supabase
      .from("games")
      .select("id")
      .eq("age_group_id", ageGroupId)
      .eq("status", "completed");

    const completedIds = (completedGames ?? []).map((g) => g.id);
    if (completedIds.length > 0) {
      const { data: finalStats } = await supabase
        .from("game_final_stats")
        .select("result")
        .in("game_id", completedIds);
      if (finalStats) {
        let wins = 0, draws = 0, losses = 0;
        finalStats.forEach((s) => {
          if (s.result === "win") wins++;
          else if (s.result === "draw") draws++;
          else if (s.result === "loss") losses++;
        });
        setGameResults({ wins, draws, losses, total: finalStats.length });
      }
    }

    // All teams for dropdown
    const { data: coordAgs } = await supabase
      .from("age_groups")
      .select("id, name, club_name")
      .eq("coordinator_id", user.id);
    const { data: staffAgs } = await supabase
      .from("age_group_staff")
      .select("age_group_id, age_groups(id, name, club_name)")
      .eq("profile_id", user.id);
    const staffAgList = (staffAgs ?? [])
      .map((s) => s.age_groups)
      .flat()
      .filter(Boolean) as Array<{ id: string; name: string; club_name: string }>;
    const seen = new Set<string>();
    const merged = [...(coordAgs ?? []), ...staffAgList].filter((a) => {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    });
    setAllTeams(merged);

    setLoading(false);
  }

  async function loadWeekEvents() {
    if (!ageGroupId) return;
    const start = weekDates[0].toISOString().split("T")[0];
    const end = weekDates[6].toISOString().split("T")[0];

    const [{ data: trainings }, { data: games }] = await Promise.all([
      supabase
        .from("training_sessions")
        .select("id, session_date, start_time, end_time, title, status")
        .eq("age_group_id", ageGroupId)
        .gte("session_date", start)
        .lte("session_date", end),
      supabase
        .from("games")
        .select("id, scheduled_at, opponent_name, is_home, status, competition_id, title")
        .eq("age_group_id", ageGroupId)
        .gte("scheduled_at", weekDates[0].toISOString())
        .lte("scheduled_at", new Date(weekDates[6].getTime() + 86399999).toISOString()),
    ]);
    setWeekTrainings((trainings ?? []) as TrainingRow[]);
    setWeekGames((games ?? []) as GameRow[]);
  }

  async function handleTacticalSave(system: string) {
    if (!ageGroup || !canManage) return;
    setSavingTactical(true);
    const { error } = await supabase
      .from("age_groups")
      .update({ tactical_system: system || null })
      .eq("id", ageGroup.id);
    if (error) toast.error("Erro ao guardar sistema.");
    else {
      setTacticalSystem(system);
      toast.success("Sistema táctico guardado");
    }
    setSavingTactical(false);
  }

  async function handleDeleteAgeGroup() {
    if (!ageGroup) return;
    if (deleteConfirmText.trim().toUpperCase() !== "APAGAR ESCALAO") {
      toast.error("Escreve APAGAR ESCALAO para confirmar.");
      return;
    }
    setDeleting(true);
    const res = await fetch("/api/me/age-group", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "DELETE_AGE_GROUP", ageGroupId: ageGroup.id }),
    });
    const payload = await res.json().catch(() => null) as { success?: boolean; error?: string } | null;
    if (!res.ok || !payload?.success) {
      toast.error(payload?.error || "Não foi possível apagar o escalão.");
      setDeleting(false);
      return;
    }
    toast.success("Escalão apagado com sucesso.");
    router.push("/teams");
  }

  if (loading) {
    return (
      <div className="p-4 md:p-8 flex items-center justify-center py-16">
        <Loader2 size={28} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (!ageGroup) {
    return (
      <div className="p-4 md:p-8 max-w-3xl mx-auto">
        <div className="bg-amber-50 text-amber-800 text-sm p-4 rounded-xl border border-amber-200">
          Equipa não encontrada.
        </div>
        <Link href="/teams" className="text-sm text-emerald-600 hover:underline mt-3 inline-block">
          ← Voltar às equipas
        </Link>
      </div>
    );
  }

  // Stats summary
  const activePlayers = players.filter((p) => p.status === "active").length;
  const staffCount = staff.length;

  const TABS: { id: Tab; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
    { id: "geral", label: "Geral", icon: LayoutGrid },
    { id: "atletas", label: `Atletas (${activePlayers})`, icon: Users },
    { id: "staff", label: `Staff (${staffCount})`, icon: Trophy },
    { id: "planeamento", label: "Planeamento", icon: ClipboardList },
    { id: "configuracoes", label: "Configurações", icon: Settings },
  ];

  // Attendance pie data
  const attTotal = attendanceStats.reduce((s, a) => s + a.count, 0);
  const getAttCount = (status: string) =>
    attendanceStats.find((a) => a.status === status)?.count ?? 0;
  const attSlices = [
    { color: "#10b981", label: "Presentes", status: "present", pct: attTotal > 0 ? (getAttCount("present") / attTotal) * 100 : 0, count: getAttCount("present") },
    { color: "#f59e0b", label: "Condicionados", status: "late", pct: attTotal > 0 ? (getAttCount("late") / attTotal) * 100 : 0, count: getAttCount("late") },
    { color: "#ef4444", label: "Ausentes", status: "absent", pct: attTotal > 0 ? (getAttCount("absent") / attTotal) * 100 : 0, count: getAttCount("absent") },
    { color: "#94a3b8", label: "Dispensados", status: "injured", pct: attTotal > 0 ? (getAttCount("injured") / attTotal) * 100 : 0, count: getAttCount("injured") },
  ];
  const gTotal = gameResults.total;
  const gameSlices = [
    { color: "#10b981", label: "Vitórias", pct: gTotal > 0 ? (gameResults.wins / gTotal) * 100 : 0, count: gameResults.wins },
    { color: "#94a3b8", label: "Empates", pct: gTotal > 0 ? (gameResults.draws / gTotal) * 100 : 0, count: gameResults.draws },
    { color: "#ef4444", label: "Derrotas", pct: gTotal > 0 ? (gameResults.losses / gTotal) * 100 : 0, count: gameResults.losses },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/teams" className="text-slate-400 hover:text-slate-600">
              <ChevronLeft size={20} />
            </Link>

            {/* Team switcher */}
            {allTeams.length > 1 ? (
              <Select
                value={ageGroupId}
                onValueChange={(id) => router.push(`/teams/${id}`)}
              >
                <SelectTrigger className="border-0 shadow-none p-0 h-auto text-left font-bold text-slate-900 text-lg focus:ring-0 max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allTeams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} · {t.club_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div>
                <h1 className="font-bold text-slate-900 text-lg leading-tight">{ageGroup.name}</h1>
                <p className="text-xs text-slate-500">{ageGroup.club_name}</p>
              </div>
            )}

            {/* Prev/Next for multi-team */}
            {allTeams.length > 1 && (() => {
              const idx = allTeams.findIndex((t) => t.id === ageGroupId);
              const prev = allTeams[idx - 1];
              const next = allTeams[idx + 1];
              return (
                <div className="flex gap-1 ml-auto">
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={!prev}
                    onClick={() => prev && router.push(`/teams/${prev.id}`)}
                  >
                    <ChevronLeft size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={!next}
                    onClick={() => next && router.push(`/teams/${next.id}`)}
                  >
                    <ChevronRight size={16} />
                  </Button>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-5xl mx-auto px-4 overflow-x-auto">
          <div className="flex gap-0 min-w-max">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  tab === t.id
                    ? "border-emerald-600 text-emerald-700"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                <t.icon size={14} />
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-5">
        {/* Info card (always visible) */}
        <Card className="mb-5">
          <CardContent className="pt-4 pb-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-2 text-sm">
              {[
                ["Desporto", "Futebol"],
                ["Escalão", ageGroup.name],
                ["Época", ageGroup.season],
                ["Tipo", `F${ageGroup.football_format}`],
                ["Sistema Táctico", ageGroup.tactical_system || "—"],
                ["Estado", "Activo"],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs text-slate-400 uppercase tracking-wide">{label}</p>
                  <p className="font-medium text-slate-800 mt-0.5">{value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ───────── TAB: GERAL ───────── */}
        {tab === "geral" && (
          <div className="space-y-5">
            {/* Weekly Calendar */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Calendário semanal</CardTitle>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setWeekOffset((o) => o - 1)}>
                      <ChevronLeft size={16} />
                    </Button>
                    <span className="text-xs text-slate-500 px-1">
                      {weekDates[0].getDate()}/{weekDates[0].getMonth() + 1} –{" "}
                      {weekDates[6].getDate()}/{weekDates[6].getMonth() + 1}
                    </span>
                    <Button variant="ghost" size="icon" onClick={() => setWeekOffset((o) => o + 1)}>
                      <ChevronRight size={16} />
                    </Button>
                    {weekOffset !== 0 && (
                      <Button variant="ghost" size="sm" className="text-xs" onClick={() => setWeekOffset(0)}>
                        Hoje
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-7 gap-1">
                  {weekDates.map((date, i) => {
                    const dateStr = date.toISOString().split("T")[0];
                    const isToday = dateStr === today.toISOString().split("T")[0];
                    const dayTrainings = weekTrainings.filter((t) => t.session_date === dateStr);
                    const dayGames = weekGames.filter((g) => {
                      if (!g.scheduled_at) return false;
                      return g.scheduled_at.startsWith(dateStr);
                    });

                    return (
                      <div
                        key={dateStr}
                        className={`rounded-lg p-1.5 min-h-[80px] ${isToday ? "bg-emerald-50 border border-emerald-200" : "bg-slate-50"}`}
                      >
                        <p className={`text-[10px] font-medium mb-1 ${isToday ? "text-emerald-700" : "text-slate-400"}`}>
                          {DAY_LABELS[i]}
                          <br />
                          <span className={`text-[11px] ${isToday ? "text-emerald-800 font-bold" : "text-slate-600"}`}>
                            {date.getDate()}
                          </span>
                        </p>
                        {dayTrainings.map((t) => (
                          <Link key={t.id} href={`/trainings`}>
                            <div className="text-[9px] bg-emerald-100 text-emerald-800 rounded px-1 py-0.5 mb-0.5 leading-tight truncate">
                              {t.title || "Treino"} {t.start_time?.slice(0, 5)}
                            </div>
                          </Link>
                        ))}
                        {dayGames.map((g) => (
                          <Link key={g.id} href={`/games/${g.id}`}>
                            <div className="text-[9px] bg-blue-100 text-blue-800 rounded px-1 py-0.5 mb-0.5 leading-tight truncate">
                              {g.opponent_name ? (g.is_home ? "Casa" : "Fora") : "Jogo"}
                              {g.scheduled_at ? ` ${new Date(g.scheduled_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}` : ""}
                            </div>
                          </Link>
                        ))}
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-end mt-2">
                  <Link href="/calendar" className="text-xs text-emerald-600 hover:underline">
                    Agenda completa →
                  </Link>
                </div>
              </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 gap-5">
              {/* Microciclo (placeholder) */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Microciclo</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    {[
                      ["Microciclo nº", "—"],
                      ["Início", "—"],
                      ["Fim", "—"],
                      ["Objectivo", "—"],
                      ["Período", "—"],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between">
                        <span className="text-slate-400">{label}</span>
                        <span className="text-slate-600">{value}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-slate-400 mt-3">Planeamento disponível em breve.</p>
                </CardContent>
              </Card>

              {/* Próximos Jogos */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Próximos Jogos</CardTitle>
                </CardHeader>
                <CardContent>
                  {upcomingGames.length === 0 ? (
                    <p className="text-sm text-slate-400">Sem jogos agendados.</p>
                  ) : (
                    <div className="space-y-3">
                      {upcomingGames.map((g) => {
                        const dt = g.scheduled_at ? new Date(g.scheduled_at) : null;
                        return (
                          <Link key={g.id} href={`/games/${g.id}`}>
                            <div className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50 -mx-2">
                              <div
                                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                                  g.is_home
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {g.is_home ? "C" : "F"}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-800 truncate">
                                  {g.opponent_name ?? g.title ?? "—"}
                                </p>
                                {dt && (
                                  <p className="text-xs text-slate-400">
                                    {dt.toLocaleDateString("pt-PT")} ·{" "}
                                    {dt.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
                                  </p>
                                )}
                              </div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                  <div className="mt-3">
                    <Link href="/games" className="text-xs text-emerald-600 hover:underline">
                      Ver todos os jogos →
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Performance */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Performance esta época</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 gap-6">
                  {/* Training attendance */}
                  <div>
                    <p className="text-sm font-medium text-slate-700 mb-3">
                      Treinos · Total: {attTotal}
                    </p>
                    {attTotal === 0 ? (
                      <p className="text-xs text-slate-400">Sem dados de presenças.</p>
                    ) : (
                      <div className="flex items-center gap-4">
                        <PieChart slices={attSlices} />
                        <div className="space-y-1.5">
                          {attSlices.map((s) => (
                            <div key={s.status} className="flex items-center gap-2 text-xs">
                              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                              <span className="text-slate-600">{s.label}</span>
                              <span className="font-semibold text-slate-800">{s.count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Game results */}
                  <div>
                    <p className="text-sm font-medium text-slate-700 mb-3">
                      Jogos · Total: {gTotal}
                    </p>
                    {gTotal === 0 ? (
                      <p className="text-xs text-slate-400">Sem jogos concluídos.</p>
                    ) : (
                      <div className="flex items-center gap-4">
                        <PieChart slices={gameSlices} />
                        <div className="space-y-1.5">
                          {gameSlices.map((s) => (
                            <div key={s.label} className="flex items-center gap-2 text-xs">
                              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                              <span className="text-slate-600">{s.label}</span>
                              <span className="font-semibold text-slate-800">{s.count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick links */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: "Ver jogos", href: "/games" },
                { label: "Ver treinos", href: "/trainings" },
                { label: "Estatísticas", href: "/statistics" },
                { label: "Plantel", href: "/players" },
                { label: "Calendário", href: "/calendar" },
                { label: "Staff", href: "/staff" },
              ].map((link) => (
                <Link key={link.href} href={link.href}>
                  <div className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 transition-colors">
                    {link.label}
                    <ChevronRight size={14} className="text-slate-400" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ───────── TAB: ATLETAS ───────── */}
        {tab === "atletas" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">
                {activePlayers} atletas activos · {players.filter((p) => (p.status as string) === "archived").length} arquivados
              </p>
              <Link href="/players">
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                  Adicionar atleta
                </Button>
              </Link>
            </div>
            {players.length === 0 ? (
              <Card>
                <CardContent className="pt-8 pb-8 text-center text-slate-400 text-sm">
                  Sem atletas neste escalão.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {players.map((p) => (
                  <Link key={p.id} href={`/players/${p.id}`}>
                    <Card className="hover:shadow-sm transition-shadow">
                      <CardContent className="py-3 px-4 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 flex-shrink-0">
                          {p.jersey_number ?? "—"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-800 truncate">
                            {p.first_name} {p.last_name}
                          </p>
                          <p className="text-xs text-slate-400">
                            {p.preferred_position ?? "Sem posição"}
                          </p>
                        </div>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            p.status === "active"
                              ? "bg-emerald-100 text-emerald-700"
                              : p.status === "injured"
                              ? "bg-red-100 text-red-700"
                              : p.status === "suspended"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {p.status === "active"
                            ? "Activo"
                            : p.status === "injured"
                            ? "Lesionado"
                            : p.status === "suspended"
                            ? "Suspenso"
                            : "Arquivado"}
                        </span>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ───────── TAB: STAFF ───────── */}
        {tab === "staff" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{staffCount} membros</p>
              <Link href="/staff">
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                  Gerir staff
                </Button>
              </Link>
            </div>
            {staff.length === 0 ? (
              <Card>
                <CardContent className="pt-8 pb-8 text-center text-slate-400 text-sm">
                  Sem staff neste escalão.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {staff.map((s) => (
                  <Card key={s.id}>
                    <CardContent className="py-3 px-4 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 flex-shrink-0">
                        {s.profiles?.full_name?.slice(0, 2).toUpperCase() ?? "??"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 truncate">
                          {s.profiles?.full_name ?? "—"}
                        </p>
                        <p className="text-xs text-slate-400">{s.profiles?.email ?? ""}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                          {s.role === "coach"
                            ? "Treinador Principal"
                            : s.role === "assistant_coach"
                            ? "Adjunto"
                            : s.role}
                        </span>
                        {s.role === "coach" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                            RWED auto
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ───────── TAB: PLANEAMENTO ───────── */}
        {tab === "planeamento" && (
          <div className="space-y-4">
            {[
              { title: "Microciclo", desc: "Planeamento semanal de treinos com carga e objectivos." },
              { title: "Mesociclo", desc: "Planeamento periódico (blocos de 4–6 semanas)." },
              { title: "Objectivos da Época", desc: "Metas desportivas e formativas para a época." },
            ].map((section) => (
              <Card key={section.title} className="opacity-60">
                <CardContent className="pt-5 pb-5">
                  <p className="font-semibold text-slate-500 mb-1">{section.title}</p>
                  <p className="text-sm text-slate-400">{section.desc}</p>
                  <span className="inline-block mt-2 text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-full">
                    Em breve
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ───────── TAB: CONFIGURAÇÕES ───────── */}
        {tab === "configuracoes" && (
          <div className="space-y-5">
            {/* Sistema Táctico */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Sistema Táctico</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 items-center">
                  <Select
                    value={tacticalSystem}
                    onValueChange={(val) => {
                      setTacticalSystem(val);
                      void handleTacticalSave(val);
                    }}
                    disabled={!canManage}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Selecciona sistema..." />
                    </SelectTrigger>
                    <SelectContent>
                      {TACTICAL_SYSTEMS.map((sys) => (
                        <SelectItem key={sys} value={sys}>
                          {sys}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {savingTactical && (
                    <Loader2 size={16} className="animate-spin text-slate-400" />
                  )}
                </div>
                {!canManage && (
                  <p className="mt-2 text-xs text-slate-400">
                    Só o coordenador ou treinador principal podem alterar.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Link Público */}
            <PublicSharePanel ageGroupId={ageGroupId} canManage={canManage} />

            {/* Zona de Perigo */}
            {canManage && ageGroup.coordinator_id && (
              <Card className="border-red-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-red-700">Zona de perigo</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-slate-600">
                    Apagar o escalão remove toda a informação associada: atletas ({activePlayers}),
                    staff ({staffCount}), jogos, treinos, convocatórias, links públicos e imagens.
                    Esta acção é irreversível.
                  </p>
                  <Button
                    variant="outline"
                    className="w-full border-red-200 text-red-600 hover:bg-red-50"
                    onClick={() => {
                      setDeleteConfirmText("");
                      setDeleteModalOpen(true);
                    }}
                  >
                    <Trash2 size={16} className="mr-2" />
                    Apagar escalão
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* Delete modal */}
      {deleteModalOpen && ageGroup && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 md:items-center"
          onClick={() => { if (!deleting) setDeleteModalOpen(false); }}
        >
          <div
            className="flex max-h-[calc(100dvh-1rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b p-5">
              <h3 className="flex items-center gap-2 font-bold text-slate-900">
                <AlertTriangle size={18} className="text-red-500" />
                Confirmar apagamento do escalão
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                Esta acção é irreversível. Escreve <strong>APAGAR ESCALAO</strong> para confirmar.
              </p>
            </div>
            <div className="p-5 space-y-3">
              <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-900">
                <p className="font-medium">{ageGroup.club_name} · {ageGroup.name}</p>
              </div>
              <div className="space-y-1.5">
                <Label>Confirmação</Label>
                <Input
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="APAGAR ESCALAO"
                  disabled={deleting}
                />
              </div>
            </div>
            <div className="border-t bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setDeleteModalOpen(false)} disabled={deleting}>
                  Cancelar
                </Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700"
                  onClick={() => void handleDeleteAgeGroup()}
                  disabled={deleting}
                >
                  {deleting ? <Loader2 size={16} className="mr-2 animate-spin" /> : null}
                  Apagar escalão
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
