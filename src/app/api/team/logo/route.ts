import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const ACCEPTED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "svg"]);
const ACCEPTED_MIME_PREFIX = "image/";
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

function resolveExtension(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ACCEPTED_EXTENSIONS.has(ext)) return ext;
  return "png";
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const ageGroupIdRaw = formData.get("ageGroupId");
    const ageGroupId =
      typeof ageGroupIdRaw === "string" && ageGroupIdRaw.trim()
        ? ageGroupIdRaw.trim()
        : null;

    if (!ageGroupId || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Pedido inválido para upload do logotipo." },
        { status: 400 },
      );
    }

    if (!file.type.startsWith(ACCEPTED_MIME_PREFIX)) {
      return NextResponse.json(
        { error: "Formato inválido. Usa uma imagem PNG, JPG, WEBP ou SVG." },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Imagem demasiado grande. Máximo permitido: 2MB." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    const { data: ageGroup, error: ageGroupError } = await admin
      .from("age_groups")
      .select("id, coordinator_id")
      .eq("id", ageGroupId)
      .maybeSingle();

    if (ageGroupError) {
      return NextResponse.json(
        { error: "Erro ao validar escalão." },
        { status: 500 },
      );
    }

    if (!ageGroup) {
      return NextResponse.json({ error: "Escalão não encontrado." }, { status: 404 });
    }

    let hasAccess = ageGroup.coordinator_id === user.id;

    if (!hasAccess) {
      const { data: teams } = await admin
        .from("teams")
        .select("id")
        .eq("age_group_id", ageGroup.id);

      const teamIds = (teams || []).map((team) => team.id);
      if (teamIds.length > 0) {
        const { data: staffLink } = await admin
          .from("team_staff")
          .select("id")
          .in("team_id", teamIds)
          .eq("profile_id", user.id)
          .limit(1)
          .maybeSingle();

        hasAccess = !!staffLink;
      }
    }

    if (!hasAccess) {
      return NextResponse.json(
        { error: "Sem permissões para atualizar o logotipo deste escalão." },
        { status: 403 },
      );
    }

    const extension = resolveExtension(file.name || "");
    const filePath = `${ageGroup.id}/logo.${extension}`;
    const fileBuffer = await file.arrayBuffer();

    const { error: uploadError } = await admin.storage
      .from("club-logos")
      .upload(filePath, fileBuffer, {
        upsert: true,
        contentType: file.type || `image/${extension}`,
      });

    if (uploadError) {
      console.error("Erro no upload do logotipo:", uploadError);
      return NextResponse.json(
        { error: "Erro ao carregar logotipo." },
        { status: 500 },
      );
    }

    const { data: publicUrlData } = admin.storage.from("club-logos").getPublicUrl(filePath);
    const logoUrl = publicUrlData.publicUrl;

    const { error: updateAgeGroupError } = await admin
      .from("age_groups")
      .update({ club_logo_url: logoUrl })
      .eq("id", ageGroup.id);

    if (updateAgeGroupError) {
      return NextResponse.json(
        { error: "Erro ao guardar o logotipo no escalão." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, url: logoUrl });
  } catch (error) {
    console.error("Erro ao fazer upload do logotipo:", error);
    const message =
      error instanceof Error ? error.message : "Erro interno ao carregar logotipo.";

    return NextResponse.json(
      { error: message || "Erro interno ao carregar logotipo." },
      { status: 500 },
    );
  }
}

