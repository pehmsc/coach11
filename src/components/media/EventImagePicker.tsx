"use client";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import { Check, ImageIcon, Loader2, RefreshCw, Upload, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Accent = "emerald" | "blue";

type LibraryItem = {
  name: string;
  path: string;
  url: string;
  created_at: string | null;
  updated_at: string | null;
};

type Props = {
  ageGroupId: string | null;
  value: string;
  onChange: (value: string) => void;
  accent?: Accent;
  label?: string;
};

function accentClasses(accent: Accent) {
  return accent === "blue"
    ? {
        button: "border-blue-200 text-blue-700 hover:bg-blue-50",
        selected: "border-blue-500 ring-2 ring-blue-200",
      }
    : {
        button: "border-emerald-200 text-emerald-700 hover:bg-emerald-50",
        selected: "border-emerald-500 ring-2 ring-emerald-200",
      };
}

function sanitizeFileName(name: string) {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export function EventImagePicker({
  ageGroupId,
  value,
  onChange,
  accent = "emerald",
  label = "Imagem do evento",
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const classes = accentClasses(accent);

  async function loadLibrary(forceOpen = false) {
    if (!ageGroupId) {
      setError("Seleciona primeiro um escalão para usar a biblioteca.");
      return;
    }

    setLoadingLibrary(true);
    setError(null);
    if (forceOpen) setLibraryOpen(true);

    try {
      const res = await fetch(
        `/api/event-images?ageGroupId=${encodeURIComponent(ageGroupId)}`,
        { cache: "no-store" },
      );
      const payload = (await res.json().catch(() => null)) as
        | { items?: LibraryItem[]; error?: string }
        | null;

      if (!res.ok) {
        setError(
          payload?.error || "Não foi possível carregar a biblioteca de imagens.",
        );
        setLibraryItems([]);
        return;
      }

      setLibraryItems(Array.isArray(payload?.items) ? payload.items : []);
    } catch {
      setLibraryItems([]);
      setError("Erro de ligação ao carregar a biblioteca de imagens.");
    } finally {
      setLoadingLibrary(false);
    }
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !ageGroupId) return;

    setUploading(true);
    setError(null);

    try {
      const ext = file.name.split(".").pop() || "jpg";
      const baseName = sanitizeFileName(file.name.replace(/\.[^.]+$/, "")) || "imagem";
      const filePath = `${ageGroupId}/${Date.now()}-${baseName}.${ext.toLowerCase()}`;

      const { data, error: uploadError } = await supabase.storage
        .from("event-images")
        .upload(filePath, file, { upsert: false });

      if (uploadError || !data?.path) {
        setError(
          "Erro ao carregar imagem. Verifica se o bucket 'event-images' existe e aceita uploads.",
        );
        return;
      }

      const { data: urlData } = supabase.storage
        .from("event-images")
        .getPublicUrl(data.path);

      onChange(urlData.publicUrl);
      await loadLibrary(libraryOpen);
    } catch {
      setError("Erro de ligação ao carregar imagem.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  return (
    <div className="space-y-3">
      <Label className="block">
        <ImageIcon size={14} className="mr-1 inline" />
        {label}
      </Label>

      {value ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="relative h-40 w-full">
            <Image
              src={value}
              alt="Imagem do evento"
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 448px"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-3 py-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={classes.button}
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 size={14} className="mr-2 animate-spin" />
              ) : (
                <Upload size={14} className="mr-2" />
              )}
              Novo upload
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={classes.button}
              onClick={() => void loadLibrary(true)}
              disabled={loadingLibrary}
            >
              {loadingLibrary ? (
                <Loader2 size={14} className="mr-2 animate-spin" />
              ) : (
                <ImageIcon size={14} className="mr-2" />
              )}
              Escolher existente
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange("")}
            >
              <X size={14} className="mr-2" />
              Remover
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={classes.button}
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 size={14} className="mr-2 animate-spin" />
              ) : (
                <Upload size={14} className="mr-2" />
              )}
              Upload novo
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={classes.button}
              onClick={() => void loadLibrary(true)}
              disabled={loadingLibrary}
            >
              {loadingLibrary ? (
                <Loader2 size={14} className="mr-2 animate-spin" />
              ) : (
                <ImageIcon size={14} className="mr-2" />
              )}
              Escolher existente
            </Button>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Os uploads ficam guardados na biblioteca do escalão para reutilização futura.
          </p>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleUpload}
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {libraryOpen && (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Biblioteca de imagens
              </p>
              <p className="text-xs text-slate-500">
                Escolhe uma imagem já carregada para este escalão.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void loadLibrary(false)}
              disabled={loadingLibrary}
            >
              {loadingLibrary ? (
                <Loader2 size={14} className="mr-2 animate-spin" />
              ) : (
                <RefreshCw size={14} className="mr-2" />
              )}
              Atualizar
            </Button>
          </div>

          {loadingLibrary ? (
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-4 text-sm text-slate-500">
              A carregar imagens...
            </div>
          ) : libraryItems.length === 0 ? (
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-4 text-sm text-slate-500">
              Ainda não existem imagens guardadas neste escalão.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {libraryItems.map((item) => {
                const selected = item.url === value;

                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => {
                      onChange(item.url);
                      setLibraryOpen(false);
                    }}
                    className={`overflow-hidden rounded-2xl border bg-white text-left transition ${
                      selected
                        ? classes.selected
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="relative aspect-[4/3] w-full">
                      <Image
                        src={item.url}
                        alt={item.name}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 50vw, 180px"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 px-3 py-2">
                      <p className="truncate text-xs text-slate-600">{item.name}</p>
                      {selected && <Check size={14} className="text-emerald-600" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
