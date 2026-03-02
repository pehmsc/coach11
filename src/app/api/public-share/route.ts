import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildPublicShareUrl,
  encryptPublicShareToken,
  generatePublicShareToken,
  getPublicShareUrlFromEncryptedToken,
  hashPublicShareToken,
} from "@/lib/public-share";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const runtime = "nodejs";

type PublicShareRecord = {
  id: string;
  age_group_id: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_accessed_at: string | null;
  access_count: number;
  created_at: string;
  token_encrypted?: string | null;
};

const AgeGroupSchema = z.object({
  ageGroupId: z.string().uuid(),
});

async function assertCanManagePublicShare(
  userId: string,
  ageGroupId: string,
) {
  const admin = createAdminClient();
  const [{ data: ageGroup, error: ageGroupError }, { data: profile, error: profileError }] =
    await Promise.all([
      admin
        .from("age_groups")
        .select("id, coordinator_id")
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
    isSuperCoordinator,
    isAgeGroupCoordinator,
  };
}

function parseBodySchema(body: unknown) {
  const parsed = AgeGroupSchema.safeParse(body);
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

function serializeShare(record: PublicShareRecord | null) {
  if (!record) {
    return {
      share: null,
      url: null,
      requiresRegeneration: false,
    };
  }

  const { token_encrypted, ...share } = record;
  const url = getPublicShareUrlFromEncryptedToken(token_encrypted);

  return {
    share,
    url,
    requiresRegeneration: !url,
  };
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const ageGroupId = new URL(request.url).searchParams.get("ageGroupId");
    const parsed = parseBodySchema({ ageGroupId });
    if (!parsed.ok) return parsed.response;

    const access = await assertCanManagePublicShare(user.id, parsed.ageGroupId);
    if (!access.ok) return access.response;

    console.log("[public-share.get] request", {
      userId: user.id,
      ageGroupId: parsed.ageGroupId,
      isSuperCoordinator: access.isSuperCoordinator,
      isAgeGroupCoordinator: access.isAgeGroupCoordinator,
    });

    const nowIso = new Date().toISOString();
    let data: PublicShareRecord | null = null;
    const modernRes = await access.admin
      .from("public_share_tokens")
      .select("id, age_group_id, expires_at, revoked_at, last_accessed_at, access_count, created_at, token_encrypted")
      .eq("age_group_id", parsed.ageGroupId)
      .is("revoked_at", null)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (modernRes.error && modernRes.error.message.toLowerCase().includes("token_encrypted")) {
      const legacyRes = await access.admin
        .from("public_share_tokens")
        .select("id, age_group_id, expires_at, revoked_at, last_accessed_at, access_count, created_at")
        .eq("age_group_id", parsed.ageGroupId)
        .is("revoked_at", null)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (legacyRes.error) {
        return NextResponse.json(
          { error: "Não foi possível carregar o link público." },
          { status: 500 },
        );
      }

      data = (legacyRes.data as PublicShareRecord | null) ?? null;
    } else if (modernRes.error) {
      return NextResponse.json(
        { error: "Não foi possível carregar o link público." },
        { status: 500 },
      );
    } else {
      data = (modernRes.data as PublicShareRecord | null) ?? null;
    }
    const serialized = serializeShare(data);

    return NextResponse.json({
      success: true,
      share: serialized.share,
      url: serialized.url,
      requiresRegeneration: serialized.requiresRegeneration,
    });
  } catch (error) {
    return respondInternalError("api.public-share.get", error);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = parseBodySchema(body);
    if (!parsed.ok) return parsed.response;

    const access = await assertCanManagePublicShare(user.id, parsed.ageGroupId);
    if (!access.ok) return access.response;

    console.log("[public-share.post] start", {
      userId: user.id,
      ageGroupId: parsed.ageGroupId,
      isSuperCoordinator: access.isSuperCoordinator,
      isAgeGroupCoordinator: access.isAgeGroupCoordinator,
    });

    await access.admin
      .from("public_share_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("age_group_id", parsed.ageGroupId)
      .is("revoked_at", null);

    const rawToken = generatePublicShareToken();
    const tokenHash = hashPublicShareToken(rawToken);
    const tokenEncrypted = encryptPublicShareToken(rawToken);

    let data: PublicShareRecord | null = null;
    const modernInsert = await access.admin
      .from("public_share_tokens")
      .insert({
        token_hash: tokenHash,
        token_encrypted: tokenEncrypted,
        age_group_id: parsed.ageGroupId,
        created_by: user.id,
        expires_at: null,
      })
      .select("id, age_group_id, expires_at, revoked_at, last_accessed_at, access_count, created_at, token_encrypted")
      .single();

    if (modernInsert.error && modernInsert.error.message.toLowerCase().includes("token_encrypted")) {
      const legacyInsert = await access.admin
        .from("public_share_tokens")
        .insert({
          token_hash: tokenHash,
          age_group_id: parsed.ageGroupId,
          created_by: user.id,
          expires_at: null,
        })
        .select("id, age_group_id, expires_at, revoked_at, last_accessed_at, access_count, created_at")
        .single();

      if (legacyInsert.error || !legacyInsert.data) {
        return NextResponse.json(
          { error: "Não foi possível gerar o link público." },
          { status: 500 },
        );
      }

      data = legacyInsert.data as PublicShareRecord;
    } else if (modernInsert.error || !modernInsert.data) {
      return NextResponse.json(
        { error: "Não foi possível gerar o link público." },
        { status: 500 },
      );
    } else {
      data = modernInsert.data as PublicShareRecord;
    }

    console.log("[public-share.post] success", {
      userId: user.id,
      ageGroupId: parsed.ageGroupId,
      shareId: data.id,
      createdAt: data.created_at,
    });

    return NextResponse.json({
      success: true,
      share: serializeShare(data).share,
      url: buildPublicShareUrl(rawToken),
      requiresRegeneration: false,
    });
  } catch (error) {
    return respondInternalError("api.public-share.post", error);
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = parseBodySchema(body);
    if (!parsed.ok) return parsed.response;

    const access = await assertCanManagePublicShare(user.id, parsed.ageGroupId);
    if (!access.ok) return access.response;

    console.log("[public-share.delete] start", {
      userId: user.id,
      ageGroupId: parsed.ageGroupId,
      isSuperCoordinator: access.isSuperCoordinator,
      isAgeGroupCoordinator: access.isAgeGroupCoordinator,
    });

    const { error } = await access.admin
      .from("public_share_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("age_group_id", parsed.ageGroupId)
      .is("revoked_at", null);

    if (error) {
      return NextResponse.json(
        { error: "Não foi possível revogar o link público." },
        { status: 500 },
      );
    }

    console.log("[public-share.delete] success", {
      userId: user.id,
      ageGroupId: parsed.ageGroupId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return respondInternalError("api.public-share.delete", error);
  }
}
