import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveUserTeamContext } from "@/lib/auth/team-context";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const context = await resolveUserTeamContext(supabase, user.id);
    const requestedAgeGroupId =
      new URL(request.url).searchParams.get("ageGroupId") || null;
    const ageGroupId =
      requestedAgeGroupId && context.accessibleAgeGroupIds.includes(requestedAgeGroupId)
        ? requestedAgeGroupId
        : context.ageGroup?.id ?? context.accessibleAgeGroupIds[0] ?? null;

    if (!ageGroupId) {
      return NextResponse.json(
        { error: "Não foi possível determinar o escalão." },
        { status: 422 },
      );
    }

    if (!context.accessibleAgeGroupIds.includes(ageGroupId)) {
      return NextResponse.json({ error: "Sem permissões." }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from("event-images")
      .list(ageGroupId, {
        limit: 48,
        sortBy: { column: "created_at", order: "desc" },
      });

    if (error) {
      return NextResponse.json(
        { error: "Não foi possível carregar a biblioteca de imagens." },
        { status: 500 },
      );
    }

    const items = (data || [])
      .filter((item) => !!item.name && !item.name.endsWith("/"))
      .map((item) => {
        const path = `${ageGroupId}/${item.name}`;
        const { data: publicUrl } = admin.storage
          .from("event-images")
          .getPublicUrl(path);

        return {
          name: item.name,
          path,
          url: publicUrl.publicUrl,
          created_at:
            typeof item.created_at === "string" ? item.created_at : null,
          updated_at:
            typeof item.updated_at === "string" ? item.updated_at : null,
        };
      });

    return NextResponse.json({
      success: true,
      ageGroupId,
      items,
    });
  } catch (error) {
    return respondInternalError("api.event-images.get", error);
  }
}
