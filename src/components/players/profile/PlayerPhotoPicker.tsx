"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, Trash2, User } from "lucide-react";
import imageCompression from "browser-image-compression";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { createClient } from "@/lib/supabase/client";
import {
  buildPlayerPhotoPath,
  removePlayerPhoto,
  uploadPlayerPhoto,
} from "@/lib/storage/players-photos";

const MAX_PRE_COMPRESSION_BYTES = 2 * 1024 * 1024;
const ACCEPTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

interface PlayerPhotoPickerProps {
  playerId: string;
  ageGroupId: string;
  currentSignedUrl: string | null;
  /**
   * Path actual em avatar_url (para apagar do Storage ao remover).
   * Pode ser null se o player nunca teve foto.
   */
  currentPath: string | null;
  onUploaded: (newPath: string) => void;
  onRemoved: () => void;
  disabled?: boolean;
}

export function PlayerPhotoPicker({
  playerId,
  ageGroupId,
  currentSignedUrl,
  currentPath,
  onUploaded,
  onRemoved,
  disabled,
}: PlayerPhotoPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);

  const isBusy = disabled || uploading || removing;

  function openFilePicker() {
    if (isBusy) return;
    fileInputRef.current?.click();
  }

  async function handleFileSelected(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    // Reset value para permitir re-seleccionar o mesmo ficheiro depois.
    event.target.value = "";
    if (!file) return;

    if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
      toast.error("Formato não aceite. Usa JPG, PNG ou WebP.");
      return;
    }
    if (file.size > MAX_PRE_COMPRESSION_BYTES) {
      toast.error("Ficheiro demasiado grande (máximo 2 MB).");
      return;
    }

    setUploading(true);
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 512,
        fileType: "image/webp",
        initialQuality: 0.85,
        useWebWorker: true,
      });

      const supabase = createClient();
      const { path, error } = await uploadPlayerPhoto(
        supabase,
        ageGroupId,
        playerId,
        compressed,
      );
      if (error) {
        toast.error("Erro ao carregar foto. Tenta novamente.");
        return;
      }
      onUploaded(path);
      toast.success("Foto atualizada.");
    } catch {
      toast.error("Erro ao processar imagem.");
    } finally {
      setUploading(false);
    }
  }

  async function performRemove() {
    setConfirmRemoveOpen(false);
    setRemoving(true);
    try {
      // Apaga do Storage primeiro — se falhar, ainda assim queremos
      // limpar avatar_url no DB para o cliente parar de tentar mostrar.
      const supabase = createClient();
      const pathToRemove =
        currentPath ?? buildPlayerPhotoPath(ageGroupId, playerId);
      await removePlayerPhoto(supabase, pathToRemove);
      onRemoved();
      toast.success("Foto removida.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="flex items-start gap-4">
      <div
        className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-slate-400"
        aria-hidden={!currentSignedUrl}
      >
        {currentSignedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentSignedUrl}
            alt="Foto do atleta"
            className="h-full w-full object-cover"
          />
        ) : (
          <User size={32} />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openFilePicker}
          disabled={isBusy}
        >
          {uploading ? (
            <>
              <Loader2 size={14} className="mr-1.5 animate-spin" />A carregar...
            </>
          ) : (
            <>
              <Camera size={14} className="mr-1.5" />
              {currentSignedUrl ? "Alterar foto" : "Carregar foto"}
            </>
          )}
        </Button>
        {currentSignedUrl && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setConfirmRemoveOpen(true)}
            disabled={isBusy}
            className="text-red-600 hover:bg-red-50"
          >
            {removing ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : (
              <Trash2 size={14} className="mr-1.5" />
            )}
            Remover
          </Button>
        )}
        <p className="text-xs text-slate-400">JPG, PNG ou WebP. Máx 2 MB.</p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileSelected}
        className="hidden"
      />

      <ConfirmDialog
        open={confirmRemoveOpen}
        onOpenChange={setConfirmRemoveOpen}
        title="Remover foto do atleta?"
        description="A foto será apagada permanentemente. Podes carregar uma nova depois."
        confirmLabel="Remover"
        cancelLabel="Cancelar"
        destructive
        onConfirm={performRemove}
      />
    </div>
  );
}
