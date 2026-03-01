import { NextResponse } from "next/server";
import { getSuperUserAccess } from "@/lib/auth/super-user.server";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const runtime = "nodejs";

export async function GET() {
  try {
    const access = await getSuperUserAccess();
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const { data: links, error } = await access.admin
      .from("public_share_tokens")
      .select(
        "id, age_group_id, created_by, expires_at, revoked_at, last_accessed_at, access_count, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      return NextResponse.json(
        { error: "Não foi possível carregar os links públicos." },
        { status: 500 },
      );
    }

    const ageGroupIds = Array.from(
      new Set((links || []).map((row) => row.age_group_id).filter(Boolean)),
    );
    const createdByIds = Array.from(
      new Set((links || []).map((row) => row.created_by).filter(Boolean)),
    );

    const [ageGroupsRes, creatorsRes] = await Promise.all([
      ageGroupIds.length > 0
        ? access.admin
            .from("age_groups")
            .select("id, club_name, name")
            .in("id", ageGroupIds)
        : Promise.resolve({ data: [], error: null }),
      createdByIds.length > 0
        ? access.admin
            .from("profiles")
            .select("id, full_name, email")
            .in("id", createdByIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (ageGroupsRes.error || creatorsRes.error) {
      return NextResponse.json(
        { error: "Não foi possível enriquecer a lista de links públicos." },
        { status: 500 },
      );
    }

    const ageGroupById = new Map(
      (ageGroupsRes.data || []).map((row) => [row.id, row]),
    );
    const creatorById = new Map(
      (creatorsRes.data || []).map((row) => [row.id, row]),
    );

    return NextResponse.json({
      success: true,
      links: (links || []).map((link) => ({
        ...link,
        ageGroup: ageGroupById.get(link.age_group_id) || null,
        createdBy: creatorById.get(link.created_by) || null,
      })),
    });
  } catch (error) {
    return respondInternalError("api.admin.public-links.list.get", error);
  }
}
