import { NextResponse } from "next/server";
import { getSuperUserAccess } from "@/lib/auth/super-user.server";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const runtime = "nodejs";

type ClubRow = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  plan_type: string;
  created_at: string;
};

type AgeGroupRow = {
  id: string;
  name: string;
  football_format: string | null;
};

export type AdminClubSnapshotAgeGroup = {
  id: string;
  name: string;
  football_format: string | null;
  n_players: number;
  n_staff: number;
  trainings_last_7d: number;
  games_last_7d: number;
  last_activity_at: string | null;
};

export type AdminClubSnapshotCoordinator = {
  profile_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  last_sign_in_at: string | null;
  joined_at: string | null;
};

export type AdminClubSnapshotPayload = {
  club: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    plan_type: "individual" | "club";
    created_at: string;
  };
  totals: {
    n_age_groups: number;
    n_players: number;
    n_staff: number;
    trainings_last_7d: number;
    games_last_7d: number;
  };
  coordinators: AdminClubSnapshotCoordinator[];
  age_groups: AdminClubSnapshotAgeGroup[];
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function toIsoDateOnly(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const access = await getSuperUserAccess();
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const { id: clubId } = await context.params;

    const { data: clubRow, error: clubError } = await access.admin
      .from("clubs")
      .select("id, name, slug, logo_url, plan_type, created_at")
      .eq("id", clubId)
      .maybeSingle();

    if (clubError) {
      return NextResponse.json(
        { error: "Erro ao carregar clube." },
        { status: 500 },
      );
    }
    if (!clubRow) {
      return NextResponse.json({ error: "Clube nao encontrado." }, { status: 404 });
    }

    const club = clubRow as ClubRow;
    const planType: "individual" | "club" =
      club.plan_type === "individual" ? "individual" : "club";

    const now = Date.now();
    const since7dIso = new Date(now - SEVEN_DAYS_MS).toISOString();
    const since7dDate = toIsoDateOnly(new Date(now - SEVEN_DAYS_MS));

    // --- Totals + age groups list em paralelo ---
    const [ageGroupsRes, totalPlayersRes, totalStaffRes, totalTrainingsRes, totalGamesRes] =
      await Promise.all([
        access.admin
          .from("age_groups")
          .select("id, name, football_format")
          .eq("club_id", clubId)
          .order("created_at", { ascending: true }),
        access.admin
          .from("players")
          .select("id", { count: "exact", head: true })
          .eq("club_id", clubId),
        access.admin
          .from("age_group_staff")
          .select("id", { count: "exact", head: true })
          .eq("club_id", clubId),
        access.admin
          .from("training_sessions")
          .select("id", { count: "exact", head: true })
          .eq("club_id", clubId)
          .gte("session_date", since7dDate),
        access.admin
          .from("games")
          .select("id", { count: "exact", head: true })
          .eq("club_id", clubId)
          .gte("game_datetime", since7dIso),
      ]);

    const ageGroups = (ageGroupsRes.data || []) as AgeGroupRow[];

    // --- Por escalao: counts em paralelo ---
    const ageGroupsEnriched: AdminClubSnapshotAgeGroup[] = await Promise.all(
      ageGroups.map(async (ag) => {
        const [
          playersRes,
          staffRes,
          trainingsRes,
          gamesRes,
          lastTrainingRes,
          lastGameRes,
        ] = await Promise.all([
          access.admin
            .from("players")
            .select("id", { count: "exact", head: true })
            .eq("age_group_id", ag.id),
          access.admin
            .from("age_group_staff")
            .select("id", { count: "exact", head: true })
            .eq("age_group_id", ag.id),
          access.admin
            .from("training_sessions")
            .select("id", { count: "exact", head: true })
            .eq("age_group_id", ag.id)
            .gte("session_date", since7dDate),
          access.admin
            .from("games")
            .select("id", { count: "exact", head: true })
            .eq("age_group_id", ag.id)
            .gte("game_datetime", since7dIso),
          access.admin
            .from("training_sessions")
            .select("session_date")
            .eq("age_group_id", ag.id)
            .order("session_date", { ascending: false })
            .limit(1)
            .maybeSingle(),
          access.admin
            .from("games")
            .select("game_datetime")
            .eq("age_group_id", ag.id)
            .order("game_datetime", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

        const lastTrainingIso = lastTrainingRes.data?.session_date
          ? new Date(`${lastTrainingRes.data.session_date}T00:00:00Z`).toISOString()
          : null;
        const lastGameIso = lastGameRes.data?.game_datetime ?? null;
        const lastActivityAt = [lastTrainingIso, lastGameIso]
          .filter((v): v is string => Boolean(v))
          .sort()
          .pop() ?? null;

        return {
          id: ag.id,
          name: ag.name,
          football_format: ag.football_format,
          n_players: playersRes.count ?? 0,
          n_staff: staffRes.count ?? 0,
          trainings_last_7d: trainingsRes.count ?? 0,
          games_last_7d: gamesRes.count ?? 0,
          last_activity_at: lastActivityAt,
        };
      }),
    );

    // --- Coordenadores (role club_coordinator/owner/admin) ---
    const { data: membershipsData } = await access.admin
      .from("club_memberships")
      .select("profile_id, role, created_at")
      .eq("club_id", clubId)
      .in("role", ["club_coordinator", "owner", "admin"]);

    const memberships = (membershipsData || []) as Array<{
      profile_id: string;
      role: string;
      created_at: string;
    }>;
    const profileIds = memberships.map((m) => m.profile_id);

    let coordinators: AdminClubSnapshotCoordinator[] = [];
    if (profileIds.length > 0) {
      const [profilesRes, usersRes] = await Promise.all([
        access.admin
          .from("profiles")
          .select("id, full_name, email, avatar_url")
          .in("id", profileIds),
        access.admin.auth.admin.listUsers({ perPage: 200 }),
      ]);

      const profilesById = new Map(
        (profilesRes.data || []).map((row) => [row.id as string, row]),
      );
      const usersById = new Map(
        (usersRes.data?.users || []).map((u) => [u.id, u]),
      );

      coordinators = memberships
        .map<AdminClubSnapshotCoordinator | null>((m) => {
          const profile = profilesById.get(m.profile_id);
          const user = usersById.get(m.profile_id);
          if (!profile) return null;
          return {
            profile_id: m.profile_id,
            full_name: (profile.full_name as string | null) ?? null,
            email: (profile.email as string | null) ?? user?.email ?? null,
            avatar_url: (profile.avatar_url as string | null) ?? null,
            last_sign_in_at: user?.last_sign_in_at ?? null,
            joined_at: m.created_at,
          };
        })
        .filter((v): v is AdminClubSnapshotCoordinator => v !== null);
    }

    const payload: AdminClubSnapshotPayload = {
      club: {
        id: club.id,
        name: club.name,
        slug: club.slug,
        logo_url: club.logo_url,
        plan_type: planType,
        created_at: club.created_at,
      },
      totals: {
        n_age_groups: ageGroups.length,
        n_players: totalPlayersRes.count ?? 0,
        n_staff: totalStaffRes.count ?? 0,
        trainings_last_7d: totalTrainingsRes.count ?? 0,
        games_last_7d: totalGamesRes.count ?? 0,
      },
      coordinators,
      age_groups: ageGroupsEnriched,
    };

    return NextResponse.json({ success: true, snapshot: payload });
  } catch (error) {
    return respondInternalError("api.admin.clubs.snapshot.get", error);
  }
}
