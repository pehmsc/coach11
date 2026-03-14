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
    <div className="fixed bottom-[calc(var(--mobile-footer-height)+env(safe-area-inset-bottom))] left-0 right-0 z-40 border-t border-slate-200 bg-white p-4 shadow-lg md:relative md:bottom-auto md:left-auto md:right-auto md:border-0 md:bg-transparent md:p-0 md:shadow-none md:mt-5">
      <div className="max-w-2xl mx-auto">
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
    </div>
  );
}
