import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildPublicAccessUrl, slugifyPublicAccessSegment } from "@/lib/public-share";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const runtime = "nodejs";

type AgeGroupAccessRecord = {
  id: string;
  coordinator_id: string | null;
  club_name: string | null;
  name: string | null;
  public_slug: string | null;
  public_access_enabled: boolean | null;
};

const AgeGroupSchema = z.object({
  ageGroupId: z.string().uuid(),
});

const PatchSchema = AgeGroupSchema.extend({
  publicAccessEnabled: z.boolean(),
});

async function assertCanManagePublicShare(userId: string, ageGroupId: string) {
  const admin = createAdminClient();
  const [{ data: ageGroup, error: ageGroupError }, { data: profile, error: profileError }] =
    await Promise.all([
      admin
        .from("age_groups")
        .select("id, coordinator_id, club_name, name, public_slug, public_access_enabled")
        .eq("id", ageGroupId)
        .maybeSingle(),
      admin
        .from("profiles")
        .select("id, is_super_coordinator")
        .eq("id", userId)
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
  const isAgeGroupCoordinator = ageGroup.coordinator_id === userId;

  if (!isSuperCoordinator && !isAgeGroupCoordinator) {
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
    ageGroup: ageGroup as AgeGroupAccessRecord,
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
) {
  if (ageGroup.public_slug) {
    return {
      age_group_id: ageGroup.id,
      public_slug: ageGroup.public_slug,
      public_access_enabled: ageGroup.public_access_enabled === true,
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
  };
}

function serializeShareState(record: {
  age_group_id: string;
  public_slug: string;
  public_access_enabled: boolean;
}) {
  return {
    age_group_id: record.age_group_id,
    public_slug: record.public_slug,
    public_access_enabled: record.public_access_enabled,
    url: buildPublicAccessUrl(record.public_slug),
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

    const access = await assertCanManagePublicShare(auth.user.id, parsed.ageGroupId);
    if (!access.ok) return access.response;

    const share = await ensurePublicShareState(access.admin, access.ageGroup);

    return NextResponse.json({
      success: true,
      share: serializeShareState(share),
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

  return NextResponse.json({
    success: true,
    share: serializeShareState({
      age_group_id: data.id,
      public_slug: data.public_slug,
      public_access_enabled: data.public_access_enabled === true,
    }),
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
