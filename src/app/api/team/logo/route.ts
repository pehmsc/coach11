import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveUserTeamContext } from "@/lib/auth/team-context";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const runtime = "nodejs";

const ACCEPTED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "svg"]);
const ACCEPTED_MIME_PREFIX = "image/";
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

function resolveExtension(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ACCEPTED_EXTENSIONS.has(ext)) return ext;
  return "png";
}

async function uploadLogoWithRetry(
  supabase: Awaited<ReturnType<typeof createClient>>,
  filePath: string,
  fileData: Uint8Array,
  contentType: string,
) {
  let { error: uploadError } = await supabase.storage
    .from("club-logos")
    .upload(filePath, fileData, {
      upsert: true,
      contentType,
    });

  if (
    uploadError &&
    typeof uploadError.message === "string" &&
    uploadError.message.toLowerCase().includes("bucket")
  ) {
    const { error: createBucketError } = await supabase.storage.createBucket("club-logos", {
      public: true,
      fileSizeLimit: MAX_FILE_SIZE_BYTES,
      allowedMimeTypes: [
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/webp",
        "image/svg+xml",
      ],
    });

    if (!createBucketError) {
      const retry = await supabase.storage.from("club-logos").upload(filePath, fileData, {
        upsert: true,
        contentType,
      });
      uploadError = retry.error;
    }
  }

  return uploadError;
}

async function removeExistingLogoVariants(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ageGroupId: string,
) {
  const { data, error } = await supabase.storage.from("club-logos").list(ageGroupId, {
    limit: 100,
  });

  if (error) {
    if (error.message?.toLowerCase().includes("bucket")) {
      return;
    }

    throw error;
  }

  const paths = (data || [])
    .filter((item) => !!item.id && !!item.name)
    .map((item) => `${ageGroupId}/${item.name}`);

  if (paths.length === 0) {
    return;
  }

  const { error: removeError } = await supabase.storage.from("club-logos").remove(paths);
  if (removeError) {
    throw removeError;
  }
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

    const extension = resolveExtension(file.name || "");
    const mimeType = (file.type || "").toLowerCase();
    const mimeLooksValid =
      mimeType.startsWith(ACCEPTED_MIME_PREFIX) || ACCEPTED_EXTENSIONS.has(extension);

    if (!mimeLooksValid) {
      return NextResponse.json(
        { error: "Formato inválido. Usa uma imagem PNG, JPG, WEBP ou SVG." },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Imagem demasiado grande. Máximo permitido: 5MB." },
        { status: 400 },
      );
    }

    const context = await resolveUserTeamContext(supabase, user.id);

    const { data: ageGroup, error: ageGroupError } = await supabase
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

    const hasAccess =
      ageGroup.coordinator_id === user.id ||
      context.accessibleAgeGroupIds.includes(ageGroup.id);

    if (!hasAccess) {
      return NextResponse.json(
        { error: "Sem permissões para atualizar o logotipo deste escalão." },
        { status: 403 },
      );
    }

    const filePath = `${ageGroup.id}/logo.${extension}`;
    const fileBytes = new Uint8Array(await file.arrayBuffer());

    try {
      await removeExistingLogoVariants(supabase, ageGroup.id);
    } catch (cleanupError) {
      console.error("Erro ao limpar logos antigos:", cleanupError);
      return NextResponse.json(
        { error: "Erro ao preparar a substituição do logotipo." },
        { status: 500 },
      );
    }

    const uploadError = await uploadLogoWithRetry(
      supabase,
      filePath,
      fileBytes,
      file.type || `image/${extension}`,
    );

    if (uploadError) {
      console.error("Erro no upload do logotipo:", uploadError);
      return NextResponse.json(
        { error: "Erro ao carregar logotipo." },
        { status: 500 },
      );
    }

    const { data: publicUrlData } = supabase.storage.from("club-logos").getPublicUrl(filePath);
    const logoUrl = publicUrlData.publicUrl;

    const { error: updateAgeGroupError } = await supabase
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
    return respondInternalError("api.team.logo.post", error);
  }
}
