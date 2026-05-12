"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface OpponentLogoUploaderProps {
  ageGroupId: string;
  opponentId: string;
  currentLogoUrl?: string | null;
  fallbackInitials: string;
  onUploaded: (logoUrl: string) => void;
}

const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const TARGET_SIZE = 256;

async function resizeToWebp(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new globalThis.Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Imagem invalida."));
      img.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = TARGET_SIZE;
    canvas.height = TARGET_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponivel.");

    // Letterbox-style fit: fundo branco + imagem centrada respeitando aspect.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, TARGET_SIZE, TARGET_SIZE);

    const ratio = Math.min(
      TARGET_SIZE / image.width,
      TARGET_SIZE / image.height,
    );
    const drawW = image.width * ratio;
    const drawH = image.height * ratio;
    const dx = (TARGET_SIZE - drawW) / 2;
    const dy = (TARGET_SIZE - drawH) / 2;
    ctx.drawImage(image, dx, dy, drawW, drawH);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) reject(new Error("Falha ao gerar imagem."));
          else resolve(blob);
        },
        "image/webp",
        0.85,
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function OpponentLogoUploader({
  ageGroupId,
  opponentId,
  currentLogoUrl,
  fallbackInitials,
  onUploaded,
}: OpponentLogoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    if (!ACCEPTED.includes(file.type)) {
      toast.error("Tipo invalido. PNG, JPEG ou WebP.");
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      toast.error("Imagem acima de 5MB.");
      return;
    }

    setUploading(true);
    try {
      const blob = await resizeToWebp(file);
      const formData = new FormData();
      formData.append("file", blob, "logo.webp");

      const res = await fetch(
        `/api/age-groups/${ageGroupId}/opponents/${opponentId}/logo`,
        {
          method: "POST",
          body: formData,
        },
      );
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) {
        toast.error(payload?.error || "Erro ao guardar logo.");
        return;
      }
      onUploaded(payload.logo_url);
      toast.success("Logo actualizado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao processar imagem.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="group relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg disabled:opacity-50"
        aria-label="Carregar logo do adversario"
      >
        {currentLogoUrl ? (
          <Image
            src={currentLogoUrl}
            alt=""
            width={64}
            height={64}
            className="h-16 w-16 object-cover"
            unoptimized
          />
        ) : (
          <div
            className="flex h-16 w-16 items-center justify-center text-base font-bold text-white"
            style={{
              background:
                "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            }}
          >
            {fallbackInitials}
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
          {uploading ? (
            <Loader2 size={18} className="animate-spin text-white" />
          ) : (
            <Camera size={18} className="text-white" />
          )}
        </div>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
    </>
  );
}
