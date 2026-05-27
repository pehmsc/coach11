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

export type AdminClubsListItem = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  plan_type: "individual" | "club";
  created_at: string;
  n_age_groups: number;
  n_players: number;
  n_staff: number;
  /** Numero de facturas em atraso (status='issued' e due_date < hoje) */
  overdue_invoices: number;
};

export async function GET() {
  try {
    const access = await getSuperUserAccess();
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const { data: clubs, error } = await access.admin
      .from("clubs")
      .select("id, name, slug, logo_url, plan_type, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: "Nao foi possivel carregar a lista de clubes." },
        { status: 500 },
      );
    }

    const today = new Date().toISOString().slice(0, 10);

    const enriched: AdminClubsListItem[] = await Promise.all(
      ((clubs || []) as ClubRow[]).map(async (club) => {
        const [ageGroupsRes, playersRes, staffRes, overdueRes] = await Promise.all([
          access.admin
            .from("age_groups")
            .select("id", { count: "exact", head: true })
            .eq("club_id", club.id),
          access.admin
            .from("players")
            .select("id", { count: "exact", head: true })
            .eq("club_id", club.id),
          access.admin
            .from("age_group_staff")
            .select("id", { count: "exact", head: true })
            .eq("club_id", club.id),
          access.admin
            .from("invoices")
            .select("id", { count: "exact", head: true })
            .eq("club_id", club.id)
            .eq("status", "issued")
            .lt("due_date", today),
        ]);

        return {
          id: club.id,
          name: club.name,
          slug: club.slug,
          logo_url: club.logo_url,
          plan_type: club.plan_type === "individual" ? "individual" : "club",
          created_at: club.created_at,
          n_age_groups: ageGroupsRes.count ?? 0,
          n_players: playersRes.count ?? 0,
          n_staff: staffRes.count ?? 0,
          overdue_invoices: overdueRes.count ?? 0,
        };
      }),
    );

    return NextResponse.json({
      success: true,
      clubs: enriched,
    });
  } catch (error) {
    return respondInternalError("api.admin.clubs.list.get", error);
  }
}
