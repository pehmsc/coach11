"use client";

import { X } from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type AppModalProps = {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  panelClassName?: string;
  bodyClassName?: string;
  closeLabel?: string;
};

export function AppModal({
  open,
  title,
  onClose,
  children,
  panelClassName,
  bodyClassName,
  closeLabel = "Fechar modal",
}: AppModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open || typeof document === "undefined") return;

    const { body, documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscroll = body.style.overscrollBehavior;
    const previousHtmlOverflow = documentElement.style.overflow;

    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "contain";
    documentElement.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscroll;
      documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [onClose, open]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  const viewportSpacingStyle: CSSProperties = {
    paddingTop: "max(1rem, var(--coach11-top-inset, 0px))",
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[140] flex items-end justify-center bg-black/55 px-4 pb-[calc(var(--mobile-footer-height)+env(safe-area-inset-bottom)+0.75rem)] md:items-center md:p-4"
      onClick={onClose}
      role="presentation"
      style={viewportSpacingStyle}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "flex max-h-[calc(100dvh-var(--mobile-footer-height)-env(safe-area-inset-bottom)-1rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl md:max-h-[calc(100dvh-2rem)]",
          panelClassName,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b bg-white p-4 shrink-0">
          <h3 id={titleId} className="font-bold text-slate-900">
            {title}
          </h3>
          <button
            type="button"
            aria-label={closeLabel}
            className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        <div
          className={cn(
            "min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] [overflow-wrap:anywhere]",
            bodyClassName,
          )}
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
