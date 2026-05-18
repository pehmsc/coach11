import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import Image from "next/image";
import { DashboardEmptyState } from "@/components/dashboard/DashboardEmptyState";
import { format, addDays, parseISO, isToday, isTomorrow } from "date-fns";
import { pt } from "date-fns/locale";
import {
  Calendar,
  Play,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DashboardEventsWindow } from "@/components/dashboard/DashboardEventsWindow";
import RedeemInviteGate from "@/components/invite/RedeemInviteGate";
import { formatFixtureOpponentLabel } from "@/lib/games/display";
import { getPresencePromptState } from "@/lib/events/presence-window";
import {
  getGameDashboardPriorityState,
  getTrainingDashboardPriorityState,
} from "@/lib/events/dashboard-priority";
import type { TrainingSession, Game } from "@/types/database";

export const dynamic = "force-dynamic";

function relativeDay(dateStr: string) {
  const d = parseISO(dateStr);
  if (isToday(d)) return "Hoje";
  if (isTomorrow(d)) return "Amanhã";
  return format(d, "EEEE, d 'de' MMM", { locale: pt });
}

function normalizeTimePart(value: string | null | undefined) {
  if (!value) return "00:00";
  const [rawHours = "00", rawMinutes = "00"] = value.split(":");
  const hours = rawHours.padStart(2, "0").slice(0, 2);
  const minutes = rawMinutes.padStart(2, "0").slice(0, 2);
  return `${hours}:${minutes}`;
}

function toTimestampFromDateAndTime(
  dateValue: string | null | undefined,
  timeValue: string | null | undefined,
) {
  if (!dateValue) return Number.MAX_SAFE_INTEGER;
  const hhmm = normalizeTimePart(timeValue);
  const parsed = Date.parse(`${dateValue}T${hhmm}:00`);
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

function toTimestampFromDateTime(dateTimeValue: string | null | undefined) {
  if (!dateTimeValue) return Number.MAX_SAFE_INTEGER;
  const parsed = Date.parse(dateTimeValue);
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const db = supabase;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Se há um código de convite no URL, o RedeemInviteGate (client) vai
  // tratar o redeem — não redirecionar para onboarding antes disso.
  const resolvedSearchParams = await searchParams;
  const hasPendingInviteCode =
    typeof resolvedSearchParams.code === "string" && resolvedSearchParams.code.length > 0;

  // Fetch profile + age groups in parallel (both only depend on user.id)
  const [{ data: profile }, { data: managedAgeGroups }] = await Promise.all([
    supabase.from("profiles").select("full_name, role").eq("id", user.id).single(),
    db
      .from("age_groups")
      .select("id, club_name, name, club_logo_url, teams(id)")
      .eq("coordinator_id", user.id),
  ]);

  // Guard + empty state: verificar contexto do user quando não tem age_groups
  if (!managedAgeGroups || managedAgeGroups.length === 0) {
    // Verificar club_memberships, age_group_staff em paralelo
    // Nota: query simples sem join (evita problemas de RLS circular em clubs)
    const [{ data: clubMembership }, { data: staffLink }] = await Promise.all([
      db
        .from("club_memberships")
        .select("club_id")
        .eq("profile_id", user.id)
        .limit(1)
        .maybeSingle(),
      db
        .from("age_group_staff")
        .select("id")
        .eq("profile_id", user.id)
        .limit(1)
        .maybeSingle(),
    ]);

    if (!clubMembership && !staffLink) {
      // Se há um código de convite no URL, deixar o RedeemInviteGate processar
      // o redeem no cliente antes de decidir — evita onboarding prematuro para
      // staff convidado que ainda não fez redeem (race condition no registo).
      if (hasPendingInviteCode) {
        // Deixar a página renderizar com o RedeemInviteGate
      } else {
        // Fallback server-side: tentar resgatar convite pendente por email
        // (cobre o caso em que o user se registou mas o redeem nunca correu)
        let serverLinked = false;
        if (user.email) {
          const adminForSync = createAdminClient();
          const { data: pendingInvite } = await adminForSync
            .from("staff_invites")
            .select("id, invite_code, role")
            .ilike("email", user.email)
            .is("accepted_at", null)
            .neq("role", "club_coordinator")
            .limit(1)
            .maybeSingle();

          if (pendingInvite?.invite_code) {
            type RpcResult = { ok?: boolean; already_linked?: boolean } | null;
            let rpcData: RpcResult = null;
            if (pendingInvite.role === "age_group_coordinator") {
              // age_group_coordinator: usar RPC dedicado (não altera coordinator_id)
              const { data } = await adminForSync.rpc("rpc_redeem_age_coordinator_invite", {
                p_invite_code: pendingInvite.invite_code,
                p_user_email: user.email,
              });
              rpcData = data as RpcResult;
            } else {
              const { data } = await adminForSync.rpc("rpc_redeem_staff_invite", {
                p_invite_code: pendingInvite.invite_code,
                p_user_id: user.id,
                p_user_email: user.email,
              });
              rpcData = data as RpcResult;
            }
            serverLinked = rpcData?.ok === true || rpcData?.already_linked === true;
          }
        }

        if (!serverLinked) {
          // Sem clube, sem escalão, sem staff, sem convite → onboarding
          redirect("/onboarding");
        }
        // se serverLinked = true, a página continua a renderizar normalmente;
        // as queries seguintes de age_group_staff encontrarão o novo registo
      }
    }

    if (clubMembership && !staffLink) {
      // Tem clube mas sem escalão → empty state
      // Buscar nome do clube separadamente (evita join com RLS)
      let clubName: string | null = null;
      if (clubMembership.club_id) {
        const { data: club } = await db
          .from("clubs")
          .select("name")
          .eq("id", clubMembership.club_id)
          .maybeSingle();
        clubName = club?.name ?? null;
      }
      return <DashboardEmptyState clubName={clubName} />;
    }

    // staffLink existe → continuar para dashboard normal (staff convidado)
  }

  let firstTeamId: string | null = managedAgeGroups?.[0]?.teams?.[0]?.id ?? null;
  const managedTeamIds = (managedAgeGroups || [])
    .flatMap((ageGroup) => (ageGroup.teams || []).map((team) => team?.id).filter(Boolean))
    .filter((teamId): teamId is string => typeof teamId === "string");
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

  // Conta de staff convidado (não coordenador) — single query com join (era N+1)
  if (!firstTeamId) {
    const { data: staffEntry } = await db
      .from("age_group_staff")
      .select(
        "linked_team_id, age_group_id, age_groups(id, club_name, name, club_logo_url)",
      )
      .eq("profile_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    firstTeamId = staffEntry?.linked_team_id ?? null;

    type StaffAgeGroupJoin = {
      id: string;
      club_name: string;
      name: string;
      club_logo_url: string | null;
    };
    const joinedAgeGroup = (staffEntry?.age_groups as unknown) as StaffAgeGroupJoin | null;
    if (joinedAgeGroup) {
      activeAgeGroup = joinedAgeGroup;
    }
  }

  const { data: staffTeamRows } = await db
    .from("age_group_staff")
    .select("linked_team_id")
    .eq("profile_id", user.id);
  const staffTeamIds = (staffTeamRows || [])
    .map((row) => row.linked_team_id)
    .filter((teamId): teamId is string => typeof teamId === "string");

  const accessibleTeamIds = Array.from(
    new Set([...(managedTeamIds || []), ...(staffTeamIds || []), ...(firstTeamId ? [firstTeamId] : [])]),
  );

  const hasSetup = accessibleTeamIds.length > 0;

  // Server component nao tem acesso a useAgeGroup (React Context client).
  // Le o cookie escrito pelo AgeGroupContext para filtrar a vista por
  // escalao escolhido no <ScopeToggle>. Cookie ausente ou invalido
  // mantem comportamento agregado (legacy).
  const cookieStore = await cookies();
  const activeAgeGroupCookie = cookieStore.get("coach11_active_age_group")?.value;
  const activeAgeGroupId =
    activeAgeGroupCookie && activeAgeGroupCookie.length > 0
      ? decodeURIComponent(activeAgeGroupCookie)
      : null;

  let scopedTeamIds = accessibleTeamIds;
  if (activeAgeGroupId && managedAgeGroups) {
    const teamIdsForActiveAgeGroup = managedAgeGroups
      .filter((ag) => ag.id === activeAgeGroupId)
      .flatMap((ag) => (ag.teams || []).map((t) => t?.id).filter(Boolean))
      .filter((id): id is string => typeof id === "string");
    if (teamIdsForActiveAgeGroup.length > 0) {
      // Interseccao com accessibleTeamIds (defesa: nao expandir alem do permitido)
      const accessibleSet = new Set(accessibleTeamIds);
      scopedTeamIds = teamIdsForActiveAgeGroup.filter((id) => accessibleSet.has(id));
    }
  }

  const now = new Date();
  const todayDate = format(now, "yyyy-MM-dd");
  const pastWindowStart = format(addDays(now, -30), "yyyy-MM-dd");
  const futureWindowEnd = format(addDays(now, 30), "yyyy-MM-dd");

  // Treinos + jogos numa janela útil para paginação local do dashboard.
  let timelineTrainings: TrainingSession[] = [];
  let timelineGames: Game[] = [];
  if (accessibleTeamIds.length > 0) {
    const [{ data: trainingsData }, { data: gamesData }] = await Promise.all([
      db
        .from("training_sessions")
        .select("*")
        .in("team_id", scopedTeamIds)
        .gte("session_date", pastWindowStart)
        .lte("session_date", futureWindowEnd)
        .neq("status", "cancelled")
        .order("session_date", { ascending: true })
        .order("start_time", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true })
        .limit(80),
      db
        .from("games")
        .select("*")
        .in("team_id", scopedTeamIds)
        .gte("game_datetime", `${pastWindowStart}T00:00:00`)
        .lte("game_datetime", `${futureWindowEnd}T23:59:59`)
        .neq("status", "cancelled")
        .order("game_datetime", { ascending: true })
        .limit(80),
    ]);
    timelineTrainings = trainingsData || [];
    timelineGames = gamesData || [];
  }

  // Jogo live ativo:
  // Critério para evitar falsos positivos:
  // - checkpoint em first_half/second_half
  // - checkpoint atualizado nos últimos 8h
  // - jogo da equipa atual e não completed
  let activeLiveGame: {
    id: string;
    opponent_name: string | null;
    opponent_short_name: string | null;
    game_datetime: string;
    location: string | null;
    is_home: boolean;
    phase: "first_half" | "second_half";
    minute: number;
  } | null = null;

  if (accessibleTeamIds.length > 0) {
    const activityCutoffIso = new Date(now.getTime() - 8 * 60 * 60 * 1000).toISOString();
    const { data: checkpointRows, error: checkpointError } = await db
      .from("game_live_checkpoints")
      .select("game_id, phase, base_seconds, running_since_ms, updated_at")
      .in("phase", ["first_half", "second_half"])
      .gte("updated_at", activityCutoffIso)
      .order("updated_at", { ascending: false })
      .limit(10);

    if (!checkpointError && checkpointRows && checkpointRows.length > 0) {
      const checkpointGameIds = checkpointRows.map((row) => row.game_id);
      const { data: liveGames } = await db
        .from("games")
        .select("id, team_id, opponent_name, opponent_short_name, game_datetime, location, status, is_home")
        .in("id", checkpointGameIds)
        .in("team_id", scopedTeamIds)
        .neq("status", "completed");

      const liveGameById = new Map((liveGames || []).map((row) => [row.id, row]));
      const activeCheckpoint = checkpointRows.find((row) => liveGameById.has(row.game_id));

      if (activeCheckpoint) {
        const gameRow = liveGameById.get(activeCheckpoint.game_id);
        if (gameRow) {
          const baseSeconds =
            typeof activeCheckpoint.base_seconds === "number"
              ? Math.max(0, Math.floor(activeCheckpoint.base_seconds))
              : 0;
          const runningSinceMs =
            typeof activeCheckpoint.running_since_ms === "number"
              ? activeCheckpoint.running_since_ms
              : null;
          const runningExtraSeconds = runningSinceMs
            ? Math.max(0, Math.floor((now.getTime() - runningSinceMs) / 1000))
            : 0;
          const totalSeconds = baseSeconds + runningExtraSeconds;
          activeLiveGame = {
            id: gameRow.id,
            opponent_name: gameRow.opponent_name ?? null,
            opponent_short_name: gameRow.opponent_short_name ?? null,
            game_datetime: gameRow.game_datetime,
            location: gameRow.location ?? null,
            is_home: gameRow.is_home ?? true,
            phase: activeCheckpoint.phase as "first_half" | "second_half",
            minute: Math.floor(totalSeconds / 60) + 1,
          };
        }
      }
    }

    // Fallback: if checkpoint query doesn't produce a live game,
    // still show games explicitly marked as "live".
    if (!activeLiveGame) {
      const { data: fallbackLiveGames } = await db
        .from("games")
        .select("id, opponent_name, opponent_short_name, game_datetime, location, status, updated_at, is_home")
        .in("team_id", scopedTeamIds)
        .eq("status", "live")
        .order("updated_at", { ascending: false })
        .limit(1);

      const fallbackGame = fallbackLiveGames?.[0];
      if (fallbackGame) {
        activeLiveGame = {
          id: fallbackGame.id,
          opponent_name: fallbackGame.opponent_name ?? null,
          opponent_short_name: fallbackGame.opponent_short_name ?? null,
          game_datetime: fallbackGame.game_datetime,
          location: fallbackGame.location ?? null,
          is_home: fallbackGame.is_home ?? true,
          phase: "first_half",
          minute: 1,
        };
      }
    }
  }

  // Jogos com qualquer convocatória criada (mesmo draft) deixam de pedir criação.
  const gamesWithConvocationIds = new Set<string>();
  if (timelineGames.length > 0) {
    const upcomingGameIds = timelineGames.map((g) => g.id);
    const { data: existingConvocations } = await db
      .from("convocations")
      .select("game_id, status")
      .in("game_id", upcomingGameIds)
      .in("status", ["confirmed", "closed", "draft"]);
    (existingConvocations || []).forEach((c) => {
      // Qualquer convocatória existente (mesmo draft) fecha o alerta de criação.
      if (c.game_id) gamesWithConvocationIds.add(c.game_id);
    });
  }

  // Treino de hoje especificamente (para presenças)
  const todayTrainings = timelineTrainings.filter((t) => t.session_date === todayDate);
  const todayTraining =
    todayTrainings.find((training) => training.status !== "completed") ||
    todayTrainings[0];
  const todayTrainingPromptState = todayTraining
    ? getPresencePromptState(
        todayTraining.session_date,
        todayTraining.start_time,
        todayTraining.end_time,
        todayTraining.status,
        now,
      )
    : "hidden";
  const todayTrainingDone = todayTrainingPromptState === "closed";

  const dashboardEvents = [
    ...timelineTrainings.map((training) => {
      const trainingPriority = getTrainingDashboardPriorityState(
        training.session_date,
        training.start_time,
        training.end_time,
        training.status,
        now,
      );

      return {
        id: `training-${training.id}`,
        type: "training" as const,
        href: `/trainings?open=${training.id}`,
        title: training.title?.trim() || "Treino",
        subtitle: `${relativeDay(training.session_date)}${
          training.start_time ? ` · ${training.start_time.substring(0, 5)}` : ""
        }${training.location ? ` · ${training.location}` : ""}`,
        sortTs: toTimestampFromDateAndTime(
          training.session_date,
          training.start_time,
        ),
        isPriority: trainingPriority.isPriority,
        showPresenceCta: trainingPriority.isPriority,
        presenceCtaMode: trainingPriority.presenceCtaMode,
        presenceCtaHref: trainingPriority.isPriority
          ? `/attendance?date=${training.session_date}`
          : undefined,
      };
    }),
    ...timelineGames
      .filter((game) => game.id !== activeLiveGame?.id)
      .map((game) => {
        const gamePriority = getGameDashboardPriorityState(
          game.game_datetime,
          game.status,
          gamesWithConvocationIds.has(game.id),
          now,
        );

        return {
          id: `game-${game.id}`,
          type: "game" as const,
          href: `/games/${game.id}`,
          title: game.opponent_name
            ? formatFixtureOpponentLabel({
                isHome: game.is_home,
                opponentName: game.opponent_name,
                opponentShortName: game.opponent_short_name,
              })
            : "Jogo",
          subtitle: `${relativeDay(game.game_datetime?.split("T")[0])}${
            game.game_datetime
              ? ` · ${game.game_datetime.split("T")[1]?.substring(0, 5)}`
              : ""
          }${game.location ? ` · ${game.location}` : ""}`,
          sortTs: toTimestampFromDateTime(game.game_datetime),
          isPriority: gamePriority.isPriority,
          needsConvocation: gamePriority.needsConvocation,
          convocationCtaMode: gamePriority.convocationCtaMode,
        };
      }),
  ].sort((a, b) => a.sortTs - b.sortTs);

  const today = format(new Date(), "EEEE, d 'de' MMMM", { locale: pt });
  const firstName = profile?.full_name?.split(" ")[0] || "Treinador";

  const hasPending =
    !!activeLiveGame ||
    dashboardEvents.length > 0;

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
              <Link href="/onboarding">
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

            {activeLiveGame && (
              <Link href={`/games/${activeLiveGame.id}/live`}>
                <div className="flex items-center gap-3 p-4 bg-rose-50 border-2 border-rose-300 rounded-xl hover:border-rose-400 transition-colors">
                  <Play size={20} className="text-rose-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-rose-900 text-sm">
                      Jogo a decorrer
                    </p>
                    <p className="text-rose-700 text-xs truncate">
                      {activeLiveGame.opponent_name
                        ? formatFixtureOpponentLabel({
                            isHome: activeLiveGame.is_home,
                            opponentName: activeLiveGame.opponent_name,
                            opponentShortName: activeLiveGame.opponent_short_name,
                          })
                        : "Jogo"}{" "}
                      · {activeLiveGame.phase === "first_half" ? "1ª parte" : "2ª parte"} ·{" "}
                      {activeLiveGame.minute}&apos;
                    </p>
                  </div>
                  <span className="text-rose-600 text-xs font-medium">Continuar →</span>
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

            {dashboardEvents.length > 0 && (
              <DashboardEventsWindow events={dashboardEvents} anchorTs={now.getTime()} />
            )}

            {!hasPending && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center">
                <p className="text-slate-400 text-sm">
                  Sem eventos recentes para mostrar ✓
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
