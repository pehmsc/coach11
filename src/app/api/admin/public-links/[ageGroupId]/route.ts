import { NextResponse } from "next/server";
import { z } from "zod";
import { getSuperUserAccess } from "@/lib/auth/super-user.server";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ ageGroupId: string }>;
};

const ParamsSchema = z.object({
  ageGroupId: z.string().uuid(),
});

function isMissingPublicAccessStatsSchemaError(message: string | undefined) {
  if (!message) return false;

  return (
    message.includes("public_access_count") ||
    message.includes("public_last_accessed_at")
  );
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const access = await getSuperUserAccess();
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const parsedParams = ParamsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json(
        { error: "ageGroupId inválido.", details: parsedParams.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const ageGroupId = parsedParams.data.ageGroupId;
    const { data: ageGroup, error: ageGroupError } = await access.admin
      .from("age_groups")
      .select("id, public_slug")
      .eq("id", ageGroupId)
      .maybeSingle();

    if (ageGroupError) {
      return NextResponse.json(
        { error: "Não foi possível validar o link público." },
        { status: 500 },
      );
    }

    if (!ageGroup) {
      return NextResponse.json({ error: "Escalão não encontrado." }, { status: 404 });
    }

    const nowIso = new Date().toISOString();
    const [{ error: revokeLegacyError }, { error: clearLinkError }] = await Promise.all([
      access.admin
        .from("public_share_tokens")
        .update({ revoked_at: nowIso })
        .eq("age_group_id", ageGroupId)
        .is("revoked_at", null),
      access.admin
        .from("age_groups")
        .update({
          public_slug: null,
          public_access_enabled: false,
        })
        .eq("id", ageGroupId),
    ]);

    if (revokeLegacyError || clearLinkError) {
      return NextResponse.json(
        { error: "Não foi possível apagar o link público." },
        { status: 500 },
      );
    }

    const { error: resetStatsError } = await access.admin
      .from("age_groups")
      .update({
        public_access_count: 0,
        public_last_accessed_at: null,
      })
      .eq("id", ageGroupId);

    if (
      resetStatsError &&
      !isMissingPublicAccessStatsSchemaError(resetStatsError.message)
    ) {
      return NextResponse.json(
        { error: "O link foi apagado, mas não foi possível limpar as estatísticas." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return respondInternalError("api.admin.public-links.age-group-id.delete", error);
  }
}
