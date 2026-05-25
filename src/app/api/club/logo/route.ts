import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const runtime = "nodejs";

const ACCEPTED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);
const ACCEPTED_MIME_PREFIX = "image/";
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

function resolveExtension(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return ACCEPTED_EXTENSIONS.has(ext) ? ext : "png";
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

    const admin = createAdminClient();

    // Validar acesso: deve ser club_coordinator
    const [profileRes, membershipRes] = await Promise.all([
      admin.from("profiles").select("is_super_coordinator").eq("id", user.id).maybeSingle(),
      admin
        .from("club_memberships")
        .select("club_id, role")
        .eq("profile_id", user.id)
        .eq("role", "club_coordinator")
        .limit(1)
        .maybeSingle(),
    ]);

    const isSuperCoord = profileRes.data?.is_super_coordinator === true;
    const clubId = membershipRes.data?.club_id ?? null;

    if (!clubId && !isSuperCoord) {
      return NextResponse.json(
        { error: "Sem permissões para actualizar o logo do clube." },
        { status: 403 },
      );
    }

    if (!clubId) {
      return NextResponse.json({ error: "Clube não encontrado." }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Ficheiro inválido." }, { status: 400 });
    }

    const extension = resolveExtension(file.name || "");
    const mimeType = (file.type || "").toLowerCase();

    if (!mimeType.startsWith(ACCEPTED_MIME_PREFIX) && !ACCEPTED_EXTENSIONS.has(extension)) {
      return NextResponse.json(
        { error: "Formato inválido. Usa PNG, JPG ou WEBP." },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Imagem demasiado grande. Máximo: 5MB." },
        { status: 400 },
      );
    }

    const folderPrefix = `club-${clubId}`;
    const filePath = `${folderPrefix}/logo.${extension}`;
    const fileBytes = new Uint8Array(await file.arrayBuffer());

    // Remover versões anteriores
    const { data: existingFiles } = await admin.storage
      .from("club-logos")
      .list(folderPrefix, { limit: 100 });

    if (existingFiles?.length) {
      const paths = existingFiles
        .filter((f) => f.id && f.name)
        .map((f) => `${folderPrefix}/${f.name}`);
      if (paths.length) {
        await admin.storage.from("club-logos").remove(paths);
      }
    }

    // Upload
    let { error: uploadError } = await admin.storage
      .from("club-logos")
      .upload(filePath, fileBytes, {
        upsert: true,
        contentType: file.type || `image/${extension}`,
      });

    if (uploadError?.message?.toLowerCase().includes("bucket")) {
      await admin.storage.createBucket("club-logos", {
        public: true,
        fileSizeLimit: MAX_FILE_SIZE_BYTES,
        allowedMimeTypes: [
          "image/png",
          "image/jpeg",
          "image/jpg",
          "image/webp",
        ],
      });
      const retry = await admin.storage.from("club-logos").upload(filePath, fileBytes, {
        upsert: true,
        contentType: file.type || `image/${extension}`,
      });
      uploadError = retry.error;
    }

    if (uploadError) {
      console.error("Erro no upload do logo do clube:", uploadError);
      return NextResponse.json({ error: "Erro ao carregar logo." }, { status: 500 });
    }

    const {
      data: { publicUrl },
    } = admin.storage.from("club-logos").getPublicUrl(filePath);

    // Actualizar clubs.logo_url
    await admin.from("clubs").update({ logo_url: publicUrl }).eq("id", clubId);

    // Actualizar também age_groups.club_logo_url para todos os escalões deste clube
    await admin
      .from("age_groups")
      .update({ club_logo_url: publicUrl })
      .eq("club_id", clubId);

    return NextResponse.json({ success: true, url: publicUrl });
  } catch (error) {
    return respondInternalError("api.club.logo.post", error);
  }
}
