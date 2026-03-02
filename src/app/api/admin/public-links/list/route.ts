import { NextResponse } from "next/server";
import { getSuperUserAccess } from "@/lib/auth/super-user.server";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { getPublicShareUrlFromEncryptedToken } from "@/lib/public-share";

export const runtime = "nodejs";

export async function GET() {
  try {
    const access = await getSuperUserAccess();
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    let links:
      | Array<{
          id: string;
          age_group_id: string;
          created_by: string;
          expires_at: string | null;
          revoked_at: string | null;
          last_accessed_at: string | null;
          access_count: number;
          created_at: string;
          token_encrypted?: string | null;
        }>
      | null = null;

    const modernRes = await access.admin
      .from("public_share_tokens")
      .select(
        "id, age_group_id, created_by, expires_at, revoked_at, last_accessed_at, access_count, created_at, token_encrypted",
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (modernRes.error && modernRes.error.message.toLowerCase().includes("token_encrypted")) {
      const legacyRes = await access.admin
        .from("public_share_tokens")
        .select(
          "id, age_group_id, created_by, expires_at, revoked_at, last_accessed_at, access_count, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(200);

      if (legacyRes.error) {
        return NextResponse.json(
          { error: "Não foi possível carregar os links públicos." },
          { status: 500 },
        );
      }

      links = legacyRes.data;
    } else if (modernRes.error) {
      return NextResponse.json(
        { error: "Não foi possível carregar os links públicos." },
        { status: 500 },
      );
    } else {
      links = modernRes.data;
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
        id: link.id,
        age_group_id: link.age_group_id,
        created_by: link.created_by,
        expires_at: link.expires_at,
        revoked_at: link.revoked_at,
        last_accessed_at: link.last_accessed_at,
        access_count: link.access_count,
        created_at: link.created_at,
        url: getPublicShareUrlFromEncryptedToken(link.token_encrypted),
        requiresRegeneration: !getPublicShareUrlFromEncryptedToken(link.token_encrypted),
        ageGroup: ageGroupById.get(link.age_group_id) || null,
        createdBy: creatorById.get(link.created_by) || null,
      })),
    });
  } catch (error) {
    return respondInternalError("api.admin.public-links.list.get", error);
  }
}
