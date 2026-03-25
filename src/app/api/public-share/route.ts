import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildPublicAccessUrl,
  getPublicAccessStatsForAgeGroups,
  slugifyPublicAccessSegment,
} from "@/lib/public-share";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { resolveUserTeamContext } from "@/lib/auth/team-context";

export const runtime = "nodejs";

type AgeGroupAccessRecord = {
  id: string;
  coordinator_id: string | null;
  club_name: string | null;
  name: string | null;
  public_slug: string | null;
  public_access_enabled: boolean | null;
  public_access_count: number | null;
  public_last_accessed_at: string | null;
};

type PublicShareState = {
  age_group_id: string;
  public_slug: string;
  public_access_enabled: boolean;
  access_count: number;
  last_accessed_at: string | null;
};

const AgeGroupSchema = z.object({
  ageGroupId: z.string().uuid(),
});

const PatchSchema = AgeGroupSchema.extend({
  publicAccessEnabled: z.boolean(),
});

const CLUB_COORDINATOR_ROLES = new Set(["coordinator", "club_coordinator", "owner", "admin"]);

async function assertCanManagePublicShare(userId: string, ageGroupId: string) {
  const admin = createAdminClient();
  const [
    { data: ageGroup, error: ageGroupError },
    { data: profile, error: profileError },
    { data: clubMembership },
    { data: staffEntry },
  ] = await Promise.all([
    admin
      .from("age_groups")
      .select("id, coordinator_id, club_id, club_name, name, public_slug, public_access_enabled")
      .eq("id", ageGroupId)
      .maybeSingle(),
    admin
      .from("profiles")
      .select("id, is_super_coordinator")
      .eq("id", userId)
      .maybeSingle(),
    admin
      .from("club_memberships")
      .select("role, club_id")
      .eq("profile_id", userId)
      .maybeSingle(),
    admin
      .from("age_group_staff")
      .select("role")
      .eq("profile_id", userId)
      .eq("age_group_id", ageGroupId)
      .maybeSingle(),
  ]);

  if (ageGroupError || profileError) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Não foi possível validar o escalão." },
        { status: 500 },
      ),
    };
  }

  if (!ageGroup) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Escalão não encontrado." }, { status: 404 }),
    };
  }

  const isSuperCoordinator = profile?.is_super_coordinator === true;
  // coordinator_id directo no escalão
  const isAgeGroupCoordinator = ageGroup.coordinator_id === userId;
  // age_group_coordinator via age_group_staff
  const isAgeGroupCoordRole = staffEntry?.role === "age_group_coordinator";
  // club_coordinator via club_memberships (mesmo clube do escalão)
  const ageGroupClubId = (ageGroup as Record<string, unknown>).club_id as string | null;
  const isClubCoordinator =
    clubMembership != null &&
    CLUB_COORDINATOR_ROLES.has(clubMembership.role) &&
    clubMembership.club_id === ageGroupClubId;

  if (!isSuperCoordinator && !isAgeGroupCoordinator && !isAgeGroupCoordRole && !isClubCoordinator) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Apenas o coordenador do escalão pode gerir o link público." },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true as const,
    admin,
    ageGroup: ageGroup as unknown as AgeGroupAccessRecord,
  };
}

async function assertCanViewPublicShare(userId: string, ageGroupId: string) {
  const admin = createAdminClient();
  const [context, ageGroupResult] = await Promise.all([
    resolveUserTeamContext(admin, userId),
    admin
      .from("age_groups")
      .select(
        "id, coordinator_id, club_name, name, public_slug, public_access_enabled, public_access_count, public_last_accessed_at",
      )
      .eq("id", ageGroupId)
      .maybeSingle(),
  ]);

  if (ageGroupResult.error) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Não foi possível validar o escalão." },
        { status: 500 },
      ),
    };
  }

  if (!ageGroupResult.data) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Escalão não encontrado." }, { status: 404 }),
    };
  }

  if (!context.accessibleAgeGroupIds.includes(ageGroupId)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Sem permissões para consultar este link público." },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true as const,
    admin,
    ageGroup: ageGroupResult.data as AgeGroupAccessRecord,
  };
}

function parseAgeGroupId(value: unknown) {
  const parsed = AgeGroupSchema.safeParse({ ageGroupId: value });
  if (!parsed.success) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "ageGroupId inválido.", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      ),
    };
  }

  return {
    ok: true as const,
    ageGroupId: parsed.data.ageGroupId,
  };
}

async function resolveUniquePublicSlug(
  admin: ReturnType<typeof createAdminClient>,
  ageGroup: AgeGroupAccessRecord,
) {
  const baseSlug =
    slugifyPublicAccessSegment(
      `${ageGroup.club_name || "coach11"} ${ageGroup.name || "escalao"}`,
    ) || `escalao-${ageGroup.id.slice(0, 8)}`;

  let candidate = baseSlug;
  let suffix = 2;

  while (true) {
    const { data, error } = await admin
      .from("age_groups")
      .select("id")
      .eq("public_slug", candidate)
      .neq("id", ageGroup.id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return candidate;
    }

    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

async function ensurePublicShareState(
  admin: ReturnType<typeof createAdminClient>,
  ageGroup: AgeGroupAccessRecord,
): Promise<PublicShareState> {
  if (ageGroup.public_slug) {
    return {
      age_group_id: ageGroup.id,
      public_slug: ageGroup.public_slug,
      public_access_enabled: ageGroup.public_access_enabled === true,
      access_count: Math.max(0, ageGroup.public_access_count ?? 0),
      last_accessed_at: ageGroup.public_last_accessed_at ?? null,
    };
  }

  const publicSlug = await resolveUniquePublicSlug(admin, ageGroup);
  const { data, error } = await admin
    .from("age_groups")
    .update({ public_slug: publicSlug })
    .eq("id", ageGroup.id)
    .select("id, public_slug, public_access_enabled")
    .single();

  if (error || !data) {
    throw error || new Error("public_slug_update_failed");
  }

  return {
    age_group_id: data.id,
    public_slug: data.public_slug as string,
    public_access_enabled: data.public_access_enabled === true,
    access_count: 0,
    last_accessed_at: null,
  };
}

async function revokeLegacyPublicTokens(
  admin: ReturnType<typeof createAdminClient>,
  ageGroupId: string,
) {
  const { error } = await admin
    .from("public_share_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("age_group_id", ageGroupId)
    .is("revoked_at", null);

  if (error) {
    throw error;
  }
}

async function loadPublicShareStats(
  admin: ReturnType<typeof createAdminClient>,
  ageGroupId: string,
) {
  const stats = await getPublicAccessStatsForAgeGroups(admin, [ageGroupId]);
  return (
    stats.get(ageGroupId) ?? {
      accessCount: 0,
      lastAccessedAt: null,
    }
  );
}

function serializeShareState(
  record: PublicShareState,
  stats?: { accessCount: number; lastAccessedAt: string | null },
) {
  return {
    age_group_id: record.age_group_id,
    public_slug: record.public_slug,
    public_access_enabled: record.public_access_enabled,
    url: buildPublicAccessUrl(record.public_slug),
    access_count: stats?.accessCount ?? record.access_count,
    last_accessed_at: stats?.lastAccessedAt ?? record.last_accessed_at,
  };
}

async function authenticateUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Não autenticado." }, { status: 401 }),
    };
  }

  return {
    ok: true as const,
    user,
  };
}

export async function GET(request: Request) {
  try {
    const auth = await authenticateUser();
    if (!auth.ok) return auth.response;

    const ageGroupId = new URL(request.url).searchParams.get("ageGroupId");
    const parsed = parseAgeGroupId(ageGroupId);
    if (!parsed.ok) return parsed.response;

    const access = await assertCanViewPublicShare(auth.user.id, parsed.ageGroupId);
    if (!access.ok) return access.response;

    const share = await ensurePublicShareState(access.admin, access.ageGroup);
    await revokeLegacyPublicTokens(access.admin, parsed.ageGroupId);
    const stats = await loadPublicShareStats(access.admin, parsed.ageGroupId);

    return NextResponse.json({
      success: true,
      share: serializeShareState(share, stats),
    });
  } catch (error) {
    return respondInternalError("api.public-share.get", error);
  }
}

async function updatePublicShareState(request: Request, enabled: boolean | null) {
  const auth = await authenticateUser();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed =
    enabled == null
      ? PatchSchema.safeParse(body)
      : PatchSchema.safeParse({
          ...(body && typeof body === "object" ? body : {}),
          publicAccessEnabled: enabled,
        });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos.", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const access = await assertCanManagePublicShare(auth.user.id, parsed.data.ageGroupId);
  if (!access.ok) return access.response;

  const share = await ensurePublicShareState(access.admin, access.ageGroup);
  await revokeLegacyPublicTokens(access.admin, parsed.data.ageGroupId);
  const { data, error } = await access.admin
    .from("age_groups")
    .update({ public_access_enabled: parsed.data.publicAccessEnabled })
    .eq("id", parsed.data.ageGroupId)
    .select("id, public_slug, public_access_enabled")
    .single();

  if (error || !data?.public_slug) {
    return NextResponse.json(
      { error: "Não foi possível atualizar o acesso público." },
      { status: 500 },
    );
  }

  const stats = await loadPublicShareStats(access.admin, parsed.data.ageGroupId);

  return NextResponse.json({
    success: true,
    share: serializeShareState(
      {
        age_group_id: data.id,
        public_slug: data.public_slug,
        public_access_enabled: data.public_access_enabled === true,
        access_count: 0,
        last_accessed_at: null,
      },
      stats,
    ),
    previous: serializeShareState(share),
  });
}

export async function PATCH(request: Request) {
  try {
    return await updatePublicShareState(request, null);
  } catch (error) {
    return respondInternalError("api.public-share.patch", error);
  }
}

export async function POST(request: Request) {
  try {
    return await updatePublicShareState(request, true);
  } catch (error) {
    return respondInternalError("api.public-share.post", error);
  }
}

export async function DELETE(request: Request) {
  try {
    return await updatePublicShareState(request, false);
  } catch (error) {
    return respondInternalError("api.public-share.delete", error);
  }
}
