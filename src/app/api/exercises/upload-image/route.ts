import { NextResponse } from "next/server";
import { checkPermission } from "@/lib/auth/require-permission";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const runtime = "nodejs";

const ACCEPTED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);
const ACCEPTED_MIME_PREFIX = "image/";
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const BUCKET_NAME = "exercise-images";

function resolveExtension(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ACCEPTED_EXTENSIONS.has(ext)) return ext;
  return "png";
}

export async function POST(request: Request) {
  try {
    const check = await checkPermission("exercises", "write");
    if (!check.allowed) return check.response;

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Ficheiro não enviado." },
        { status: 400 },
      );
    }

    const mimeType = (file.type || "").toLowerCase();
    const extension = resolveExtension(file.name || "");
    const mimeLooksValid =
      mimeType.startsWith(ACCEPTED_MIME_PREFIX) || ACCEPTED_EXTENSIONS.has(extension);

    if (!mimeLooksValid) {
      return NextResponse.json(
        { error: "Formato inválido. Usa uma imagem PNG, JPG ou WEBP." },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Imagem demasiado grande. Máximo: 5MB." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    const fileName = `${check.ageGroupId}/${crypto.randomUUID()}.${extension}`;
    const contentType = file.type || `image/${extension}`;

    let { error: uploadError } = await admin.storage
      .from(BUCKET_NAME)
      .upload(fileName, fileBytes, { upsert: false, contentType });

    if (
      uploadError &&
      typeof uploadError.message === "string" &&
      uploadError.message.toLowerCase().includes("bucket")
    ) {
      await admin.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: MAX_FILE_SIZE_BYTES,
        allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
      });

      const retry = await admin.storage
        .from(BUCKET_NAME)
        .upload(fileName, fileBytes, { upsert: false, contentType });
      uploadError = retry.error;
    }

    if (uploadError) {
      return NextResponse.json(
        { error: "Erro ao carregar imagem." },
        { status: 500 },
      );
    }

    const { data: publicUrlData } = admin.storage
      .from(BUCKET_NAME)
      .getPublicUrl(fileName);

    return NextResponse.json({
      success: true,
      url: publicUrlData.publicUrl,
    });
  } catch (error) {
    return respondInternalError("api.exercises.upload-image.post", error);
  }
}
