import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildPublicShareUrl,
  generatePublicShareToken,
  hashPublicShareToken,
} from "@/lib/public-share";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const runtime = "nodejs";

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
    const { data, error } = await access.admin
      .from("public_share_tokens")
      .select("id, age_group_id, expires_at, revoked_at, last_accessed_at, access_count, created_at")
      .eq("age_group_id", parsed.ageGroupId)
      .is("revoked_at", null)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "Não foi possível carregar o link público." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      share: data || null,
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

    const { data, error } = await access.admin
      .from("public_share_tokens")
      .insert({
        token_hash: tokenHash,
        age_group_id: parsed.ageGroupId,
        created_by: user.id,
        expires_at: null,
      })
      .select("id, age_group_id, expires_at, revoked_at, last_accessed_at, access_count, created_at")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Não foi possível gerar o link público." },
        { status: 500 },
      );
    }

    console.log("[public-share.post] success", {
      userId: user.id,
      ageGroupId: parsed.ageGroupId,
      shareId: data.id,
      createdAt: data.created_at,
    });

    return NextResponse.json({
      success: true,
      share: data,
      url: buildPublicShareUrl(rawToken),
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
