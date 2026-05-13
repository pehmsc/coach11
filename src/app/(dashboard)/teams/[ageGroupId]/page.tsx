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
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Users,
  Trophy,
  Settings,
  ClipboardList,
  LayoutGrid,
  Plus,
  Swords,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PublicSharePanel } from "@/components/team/PublicSharePanel";
import { StickyBackLink } from "@/components/navigation/StickyBackLink";
import { Breadcrumb } from "@/components/navigation/Breadcrumb";
import type { AgeGroup, Player, FootballFormat } from "@/types/database";
import { AGE_GROUP_STAFF_ROLE_LABELS, getStaffRoleLabel } from "@/lib/team/staff-role";
import { PermissionsGrid, type PermissionsMap, templateToPermissions } from "@/components/staff/PermissionsGrid";
import { OpponentsTab } from "@/components/opponents/OpponentsTab";

// Lista completa para o modal de convite de staff no escalão.
// Inclui age_group_coordinator (não está em AGE_GROUP_STAFF_ROLE_LABELS).
const INVITE_ROLE_OPTIONS = [
  { value: "age_group_coordinator", label: "Coordenador de Escalão" },
  ...Object.entries(AGE_GROUP_STAFF_ROLE_LABELS).map(([value, label]) => ({ value, label })),
];

const ROLE_TO_TEMPLATE: Record<string, "principal" | "adjunto" | "estagiario"> = {
  head_coach: "principal",
  assistant_coach: "adjunto",
  intern_coach: "estagiario",
  goalkeeper_coach: "adjunto",
  fitness_coach: "adjunto",
};

// ─── Constantes ──────────────────────────────────────────────────────────────

const TACTICAL_SYSTEMS = [
  "4-3-3", "4-4-2", "4-2-3-1", "4-1-4-1", "4-5-1",
  "3-5-2", "3-4-3", "5-3-2", "5-4-1",
  "3-2-3 (Fut9)", "3-3-2 (Fut9)", "3-4-1 (Fut9)", "2-5-1 (Fut9)", "2-4-2 (Fut9)", "4-3-1 (Fut9)",
  "1-4-1 (Fut7)", "2-3-1 (Fut7)", "3-1-2 (Fut7)",
];

const AGE_GROUPS = [
  "Sub-7", "Sub-8", "Sub-9", "Sub-10", "Sub-11", "Sub-12",
  "Sub-13", "Sub-14", "Sub-15", "Sub-16", "Sub-17", "Sub-18",
  "Sub-19", "Sub-23", "Sénior",
];

const FOOTBALL_FORMATS = [
  { value: "5", label: "5x5 (Futebol 5)" },
  { value: "7", label: "7x7 (Futebol 7)" },
  { value: "9", label: "9x9 (Futebol 9)" },
  { value: "11", label: "11x11 (Futebol 11)" },
];

/** Bug 4 — substituir "F9" por "9x9" em toda a UI */
const FORMAT_LABELS: Record<string, string> = {
  "5": "5x5", "7": "7x7", "9": "9x9", "11": "11x11",
};

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Tab = "geral" | "atletas" | "staff" | "planeamento" | "configuracoes" | "adversarios";

interface StaffMember {
  id: string;
  profile_id: string;
  role: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
}

/** Bug 5/6 — campo correcto é game_datetime, não scheduled_at */
interface GameRow {
  id: string;
  game_datetime?: string | null;
  opponent_name?: string | null;
  is_home?: boolean | null;
  status: string;
  competition_id?: string | null;
  title?: string | null;
  score_home?: number | null;
  score_away?: number | null;
}

interface TrainingRow {
  id: string;
  session_date: string;
  start_time: string;
  end_time?: string | null;
  title?: string | null;
  status: string;
}

type PageParams = { ageGroupId: string };

// ─── Gráfico pizza SVG interactivo ───────────────────────────────────────────

function InteractivePieChart({
  slices,
}: {
  slices: { color: string; pct: number; label: string; count: number }[];
}) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const radius = 42;
  const cx = 50;
  const cy = 50;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const filtered = slices.filter((s) => s.pct > 0);
  const total = slices.reduce((a, s) => a + s.count, 0);

  const paths = filtered.reduce<
    { d: string; color: string; origIdx: number; key: number }[]
  >((acc, slice, i) => {
    const cum = acc.reduce((s, _, j) => s + filtered[j].pct, 0);
    const startAngle = cum * 3.6 - 90;
    const endAngle = (cum + slice.pct) * 3.6 - 90;
    const x1 = cx + radius * Math.cos(toRad(startAngle));
    const y1 = cy + radius * Math.sin(toRad(startAngle));
    const x2 = cx + radius * Math.cos(toRad(endAngle));
    const y2 = cy + radius * Math.sin(toRad(endAngle));
    const largeArc = slice.pct > 50 ? 1 : 0;
    const origIdx = slices.indexOf(slice);
    acc.push({
      d: `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`,
      color: slice.color,
      origIdx,
      key: i,
    });
    return acc;
  }, []);

  const activeSlice = activeIdx !== null ? slices[activeIdx] : null;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <svg
          viewBox="0 0 100 100"
          className="w-24 h-24 cursor-pointer"
          onMouseLeave={() => setActiveIdx(null)}
        >
          {filtered.length === 0 ? (
            <circle cx={cx} cy={cy} r={radius} fill="#e2e8f0" />
          ) : (
            paths.map((p) => (
              <path
                key={p.key}
                d={p.d}
                fill={p.color}
                opacity={activeIdx === null || activeIdx === p.origIdx ? 1 : 0.45}
                style={{ transition: "opacity 0.15s" }}
                onMouseEnter={() => setActiveIdx(p.origIdx)}
                onClick={() =>
                  setActiveIdx((prev) => (prev === p.origIdx ? null : p.origIdx))
                }
              />
            ))
          )}
        </svg>
      </div>

      {/* Tooltip inline */}
      <div className="h-8 flex items-center">
        {activeSlice ? (
          <div
            className="flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium text-white shadow-md"
            style={{ backgroundColor: activeSlice.color }}
          >
            <span>{activeSlice.label}</span>
            <span>·</span>
            <span>{activeSlice.count}</span>
            <span>({total > 0 ? ((activeSlice.count / total) * 100).toFixed(1) : 0}%)</span>
          </div>
        ) : (
          <p className="text-[11px] text-slate-400 italic">Toca para ver detalhes</p>
        )}
      </div>

      {/* Legenda — apenas cor + nome, sem contagem (tooltip já mostra tudo) */}
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
        {slices.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5 text-xs">
            <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-slate-600">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Calendário semanal ───────────────────────────────────────────────────────

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

// ─── Componente principal ─────────────────────────────────────────────────────

export default function TeamDetailPage({ params }: { params: Promise<PageParams> }) {
  const { ageGroupId } = use(params);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [tab, setTab] = useState<Tab>("geral");
  const [loading, setLoading] = useState(true);

  // Data
  const [ageGroup, setAgeGroup] = useState<AgeGroup | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [isClubCoordinator, setIsClubCoordinator] = useState(false);

  // Staff invite modal
  const [showStaffInvite, setShowStaffInvite] = useState(false);
  const [staffInviteForm, setStaffInviteForm] = useState({ firstName: "", lastName: "", email: "", role: "assistant_coach" });
  const [invitePermissions, setInvitePermissions] = useState<PermissionsMap>(() =>
    templateToPermissions(ROLE_TO_TEMPLATE["assistant_coach"]),
  );
  const [sendingStaffInvite, setSendingStaffInvite] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [weekTrainings, setWeekTrainings] = useState<TrainingRow[]>([]);
  const [weekGames, setWeekGames] = useState<GameRow[]>([]);
  const [upcomingGames, setUpcomingGames] = useState<GameRow[]>([]);
  const [attendanceStats, setAttendanceStats] = useState<Record<string, number>>({});
  const [completedTrainings, setCompletedTrainings] = useState(0);
  const [gameResults, setGameResults] = useState({ wins: 0, draws: 0, losses: 0, total: 0 });
  const [gameMetrics, setGameMetrics] = useState({ goalsFor: 0, goalsAgainst: 0, yellowCards: 0, redCards: 0 });
  const [recentForm, setRecentForm] = useState<("W" | "D" | "L")[]>([]);

  // Week navigation
  const [weekOffset, setWeekOffset] = useState(0);
  const today = useMemo(() => new Date(), []);
  const weekDates = useMemo(() => {
    const ref = new Date(today);
    ref.setDate(today.getDate() + weekOffset * 7);
    return getWeekDates(ref);
  }, [today, weekOffset]);

  // Configurações tab — tactical
  const [tacticalSystem, setTacticalSystem] = useState("");
  const [savingTactical, setSavingTactical] = useState(false);

  // Configurações tab — edit info (Bug 1 + Bug 2)
  const [editingInfo, setEditingInfo] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAgeLevel, setEditAgeLevel] = useState("");
  const [editFormat, setEditFormat] = useState("11");
  const [editSeason, setEditSeason] = useState("");
  const [savingInfo, setSavingInfo] = useState(false);

  // Configurações tab — delete
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Header — all user teams for dropdown
  const [allTeams, setAllTeams] = useState<Array<{ id: string; name: string; age_level?: string | null; club_name: string }>>([]);

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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    // Profile & permissions
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_super_coordinator")
      .eq("id", user.id)
      .maybeSingle();

    // Age group (Bug 2: select age_level too)
    const { data: ag } = await supabase
      .from("age_groups")
      .select("*")
      .eq("id", ageGroupId)
      .maybeSingle();

    if (!ag) { setLoading(false); return; }
    const ageGroupData = ag as AgeGroup;
    setAgeGroup(ageGroupData);
    setTacticalSystem(ag.tactical_system || "");

    // Populate edit form fields
    setEditName(ag.name ?? "");
    setEditAgeLevel(ag.age_level ?? ag.name ?? "");
    setEditFormat(ag.football_format ?? "11");
    setEditSeason(ag.season ?? "");

    // Permissions
    const isCoord = profile?.role === "coordinator" || profile?.is_super_coordinator;
    const isOwnAg = ag.coordinator_id === user.id;
    const { data: staffLink } = await supabase
      .from("age_group_staff")
      .select("role")
      .eq("age_group_id", ageGroupId)
      .eq("profile_id", user.id)
      .maybeSingle();
    const isPrincipal = staffLink?.role === "coach" || staffLink?.role === "age_group_coordinator";
    setCanManage(isCoord || isOwnAg || isPrincipal || !!profile?.is_super_coordinator);

    // Detectar club_coordinator via context (fetch rápido ao me/context)
    const ctxRes = await fetch("/api/me/context").catch(() => null);
    if (ctxRes?.ok) {
      const ctx = await ctxRes.json().catch(() => ({}));
      setIsClubCoordinator(ctx?.source === "club_coordinator");
    }

    // Players
    const { data: playersData } = await supabase
      .from("players")
      .select("*")
      .eq("age_group_id", ageGroupId)
      .order("first_name");
    setPlayers((playersData ?? []) as Player[]);

    // Staff — dois queries separados para evitar problemas de RLS no JOIN a profiles
    const { data: staffLinks } = await supabase
      .from("age_group_staff")
      .select("id, profile_id, role")
      .eq("age_group_id", ageGroupId);
    if (staffLinks && staffLinks.length > 0) {
      const profileIds = staffLinks.map((s) => s.profile_id);
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone, avatar_url")
        .in("id", profileIds);
      const profileMap = new Map((profilesData ?? []).map((p) => [p.id, p]));
      setStaff(
        staffLinks.map((s) => ({
          id: s.id,
          profile_id: s.profile_id,
          role: s.role,
          full_name: profileMap.get(s.profile_id)?.full_name ?? null,
          email: profileMap.get(s.profile_id)?.email ?? null,
          phone: profileMap.get(s.profile_id)?.phone ?? null,
          avatar_url: profileMap.get(s.profile_id)?.avatar_url ?? null,
        })),
      );
    } else {
      setStaff([]);
    }

    // Bug 6 — Próximos jogos: usar game_datetime (não scheduled_at)
    const { data: upGames } = await supabase
      .from("games")
      .select("id, game_datetime, opponent_name, is_home, status, competition_id, title")
      .eq("age_group_id", ageGroupId)
      .in("status", ["scheduled", "live"])
      .gte("game_datetime", new Date().toISOString())
      .order("game_datetime")
      .limit(5);
    setUpcomingGames((upGames ?? []) as GameRow[]);

    // Fix 2 — Presenças: só sessões concluídas, com contagem de treinos concluídos
    const { data: completedSessions } = await supabase
      .from("training_sessions")
      .select("id")
      .eq("age_group_id", ageGroupId)
      .eq("status", "completed");
    const completedSessionIds = (completedSessions ?? []).map((s) => s.id);
    setCompletedTrainings(completedSessionIds.length);
    if (completedSessionIds.length > 0) {
      const { data: att } = await supabase
        .from("training_attendance")
        .select("status")
        .in("training_session_id", completedSessionIds);
      if (att) {
        const counts: Record<string, number> = {};
        att.forEach((a) => { counts[a.status] = (counts[a.status] ?? 0) + 1; });
        setAttendanceStats(counts);
      }
    }

    // Resultados + métricas de jogos
    const { data: completedGames } = await supabase
      .from("games")
      .select("id, score_home, score_away, is_home, game_datetime")
      .eq("age_group_id", ageGroupId)
      .eq("status", "completed")
      .not("score_home", "is", null)
      .order("game_datetime", { ascending: false });
    if (completedGames && completedGames.length > 0) {
      let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0;
      const form: ("W" | "D" | "L")[] = [];
      completedGames.forEach((g) => {
        const myScore = g.is_home ? (g.score_home ?? 0) : (g.score_away ?? 0);
        const oppScore = g.is_home ? (g.score_away ?? 0) : (g.score_home ?? 0);
        goalsFor += myScore;
        goalsAgainst += oppScore;
        if (myScore > oppScore) { wins++; form.push("W"); }
        else if (myScore === oppScore) { draws++; form.push("D"); }
        else { losses++; form.push("L"); }
      });
      setGameResults({ wins, draws, losses, total: wins + draws + losses });
      setRecentForm(form.slice(0, 5));

      // Cartões: somar de game_final_stats para os jogos concluídos
      const gameIds = completedGames.map((g) => g.id);
      const { data: statsRows } = await supabase
        .from("game_final_stats")
        .select("yellow_cards, red_cards")
        .in("game_id", gameIds)
        .eq("is_finalized", true);
      const yellowCards = (statsRows ?? []).reduce((sum, r) => sum + (r.yellow_cards ?? 0), 0);
      const redCards = (statsRows ?? []).reduce((sum, r) => sum + (r.red_cards ?? 0), 0);
      setGameMetrics({ goalsFor, goalsAgainst, yellowCards, redCards });
    }

    // All teams for switcher dropdown
    const { data: coordAgs } = await supabase
      .from("age_groups")
      .select("id, name, age_level, club_name")
      .eq("coordinator_id", user.id);
    const { data: staffAgs } = await supabase
      .from("age_group_staff")
      .select("age_group_id, age_groups(id, name, age_level, club_name)")
      .eq("profile_id", user.id);
    const staffAgList = (staffAgs ?? [])
      .map((s) => s.age_groups)
      .flat()
      .filter(Boolean) as Array<{ id: string; name: string; age_level?: string | null; club_name: string }>;
    const seen = new Set<string>();
    const merged = [...(coordAgs ?? []), ...staffAgList].filter((a) => {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    });
    setAllTeams(merged);

    setLoading(false);
  }

  // Bug 5 — Calendário: usar game_datetime (não scheduled_at)
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
        .select("id, game_datetime, opponent_name, is_home, status, competition_id, title")
        .eq("age_group_id", ageGroupId)
        .gte("game_datetime", `${start}T00:00:00`)
        .lte("game_datetime", `${end}T23:59:59`),
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

  async function handleStaffInvite(e: { preventDefault(): void }) {
    e.preventDefault();
    setSendingStaffInvite(true);
    const res = await fetch("/api/invite/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: staffInviteForm.firstName,
        lastName: staffInviteForm.lastName,
        email: staffInviteForm.email,
        role: staffInviteForm.role,
        permissions: Object.entries(invitePermissions).map(([area, perms]) => ({
          area,
          ...perms,
        })),
        // Para club_coordinator, pré-seleccionar este escalão
        ...(isClubCoordinator ? { ageGroupIds: [ageGroupId] } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.success) {
      setShowStaffInvite(false);
      setStaffInviteForm({ firstName: "", lastName: "", email: "", role: "assistant_coach" });
      setInvitePermissions(templateToPermissions(ROLE_TO_TEMPLATE["assistant_coach"]));
      if (data.emailSent) {
        toast.success("Convite enviado.");
      } else {
        toast.warning(data.warning || "Convite criado, mas email não enviado.");
      }
      void loadAll();
    } else {
      toast.error(data.error || "Erro ao enviar convite.");
    }
    setSendingStaffInvite(false);
  }

  // Bug 1 — Guardar informações da equipa
  async function handleSaveInfo(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!ageGroup) return;
    setSavingInfo(true);
    const { error } = await supabase
      .from("age_groups")
      .update({
        name: editName.trim() || ageGroup.name,
        age_level: editAgeLevel.trim() || null,
        football_format: editFormat as FootballFormat,
        season: editSeason.trim() || ageGroup.season,
      })
      .eq("id", ageGroup.id);
    if (error) {
      toast.error("Erro ao guardar: " + error.message);
    } else {
      setAgeGroup((prev) =>
        prev
          ? {
              ...prev,
              name: editName.trim() || prev.name,
              age_level: editAgeLevel.trim() || null,
              football_format: (editFormat as FootballFormat) || prev.football_format,
              season: editSeason.trim() || prev.season,
            }
          : prev,
      );
      setEditingInfo(false);
      toast.success("Informações da equipa guardadas");
    }
    setSavingInfo(false);
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

  // Bug 2 — Escalão: age_level se existir, senão fallback para name
  const displayAgeLevel = ageGroup.age_level ?? ageGroup.name;
  const displayName = ageGroup.name;
  const formatLabel = FORMAT_LABELS[ageGroup.football_format] ?? `F${ageGroup.football_format}`;

  const activePlayers = players.filter((p) => p.status === "active").length;
  const staffCount = staff.length;

  const TABS: { id: Tab; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
    { id: "geral", label: "Geral", icon: LayoutGrid },
    { id: "atletas", label: `Atletas (${activePlayers})`, icon: Users },
    { id: "staff", label: `Staff (${staffCount})`, icon: Trophy },
    { id: "planeamento", label: "Planeamento", icon: ClipboardList },
    { id: "configuracoes", label: "Configurações", icon: Settings },
    { id: "adversarios", label: "Adversários", icon: Swords },
  ];

  // Performance — presenças (Fix 2: estados e cores correctos)
  const attTotal = Object.values(attendanceStats).reduce((a, b) => a + b, 0);
  const getAttCount = (status: string) => attendanceStats[status] ?? 0;
  const attSlices = [
    { color: "#22c55e", label: "Presente", status: "present", pct: attTotal > 0 ? (getAttCount("present") / attTotal) * 100 : 0, count: getAttCount("present") },
    { color: "#ef4444", label: "Ausente", status: "absent", pct: attTotal > 0 ? (getAttCount("absent") / attTotal) * 100 : 0, count: getAttCount("absent") },
    { color: "#f59e0b", label: "Atrasado", status: "late", pct: attTotal > 0 ? (getAttCount("late") / attTotal) * 100 : 0, count: getAttCount("late") },
    { color: "#f97316", label: "Lesionado", status: "injured", pct: attTotal > 0 ? (getAttCount("injured") / attTotal) * 100 : 0, count: getAttCount("injured") },
  ];

  // Performance — jogos
  const gTotal = gameResults.total;
  const gameSlices = [
    { color: "#22c55e", label: "Vitórias", pct: gTotal > 0 ? (gameResults.wins / gTotal) * 100 : 0, count: gameResults.wins },
    { color: "#94a3b8", label: "Empates", pct: gTotal > 0 ? (gameResults.draws / gTotal) * 100 : 0, count: gameResults.draws },
    { color: "#ef4444", label: "Derrotas", pct: gTotal > 0 ? (gameResults.losses / gTotal) * 100 : 0, count: gameResults.losses },
  ];

  return (
    <div className="min-h-screen bg-slate-50">

      <StickyBackLink
        href="/teams"
        label="Voltar aos escalões"
        sticky={false}
        wrapperClassName="bg-slate-50 px-4 py-2 max-w-5xl mx-auto"
      >
        <Breadcrumb
          items={[
            { label: "Equipas", href: "/teams" },
            { label: displayName, shortLabel: displayName },
          ]}
        />
      </StickyBackLink>

      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            {allTeams.length > 1 ? (
              <Select value={ageGroupId} onValueChange={(id) => router.push(`/teams/${id}`)}>
                <SelectTrigger className="border-0 shadow-none p-0 h-auto text-left font-bold text-slate-900 text-lg focus:ring-0 max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allTeams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}{t.age_level ? ` · ${t.age_level}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex-1 min-w-0">
                <h1 className="font-bold text-slate-900 text-lg leading-tight truncate">{displayName}</h1>
                <p className="text-xs text-slate-500">{displayAgeLevel} · {ageGroup.club_name}</p>
              </div>
            )}

            {allTeams.length > 1 && (() => {
              const idx = allTeams.findIndex((t) => t.id === ageGroupId);
              const prev = allTeams[idx - 1];
              const next = allTeams[idx + 1];
              return (
                <div className="flex gap-1 ml-auto flex-shrink-0">
                  <Button variant="ghost" size="icon" disabled={!prev} onClick={() => prev && router.push(`/teams/${prev.id}`)}>
                    <ChevronLeft size={16} />
                  </Button>
                  <Button variant="ghost" size="icon" disabled={!next} onClick={() => next && router.push(`/teams/${next.id}`)}>
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

        {/* Card de informação — Bug 2: nome + escalão separados; Bug 4: formato 9x9 */}
        <Card className="mb-5">
          <CardContent className="pt-4 pb-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-3 text-sm">
              {[
                ["Nome da equipa", displayName],
                ["Escalão / Idade", displayAgeLevel],
                ["Época", ageGroup.season],
                ["Tipo", formatLabel],
                ["Sistema táctico", ageGroup.tactical_system || "—"],
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

        {/* ─── TAB GERAL ─────────────────────────────────────────────────── */}
        {tab === "geral" && (
          <div className="space-y-5">

            {/* Calendário semanal */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Calendário semanal</CardTitle>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setWeekOffset((o) => o - 1)}>
                      <ChevronLeft size={16} />
                    </Button>
                    <span className="text-xs text-slate-500 px-1 whitespace-nowrap">
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
                    // Bug 5 — comparar com game_datetime (não scheduled_at)
                    const dayGames = weekGames.filter(
                      (g) => typeof g.game_datetime === "string" && g.game_datetime.startsWith(dateStr),
                    );

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
                          <Link key={t.id} href="/trainings">
                            <div className="text-[9px] bg-emerald-100 text-emerald-800 rounded px-1 py-0.5 mb-0.5 leading-tight truncate">
                              {t.title || "Treino"} {t.start_time?.slice(0, 5)}
                            </div>
                          </Link>
                        ))}
                        {dayGames.map((g) => (
                          <Link key={g.id} href={`/games/${g.id}`}>
                            <div className="text-[9px] bg-blue-100 text-blue-800 rounded px-1 py-0.5 mb-0.5 leading-tight truncate">
                              {g.opponent_name ? (g.is_home ? "Casa" : "Fora") : "Jogo"}
                              {g.game_datetime
                                ? ` ${new Date(g.game_datetime).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}`
                                : ""}
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

              {/* Próximos Jogos — Bug 6 */}
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
                        const dt = g.game_datetime ? new Date(g.game_datetime) : null;
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
                <div className="grid sm:grid-cols-2 gap-8">
                  {/* Treinos */}
                  <div>
                    <p className="text-sm font-semibold text-slate-700 mb-1 text-center">
                      Treinos concluídos: {completedTrainings}
                    </p>
                    {attTotal === 0 ? (
                      <p className="text-xs text-slate-400 text-center mt-4">Sem dados de presenças.</p>
                    ) : (
                      <>
                        <InteractivePieChart slices={attSlices} />
                        <div className="mt-3 space-y-1 text-xs text-slate-600">
                          <div className="flex justify-between">
                            <span>Assiduidade</span>
                            <span className="font-semibold text-slate-800">
                              {attTotal > 0 ? ((getAttCount("present") / attTotal) * 100).toFixed(1) : 0}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Ausências</span>
                            <span className="font-semibold text-slate-800">
                              {attTotal > 0 ? ((getAttCount("absent") / attTotal) * 100).toFixed(1) : 0}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Atrasos</span>
                            <span className="font-semibold text-slate-800">
                              {attTotal > 0 ? ((getAttCount("late") / attTotal) * 100).toFixed(1) : 0}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Lesões</span>
                            <span className="font-semibold text-slate-800">
                              {attTotal > 0 ? ((getAttCount("injured") / attTotal) * 100).toFixed(1) : 0}%
                            </span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Jogos */}
                  <div>
                    <p className="text-sm font-semibold text-slate-700 mb-1 text-center">
                      Jogos concluídos: {gTotal}
                    </p>
                    {gTotal === 0 ? (
                      <p className="text-xs text-slate-400 text-center mt-4">Sem jogos concluídos.</p>
                    ) : (
                      <>
                        <InteractivePieChart slices={gameSlices} />

                        {/* Métricas — Forma como primeira linha */}
                        <div className="mt-3 space-y-1 text-xs text-slate-600">
                          {recentForm.length > 0 && (
                            <div className="flex items-center justify-between">
                              <span>Forma</span>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {recentForm.map((r, i) => (
                                  <span
                                    key={i}
                                    className={`inline-flex h-6 w-6 items-center justify-center rounded text-[11px] font-bold text-white flex-shrink-0 ${
                                      r === "W" ? "bg-emerald-500" : r === "D" ? "bg-slate-400" : "bg-red-500"
                                    }`}
                                  >
                                    {r === "W" ? "V" : r === "D" ? "E" : "D"}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span>Golos marcados</span>
                            <span className="font-semibold text-slate-800">
                              {gameMetrics.goalsFor}
                              {gTotal > 0 && (
                                <span className="font-normal text-slate-400 ml-1">
                                  ({(gameMetrics.goalsFor / gTotal).toFixed(2)} G/J)
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Golos sofridos</span>
                            <span className="font-semibold text-slate-800">
                              {gameMetrics.goalsAgainst}
                              {gTotal > 0 && (
                                <span className="font-normal text-slate-400 ml-1">
                                  ({(gameMetrics.goalsAgainst / gTotal).toFixed(2)} G/J)
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Cartão amarelo</span>
                            <span className="font-semibold text-slate-800">
                              {gameMetrics.yellowCards}
                              {gTotal > 0 && (
                                <span className="font-normal text-slate-400 ml-1">
                                  ({(gameMetrics.yellowCards / gTotal).toFixed(2)} /J)
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Cartão vermelho</span>
                            <span className="font-semibold text-slate-800">
                              {gameMetrics.redCards}
                              {gTotal > 0 && (
                                <span className="font-normal text-slate-400 ml-1">
                                  ({(gameMetrics.redCards / gTotal).toFixed(2)} /J)
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                      </>
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

        {/* ─── TAB ATLETAS ──────────────────────────────────────────────── */}
        {tab === "atletas" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">
                {activePlayers} activos · {players.filter((p) => (p.status as string) === "archived").length} arquivados
              </p>
              <Link href={`/players?ageGroupId=${ageGroupId}`}>
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
                          {p.status === "active" ? "Activo"
                            : p.status === "injured" ? "Lesionado"
                            : p.status === "suspended" ? "Suspenso"
                            : "Inactivo"}
                        </span>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── TAB STAFF ────────────────────────────────────────────────── */}
        {tab === "staff" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{staffCount} membros</p>
              {canManage && (
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => setShowStaffInvite(true)}
                >
                  <Plus size={14} className="mr-1" /> Convidar
                </Button>
              )}
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
                      {s.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={s.avatar_url}
                          alt={s.full_name ?? ""}
                          className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 flex-shrink-0">
                          {s.full_name
                            ? s.full_name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase()
                            : "??"}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 truncate">
                          {s.full_name ?? "—"}
                        </p>
                        <p className="text-xs text-slate-400 truncate">{s.email ?? ""}</p>
                        {s.phone && (
                          <p className="text-xs text-slate-400">{s.phone}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                          {getStaffRoleLabel(s.role)}
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

        {/* ─── TAB PLANEAMENTO ─────────────────────────────────────────── */}
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

        {/* ─── TAB ADVERSÁRIOS ─────────────────────────────────────────── */}
        {tab === "adversarios" && (
          <OpponentsTab ageGroupId={ageGroupId} />
        )}

        {/* ─── TAB CONFIGURAÇÕES ───────────────────────────────────────── */}
        {tab === "configuracoes" && (
          <div className="space-y-5">

            {/* Bug 1 + Bug 2 — Informações da equipa editáveis */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Informações da equipa</CardTitle>
                  {!editingInfo && canManage && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditName(ageGroup.name);
                        setEditAgeLevel(ageGroup.age_level ?? ageGroup.name);
                        setEditFormat(ageGroup.football_format);
                        setEditSeason(ageGroup.season);
                        setEditingInfo(true);
                      }}
                    >
                      <Pencil size={13} className="mr-1" />
                      Editar
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {!editingInfo ? (
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    {[
                      ["Nome da equipa", displayName],
                      ["Escalão / Idade", displayAgeLevel],
                      ["Modalidade", formatLabel],
                      ["Época", ageGroup.season],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <p className="text-xs text-slate-400">{label}</p>
                        <p className="font-medium text-slate-800 mt-0.5">{value}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <form onSubmit={handleSaveInfo} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5 col-span-2">
                        <Label>Nome da equipa *</Label>
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="ex: Infantis A"
                          required
                        />
                        <p className="text-xs text-slate-400">Nome que o clube dá a esta equipa</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Escalão / Faixa etária</Label>
                        <Select value={editAgeLevel} onValueChange={setEditAgeLevel}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona..." />
                          </SelectTrigger>
                          <SelectContent>
                            {AGE_GROUPS.map((ag) => (
                              <SelectItem key={ag} value={ag}>{ag}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Modalidade *</Label>
                        <Select value={editFormat} onValueChange={setEditFormat}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FOOTBALL_FORMATS.map((f) => (
                              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5 col-span-2">
                        <Label>Época</Label>
                        <Input
                          value={editSeason}
                          onChange={(e) => setEditSeason(e.target.value)}
                          placeholder="2025/2026"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="submit"
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                        disabled={savingInfo}
                      >
                        {savingInfo ? <Loader2 size={16} className="animate-spin" /> : "Guardar"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setEditingInfo(false)}
                        disabled={savingInfo}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </form>
                )}
              </CardContent>
            </Card>

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
                        <SelectItem key={sys} value={sys}>{sys}</SelectItem>
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
                    onClick={() => { setDeleteConfirmText(""); setDeleteModalOpen(true); }}
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

      {/* Modal de confirmação — apagar */}
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
                <p className="font-medium">{ageGroup.club_name} · {displayName}</p>
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

      {/* ─── Modal: Convidar staff ─────────────────────────────────────── */}
      {showStaffInvite && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4"
          onClick={() => setShowStaffInvite(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-5 border-b">
              <h3 className="font-bold text-slate-900">Convidar Staff</h3>
              <button onClick={() => setShowStaffInvite(false)}>
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleStaffInvite} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Nome *</Label>
                  <Input
                    value={staffInviteForm.firstName}
                    onChange={(e) => setStaffInviteForm((f) => ({ ...f, firstName: e.target.value }))}
                    placeholder="Nome"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Apelido *</Label>
                  <Input
                    value={staffInviteForm.lastName}
                    onChange={(e) => setStaffInviteForm((f) => ({ ...f, lastName: e.target.value }))}
                    placeholder="Apelido"
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={staffInviteForm.email}
                  onChange={(e) => setStaffInviteForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="email@exemplo.com"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Função *</Label>
                <Select
                  value={staffInviteForm.role}
                  onValueChange={(v) => {
                    setStaffInviteForm((f) => ({ ...f, role: v }));
                    const tpl = ROLE_TO_TEMPLATE[v];
                    if (tpl) setInvitePermissions(templateToPermissions(tpl));
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INVITE_ROLE_OPTIONS.map(({ value, label }) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Permissões</Label>
                <div className="rounded-lg border border-slate-100 p-3">
                  <PermissionsGrid
                    permissions={invitePermissions}
                    onChange={setInvitePermissions}
                    showTemplateSelector
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  type="submit"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  disabled={sendingStaffInvite}
                >
                  {sendingStaffInvite ? <Loader2 size={16} className="animate-spin" /> : "Enviar convite"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowStaffInvite(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
