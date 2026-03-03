import { NextResponse } from "next/server";
import { getSuperUserAccess } from "@/lib/auth/super-user.server";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { buildPublicAccessUrl } from "@/lib/public-share";

export const runtime = "nodejs";

export async function GET() {
  try {
    const access = await getSuperUserAccess();
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const { data: ageGroups, error } = await access.admin
      .from("age_groups")
      .select("id, club_name, name, public_slug, public_access_enabled, coordinator_id")
      .not("public_slug", "is", null)
      .order("club_name", { ascending: true })
      .order("name", { ascending: true })
      .limit(200);

    if (error) {
      return NextResponse.json(
        { error: "Não foi possível carregar os links públicos." },
        { status: 500 },
      );
    }

    const coordinatorIds = Array.from(
      new Set(
        (ageGroups || [])
          .map((row) => row.coordinator_id)
          .filter((value): value is string => typeof value === "string"),
      ),
    );

    const coordinatorsRes =
      coordinatorIds.length > 0
        ? await access.admin
            .from("profiles")
            .select("id, full_name, email")
            .in("id", coordinatorIds)
        : { data: [], error: null };

    if (coordinatorsRes.error) {
      return NextResponse.json(
        { error: "Não foi possível enriquecer a lista de links públicos." },
        { status: 500 },
      );
    }

    const coordinatorById = new Map(
      (coordinatorsRes.data || []).map((row) => [row.id, row]),
    );

    return NextResponse.json({
      success: true,
      links: (ageGroups || []).map((ageGroup) => ({
        id: ageGroup.id,
        age_group_id: ageGroup.id,
        public_slug: ageGroup.public_slug,
        public_access_enabled: ageGroup.public_access_enabled === true,
        url: ageGroup.public_slug ? buildPublicAccessUrl(ageGroup.public_slug) : null,
        ageGroup: {
          id: ageGroup.id,
          club_name: ageGroup.club_name,
          name: ageGroup.name,
        },
        coordinator: ageGroup.coordinator_id
          ? coordinatorById.get(ageGroup.coordinator_id) || null
          : null,
      })),
    });
  } catch (error) {
    return respondInternalError("api.admin.public-links.list.get", error);
  }
}
