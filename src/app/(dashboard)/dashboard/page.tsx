import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { format, addDays, addHours, parseISO, isToday, isTomorrow } from "date-fns";
import { pt } from "date-fns/locale";
import {
  Users,
  Calendar,
  Trophy,
  BarChart2,
  Settings,
  AlertCircle,
  Sword,
  Dumbbell,
  Shield,
  Briefcase,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import RedeemInviteGate from "@/components/invite/RedeemInviteGate";
import type { TrainingSession, Game } from "@/types/database";

function relativeDay(dateStr: string) {
  const d = parseISO(dateStr);
  if (isToday(d)) return "Hoje";
  if (isTomorrow(d)) return "Amanhã";
  return format(d, "EEEE, d 'de' MMM", { locale: pt });
}

export default async function DashboardPage() {
  const supabase = await createClient();
  let admin: ReturnType<typeof createAdminClient> | null = null;
  try {
    admin = createAdminClient();
  } catch {
    admin = null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch profile + age groups in parallel (both only depend on user.id)
  const [{ data: profile }, { data: managedAgeGroups }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).single(),
    (admin ?? supabase)
      .from("age_groups")
      .select("id, club_name, name, club_logo_url, teams(id)")
      .eq("coordinator_id", user.id),
  ]);

  let firstTeamId: string | null = managedAgeGroups?.[0]?.teams?.[0]?.id ?? null;
  let activeAgeGroup: {
    id: string;
    club_name: string;
    name: string;
    club_logo_url: string | null;
  } | null = managedAgeGroups?.[0]
    ? {
        id: managedAgeGroups[0].id,
        club_name: managedAgeGroups[0].club_name,
        name: managedAgeGroups[0].name,
        club_logo_url: managedAgeGroups[0].club_logo_url ?? null,
      }
    : null;

  // Conta de staff convidado (não coordenador)
  if (!firstTeamId) {
    const { data: staffTeam } = await (admin ?? supabase)
      .from("team_staff")
      .select("team_id")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    firstTeamId = staffTeam?.team_id ?? null;

    if (staffTeam?.team_id) {
      const { data: staffTeamRow } = await (admin ?? supabase)
        .from("teams")
        .select("age_group_id")
        .eq("id", staffTeam.team_id)
        .maybeSingle();

      if (staffTeamRow?.age_group_id) {
        const { data: staffAgeGroup } = await (admin ?? supabase)
          .from("age_groups")
          .select("id, club_name, name, club_logo_url")
          .eq("id", staffTeamRow.age_group_id)
          .maybeSingle();

        activeAgeGroup = staffAgeGroup ?? activeAgeGroup;
      }
    }
  }

  const hasSetup = !!firstTeamId;

  const now = new Date();
  const todayDate = format(now, "yyyy-MM-dd");
  const in7days = format(addDays(now, 7), "yyyy-MM-dd");
  const in48h = addHours(now, 48);

  // Próximos treinos + jogos (7 dias) — em paralelo
  let upcomingTrainings: TrainingSession[] = [];
  let upcomingGames: Game[] = [];
  if (firstTeamId) {
    const [{ data: trainingsData }, { data: gamesData }] = await Promise.all([
      (admin ?? supabase)
        .from("training_sessions")
        .select("*")
        .eq("team_id", firstTeamId)
        .gte("session_date", todayDate)
        .lte("session_date", in7days)
        .neq("status", "completed")
        .order("session_date", { ascending: true })
        .order("start_time", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true })
        .limit(3),
      (admin ?? supabase)
        .from("games")
        .select("*")
        .eq("team_id", firstTeamId)
        .gte("game_datetime", `${todayDate}T00:00:00`)
        .lte("game_datetime", `${in7days}T23:59:59`)
        .neq("status", "completed")
        .order("game_datetime", { ascending: true })
        .limit(3),
    ]);
    upcomingTrainings = trainingsData || [];
    upcomingGames = gamesData || [];
  }

  // Jogos com convocatória já confirmada (para não mostrar alerta)
  const confirmedGameIds = new Set<string>();
  if (upcomingGames.length > 0) {
    const upcomingGameIds = upcomingGames.map((g) => g.id);
    const { data: existingConvocations } = await (admin ?? supabase)
      .from("convocations")
      .select("game_id, status")
      .in("game_id", upcomingGameIds)
      .in("status", ["confirmed", "closed", "draft"]);
    (existingConvocations || []).forEach((c) => {
      // Qualquer convocatória existente (mesmo draft) fecha o alerta
      if (c.game_id) confirmedGameIds.add(c.game_id);
    });
  }

  // Treino de hoje especificamente (para presenças)
  const todayTrainings = upcomingTrainings.filter((t) => t.session_date === todayDate);
  const todayTraining =
    todayTrainings.find((training) => training.status !== "completed") ||
    todayTrainings[0];
  const todayTrainingDone = todayTraining?.status === "completed";

  const today = format(new Date(), "EEEE, d 'de' MMMM", { locale: pt });
  const firstName = profile?.full_name?.split(" ")[0] || "Treinador";

  const navCards = [
    { href: "/players", icon: Users, label: "Plantel", color: "text-blue-600" },
    { href: "/games", icon: Sword, label: "Jogos", color: "text-indigo-600" },
    { href: "/trainings", icon: Dumbbell, label: "Treinos", color: "text-emerald-600" },
    { href: "/calendar", icon: Calendar, label: "Calendário", color: "text-purple-600" },
    { href: "/competitions", icon: Trophy, label: "Competições", color: "text-amber-600" },
    { href: "/team", icon: Shield, label: "Equipa", color: "text-teal-600" },
    { href: "/staff", icon: Briefcase, label: "Equipa Técnica", color: "text-rose-600" },
    { href: "/statistics", icon: BarChart2, label: "Estatísticas", color: "text-orange-600" },
    { href: "/settings", icon: Settings, label: "Configurações", color: "text-slate-600" },
  ];

  const hasPending = upcomingTrainings.length > 0 || upcomingGames.length > 0;

  return (
    <>
      <RedeemInviteGate />
      <div className="p-4 md:p-8 max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <p className="text-slate-500 text-sm capitalize">{today}</p>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">
            Olá, {firstName} 👋
          </h1>
        </div>

        {activeAgeGroup?.club_logo_url && (
          <div className="mb-6">
            <div className="w-24 h-24 mx-auto rounded-2xl border border-slate-200 bg-white flex items-center justify-center overflow-hidden p-2">
              <Image
                src={activeAgeGroup.club_logo_url}
                alt={`Logo ${activeAgeGroup.club_name}`}
                width={88}
                height={88}
                className="object-contain"
                priority
              />
            </div>
          </div>
        )}

        {/* Setup pendente */}
        {!hasSetup && (
          <Card className="border-emerald-200 bg-emerald-50 mb-6">
            <CardContent className="pt-5 pb-5">
              <h2 className="font-semibold text-emerald-900 mb-1">
                Começa por configurar o teu escalão
              </h2>
              <p className="text-emerald-700 text-sm mb-4">
                Cria o escalão, equipas e adiciona os atletas.
              </p>
              <Link href="/team/setup">
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  size="sm"
                >
                  Configurar escalão
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Tarefas pendentes */}
        {hasSetup && (
          <div className="mb-6 space-y-3">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
              Próximos eventos
            </h2>

            {/* Presenças de hoje — se houver treino hoje */}
            {todayTraining && !todayTrainingDone && (
              <Link href="/attendance">
                <div className="flex items-center gap-3 p-4 bg-amber-50 border-2 border-amber-200 rounded-xl hover:border-amber-300 transition-colors">
                  <AlertCircle
                    size={20}
                    className="text-amber-500 flex-shrink-0"
                  />
                  <div className="flex-1">
                    <p className="font-semibold text-amber-900 text-sm">
                      Presenças por confirmar
                    </p>
                    <p className="text-amber-700 text-xs">
                      Treino de hoje ·{" "}
                      {todayTraining.start_time?.substring(0, 5) || "—"}
                    </p>
                  </div>
                  <span className="text-amber-600 text-xs font-medium">→</span>
                </div>
              </Link>
            )}

            {todayTraining && todayTrainingDone && (
              <div className="flex items-center gap-3 p-4 bg-emerald-50 border-2 border-emerald-200 rounded-xl">
                <Calendar
                  size={20}
                  className="text-emerald-500 flex-shrink-0"
                />
                <div className="flex-1">
                  <p className="font-semibold text-emerald-900 text-sm">
                    Presenças confirmadas ✓
                  </p>
                  <p className="text-emerald-700 text-xs">
                    Treino de hoje fechado
                  </p>
                </div>
              </div>
            )}

            {/* Próximos treinos (sem hoje) */}
            {upcomingTrainings
              .filter((t) => t.session_date !== todayDate)
              .map((training) => (
                <Link key={training.id} href="/calendar">
                  <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl hover:border-emerald-300 transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-xs font-bold">T</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-emerald-900 text-sm">
                        Treino
                      </p>
                      <p className="text-emerald-700 text-xs capitalize">
                        {relativeDay(training.session_date)}
                        {training.start_time
                          ? ` · ${training.start_time.substring(0, 5)}`
                          : ""}
                      </p>
                    </div>
                    <span className="text-emerald-600 text-xs font-medium">
                      →
                    </span>
                  </div>
                </Link>
              ))}

            {/* Próximos jogos */}
            {upcomingGames.map((game) => {
              const gameDate = game.game_datetime ? parseISO(game.game_datetime) : null;
              const needsConvocation =
                gameDate && gameDate <= in48h && gameDate >= now && !confirmedGameIds.has(game.id);
              return (
                <div key={game.id} className="space-y-1">
                  <Link href={`/games/${game.id}`}>
                    <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl hover:border-blue-300 transition-colors">
                      <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-xs font-bold">J</span>
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-blue-900 text-sm">
                          {game.opponent_name ? `vs ${game.opponent_name}` : "Jogo"}
                        </p>
                        <p className="text-blue-700 text-xs capitalize">
                          {relativeDay(game.game_datetime?.split("T")[0])}
                          {game.game_datetime
                            ? ` · ${game.game_datetime.split("T")[1]?.substring(0, 5)}`
                            : ""}
                          {game.location ? ` · ${game.location}` : ""}
                        </p>
                      </div>
                      <span className="text-blue-600 text-xs font-medium">→</span>
                    </div>
                  </Link>
                  {needsConvocation && (
                    <Link href={`/games/${game.id}`}>
                      <div className="flex items-center gap-3 p-3 bg-amber-50 border-2 border-amber-300 rounded-xl hover:border-amber-400 transition-colors ml-2">
                        <AlertCircle size={16} className="text-amber-500 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="font-semibold text-amber-900 text-xs">
                            Convocatória por criar
                          </p>
                          <p className="text-amber-700 text-xs">
                            Jogo em menos de 48h — seleciona os convocados
                          </p>
                        </div>
                        <span className="text-amber-600 text-xs font-medium">→</span>
                      </div>
                    </Link>
                  )}
                </div>
              );
            })}

            {!hasPending && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center">
                <p className="text-slate-400 text-sm">
                  Sem eventos nos próximos 7 dias ✓
                </p>
              </div>
            )}
          </div>
        )}

        {/* Atalhos rápidos */}
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Atalhos
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 items-stretch">
          {navCards.map(({ href, icon: Icon, label, color }) => (
            <Link key={href} href={href}>
              <Card className="hover:shadow-md transition-all cursor-pointer border-2 hover:border-emerald-200 h-full">
                <CardContent className="pt-5 pb-4 flex flex-col items-center justify-center text-center min-h-[90px]">
                  <Icon className={`mb-2 ${color}`} size={26} />
                  <p className="font-semibold text-sm text-slate-700 leading-tight">
                    {label}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
