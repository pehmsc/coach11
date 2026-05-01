"use client";

import { useEffect, useState } from "react";
import { AlertDialog } from "radix-ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  // Anti double-tap: o botão Confirm fica disabled até dois rAF sucessivos
  // resolverem após o dialog abrir. Evita que um toque rápido no botão de
  // transição "atravesse" para o botão de confirmação na mesma frame.
  // Re-keyed com `open` para que cada abertura comece com `false` sem
  // chamar `setState` no path síncrono do effect.
  const [readyToConfirm, setReadyToConfirm] = useState(false);

  useEffect(() => {
    if (!open) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setReadyToConfirm(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
      setReadyToConfirm(false);
    };
  }, [open]);

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay
          className="fixed inset-0 z-[140] bg-black/55 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />
        <AlertDialog.Content
          className="fixed left-1/2 top-1/2 z-[140] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 shadow-2xl focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <AlertDialog.Title className="text-base font-bold text-slate-900">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm leading-relaxed text-slate-600">
            {description}
          </AlertDialog.Description>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel asChild>
              <Button
                type="button"
                variant="outline"
                autoFocus
                className={cn("min-h-[44px] sm:min-w-[110px]")}
              >
                {cancelLabel}
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button
                type="button"
                variant={destructive ? "destructive" : "default"}
                disabled={!readyToConfirm}
                onClick={onConfirm}
                className={cn(
                  "min-h-[44px] sm:min-w-[140px]",
                  !destructive && "bg-blue-600 hover:bg-blue-700",
                )}
              >
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
