"use client";

import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ConfirmConvocationBarProps {
  confirmingConvocation: boolean;
  canConfirmConvocation: boolean;
  isCompleted: boolean;
  onConfirm: () => void;
}

export function ConfirmConvocationBar({
  confirmingConvocation,
  canConfirmConvocation,
  isCompleted,
  onConfirm,
}: ConfirmConvocationBarProps) {
  return (
    <div className="sticky bottom-[calc(var(--mobile-footer-height)+env(safe-area-inset-bottom)+0.5rem)] z-20 mt-5 md:bottom-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-lg">
        <Button
          type="button"
          onClick={onConfirm}
          disabled={!canConfirmConvocation}
          aria-busy={confirmingConvocation}
          className="h-12 w-full text-base font-semibold bg-slate-900 hover:bg-slate-800"
        >
          {confirmingConvocation ? (
            <Loader2 size={18} className="mr-2 animate-spin" />
          ) : (
            <Check size={18} className="mr-2" />
          )}
          {confirmingConvocation
            ? isCompleted
              ? "A guardar correção..."
              : "A guardar convocatória..."
            : isCompleted
              ? "Guardar correção"
              : "Guardar convocatória"}
        </Button>
      </div>
    </div>
  );
}
