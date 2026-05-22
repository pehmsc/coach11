"use client";

import { useEffect, useRef, useState } from "react";
import { ClipboardList, Loader2 } from "lucide-react";
import { AppModal } from "@/components/ui/app-modal";
import { Button } from "@/components/ui/button";

interface ObservationCaptureModalProps {
  open: boolean;
  currentMinute: number;
  saving: boolean;
  onClose: () => void;
  onSave: (text: string, minute: number) => void;
}

export function ObservationCaptureModal(props: ObservationCaptureModalProps) {
  if (!props.open) return null;
  return <ObservationCaptureModalInner {...props} />;
}

function ObservationCaptureModalInner({
  open,
  currentMinute,
  saving,
  onClose,
  onSave,
}: ObservationCaptureModalProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);
    return () => window.clearTimeout(timer);
  }, []);

  const trimmed = text.trim();
  const canSave = trimmed.length > 0 && !saving;

  function handleSave() {
    if (!canSave) return;
    onSave(trimmed, currentMinute);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      handleSave();
    }
  }

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <ClipboardList size={18} className="text-blue-600" />
          Observação sobre o adversário
        </span>
      }
      closeLabel="Fechar modal de observação"
      bodyClassName="space-y-3"
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
          Minuto {currentMinute}&apos;
        </span>
        <span className="text-xs text-slate-500">
          Capturada no live · privada ao staff
        </span>
      </div>

      <textarea
        ref={textareaRef}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
        rows={5}
        maxLength={2000}
        placeholder="Ex: extremo esquerdo n.º 7 muito rápido em transição, dificulta marcação individual…"
        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
      />
      <p className="text-xs text-slate-400">
        Cmd/Ctrl+Enter para guardar · Esc para fechar
      </p>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button
          onClick={handleSave}
          disabled={!canSave}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {saving ? (
            <>
              <Loader2 size={16} className="animate-spin mr-2" />A guardar…
            </>
          ) : (
            "Guardar"
          )}
        </Button>
      </div>
    </AppModal>
  );
}
