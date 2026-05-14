import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveUserTeamContext } from "@/lib/auth/team-context";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import {
  getGameResult,
  getOpponentScore,
  getOurScore,
} from "@/lib/games/score-helpers";

type RouteContext = {
  params: Promise<{ ageGroupId: string }>;
};

type GameRow = {
  id: string;
  status: string | null;
  is_home: boolean | null;
  score_home: number | null;
  score_away: number | null;
  game_datetime: string | null;
  opponent_name: string | null;
  location: string | null;
};

type TrainingRow = {
  id: string;
  status: string | null;
  session_date: string | null;
  start_time: string | null;
  title: string | null;
  ut_number: number | null;
  location: string | null;
};

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { ageGroupId } = await params;
    if (!ageGroupId) {
      return NextResponse.json({ error: "Escalao invalido." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
    }

    const context = await resolveUserTeamContext(supabase, user.id);
    if (!context.accessibleAgeGroupIds.includes(ageGroupId)) {
      return NextResponse.json(
        { error: "Sem permissoes para este escalao." },
        { status: 403 },
      );
    }

    const [
      ageGroupRes,
      playersActiveRes,
      staffRes,
      gamesRes,
      trainingsRes,
      opponentsRes,
      competitionsRes,
      attendanceRes,
    ] = await Promise.all([
      supabase
        .from("age_groups")
        .select(
          "id, name, age_level, tactical_system, football_format, club_id, club_name, club_short_name",
        )
        .eq("id", ageGroupId)
        .maybeSingle(),
      supabase
        .from("players")
        .select("id", { count: "exact", head: true })
        .eq("age_group_id", ageGroupId)
        .eq("status", "active"),
      supabase
        .from("age_group_staff")
        .select("id", { count: "exact", head: true })
        .eq("age_group_id", ageGroupId),
      supabase
        .from("games")
        .select(
          "id, status, is_home, score_home, score_away, game_datetime, opponent_name, location",
        )
        .eq("age_group_id", ageGroupId)
        .order("game_datetime", { ascending: false }),
      supabase
        .from("training_sessions")
        .select(
          "id, status, session_date, start_time, title, ut_number, location",
        )
        .eq("age_group_id", ageGroupId)
        .order("session_date", { ascending: false }),
      supabase
        .from("opponents")
        .select("id", { count: "exact", head: true })
        .eq("age_group_id", ageGroupId),
      supabase
        .from("competitions")
        .select("id, teams!inner(age_group_id)")
        .eq("teams.age_group_id", ageGroupId),
      supabase
        .from("training_attendance")
        .select(
          "status, training_sessions!inner(age_group_id, status)",
        )
        .eq("training_sessions.age_group_id", ageGroupId)
        .eq("training_sessions.status", "completed"),
    ]);

    if (ageGroupRes.error || !ageGroupRes.data) {
      return NextResponse.json(
        { error: "Escalao nao encontrado." },
        { status: 404 },
      );
    }

    const games = (gamesRes.data ?? []) as GameRow[];
    const trainings = (trainingsRes.data ?? []) as TrainingRow[];

    const completedGames = games.filter((g) => g.status === "completed");
    const scheduledGames = games.filter((g) => g.status === "scheduled");
    const scheduledTrainings = trainings.filter((t) => t.status === "scheduled");
    const completedTrainings = trainings.filter((t) => t.status === "completed");

    // Forma recente: últimos 5 jogos completed em ordem cronológica decrescente
    const recentForm = completedGames
      .slice(0, 5)
      .map((g) => {
        const r = getGameResult({
          score_home: g.score_home,
          score_away: g.score_away,
          is_home: g.is_home,
          status: g.status,
        });
        if (r === "W") return "V" as const;
        if (r === "L") return "D" as const;
        if (r === "D") return "E" as const;
        return null;
      })
      .filter((v): v is "V" | "E" | "D" => v !== null);

    let goalsScored = 0;
    let goalsConceded = 0;
    for (const g of completedGames) {
      const our = getOurScore({
        score_home: g.score_home,
        score_away: g.score_away,
        is_home: g.is_home,
      });
      const opp = getOpponentScore({
        score_home: g.score_home,
        score_away: g.score_away,
        is_home: g.is_home,
      });
      if (our !== null) goalsScored += our;
      if (opp !== null) goalsConceded += opp;
    }

    // Próximo evento (jogo ou treino mais cedo no futuro)
    const nowIso = new Date().toISOString();
    const nextGame = scheduledGames
      .filter((g) => g.game_datetime && g.game_datetime >= nowIso)
      .sort((a, b) =>
        (a.game_datetime ?? "").localeCompare(b.game_datetime ?? ""),
      )[0];
    const todayDate = nowIso.split("T")[0];
    const nextTraining = scheduledTrainings
      .filter((t) => t.session_date && t.session_date >= todayDate)
      .sort((a, b) => {
        const aKey = `${a.session_date}T${a.start_time ?? "00:00"}`;
        const bKey = `${b.session_date}T${b.start_time ?? "00:00"}`;
        return aKey.localeCompare(bKey);
      })[0];

    let nextEvent:
      | {
          type: "game" | "training";
          id: string;
          title: string;
          datetime: string;
          location: string | null;
        }
      | null = null;

    if (nextGame || nextTraining) {
      const gameTs = nextGame?.game_datetime ?? null;
      const trainingTs = nextTraining
        ? `${nextTraining.session_date}T${nextTraining.start_time ?? "00:00"}`
        : null;
      const pickGame =
        gameTs !== null &&
        (trainingTs === null || gameTs <= trainingTs);
      if (pickGame && nextGame) {
        const opp = nextGame.opponent_name ?? "Adversário";
        nextEvent = {
          type: "game",
          id: nextGame.id,
          title: `${nextGame.is_home ? "vs" : "@"} ${opp}`,
          datetime: nextGame.game_datetime ?? "",
          location: nextGame.location,
        };
      } else if (nextTraining) {
        nextEvent = {
          type: "training",
          id: nextTraining.id,
          title:
            nextTraining.title ||
            (nextTraining.ut_number
              ? `UT ${String(nextTraining.ut_number).padStart(2, "0")}`
              : "Treino"),
          datetime: `${nextTraining.session_date}T${nextTraining.start_time ?? "00:00"}`,
          location: nextTraining.location,
        };
      }
    }

    // Calendário: próximos 3 eventos
    const futureGames = scheduledGames
      .filter((g) => g.game_datetime && g.game_datetime >= nowIso)
      .map((g) => ({
        type: "game" as const,
        id: g.id,
        title: `${g.is_home ? "vs" : "@"} ${g.opponent_name ?? "Adversário"}`,
        datetime: g.game_datetime as string,
      }));
    const futureTrainings = scheduledTrainings
      .filter((t) => t.session_date && t.session_date >= todayDate)
      .map((t) => ({
        type: "training" as const,
        id: t.id,
        title:
          t.title ||
          (t.ut_number
            ? `UT ${String(t.ut_number).padStart(2, "0")}`
            : "Treino"),
        datetime: `${t.session_date}T${t.start_time ?? "00:00"}`,
      }));
    const upcoming = [...futureGames, ...futureTrainings]
      .sort((a, b) => a.datetime.localeCompare(b.datetime))
      .slice(0, 3);

    // Assiduidade = (present + late) / total dos registos de training_attendance
    // ligados a training_sessions completed deste escalão.
    let attendanceRate: number | null = null;
    const attendanceRows = (attendanceRes.data ?? []) as Array<{
      status: string | null;
    }>;
    if (!attendanceRes.error && attendanceRows.length > 0) {
      const total = attendanceRows.length;
      const presentOrLate = attendanceRows.filter(
        (r) => r.status === "present" || r.status === "late",
      ).length;
      attendanceRate = Math.round((presentOrLate / total) * 10000) / 100;
    }

    return NextResponse.json({
      success: true,
      ageGroup: ageGroupRes.data,
      counts: {
        players: playersActiveRes.count ?? 0,
        staff: staffRes.count ?? 0,
        games: {
          total: games.length,
          scheduled: scheduledGames.length,
          completed: completedGames.length,
        },
        trainings: {
          total: trainings.length,
          scheduled: scheduledTrainings.length,
          completed: completedTrainings.length,
        },
        opponents: opponentsRes.count ?? 0,
        competitions: (competitionsRes.data ?? []).length,
      },
      kpis: {
        recent_form: recentForm,
        goals: {
          scored: goalsScored,
          conceded: goalsConceded,
          diff: goalsScored - goalsConceded,
        },
        attendance_rate: attendanceRate,
      },
      next_event: nextEvent,
      upcoming_calendar: upcoming,
    });
  } catch (error) {
    return respondInternalError(
      "api.age-groups.hub-summary.get",
      error,
      { request },
    );
  }
}
