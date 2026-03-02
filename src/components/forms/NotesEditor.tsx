"use client";

import { useEffect, useRef } from "react";
import { FileText } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Accent = "emerald" | "blue";

type SelectionResult = {
  nextValue: string;
  selectionStart: number;
  selectionEnd: number;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  accent?: Accent;
  className?: string;
  label?: string;
};

function wrapSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  prefix: string,
  suffix = prefix,
): SelectionResult {
  const selectedText = value.slice(selectionStart, selectionEnd);
  const nextValue =
    value.slice(0, selectionStart) +
    prefix +
    selectedText +
    suffix +
    value.slice(selectionEnd);

  return {
    nextValue,
    selectionStart: selectionStart + prefix.length,
    selectionEnd: selectionStart + prefix.length + selectedText.length,
  };
}

function prefixSelectedLines(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  prefixResolver: string | ((index: number) => string),
): SelectionResult {
  const blockStart = value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
  const nextLineBreak = value.indexOf("\n", selectionEnd);
  const blockEnd = nextLineBreak === -1 ? value.length : nextLineBreak;
  const selectedBlock = value.slice(blockStart, blockEnd);
  const lines = selectedBlock.split("\n");

  const nextBlock = lines
    .map((line, index) => {
      if (!line.trim()) return line;
      const prefix =
        typeof prefixResolver === "function" ? prefixResolver(index) : prefixResolver;
      return `${prefix}${line}`;
    })
    .join("\n");

  return {
    nextValue: value.slice(0, blockStart) + nextBlock + value.slice(blockEnd),
    selectionStart: blockStart,
    selectionEnd: blockStart + nextBlock.length,
  };
}

export function NotesEditor({
  value,
  onChange,
  placeholder = "Informações adicionais, instruções, equipamento...",
  rows = 6,
  accent = "emerald",
  className,
  label = "Notas",
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);

  useEffect(() => {
    if (!pendingSelectionRef.current || !textareaRef.current) return;
    const pendingSelection = pendingSelectionRef.current;
    pendingSelectionRef.current = null;
    textareaRef.current.focus();
    textareaRef.current.setSelectionRange(
      pendingSelection.start,
      pendingSelection.end,
    );
  }, [value]);

  function applyTransform(
    transform: (
      currentValue: string,
      selectionStart: number,
      selectionEnd: number,
    ) => SelectionResult,
  ) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const result = transform(value, textarea.selectionStart, textarea.selectionEnd);
    pendingSelectionRef.current = {
      start: result.selectionStart,
      end: result.selectionEnd,
    };
    onChange(result.nextValue);
  }

  const focusRingClass =
    accent === "blue" ? "focus:ring-blue-500" : "focus:ring-emerald-500";
  const toolbarHoverClass =
    accent === "blue"
      ? "hover:border-blue-300 hover:text-blue-700"
      : "hover:border-emerald-300 hover:text-emerald-700";

  function handleBoldClick() {
    applyTransform((currentValue, selectionStart, selectionEnd) =>
      wrapSelection(currentValue, selectionStart, selectionEnd, "**"),
    );
  }

  function handleItalicClick() {
    applyTransform((currentValue, selectionStart, selectionEnd) =>
      wrapSelection(currentValue, selectionStart, selectionEnd, "*"),
    );
  }

  function handleBulletListClick() {
    applyTransform((currentValue, selectionStart, selectionEnd) =>
      prefixSelectedLines(currentValue, selectionStart, selectionEnd, "- "),
    );
  }

  function handleNumberedListClick() {
    applyTransform((currentValue, selectionStart, selectionEnd) =>
      prefixSelectedLines(
        currentValue,
        selectionStart,
        selectionEnd,
        (index) => `${index + 1}. `,
      ),
    );
  }

  function handleLetterListClick() {
    applyTransform((currentValue, selectionStart, selectionEnd) =>
      prefixSelectedLines(
        currentValue,
        selectionStart,
        selectionEnd,
        (index) => `${String.fromCharCode(97 + index)}. `,
      ),
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <Label className="flex items-center gap-1">
        <FileText size={12} />
        {label}
      </Label>

      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
        <button
          type="button"
          onClick={handleBoldClick}
          title="Negrito"
          className={cn(
            "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors",
            toolbarHoverClass,
          )}
        >
          B
        </button>
        <button
          type="button"
          onClick={handleItalicClick}
          title="Itálico"
          className={cn(
            "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors",
            toolbarHoverClass,
          )}
        >
          I
        </button>
        <button
          type="button"
          onClick={handleBulletListClick}
          title="Lista com bullets"
          className={cn(
            "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors",
            toolbarHoverClass,
          )}
        >
          • Lista
        </button>
        <button
          type="button"
          onClick={handleNumberedListClick}
          title="Lista numerada"
          className={cn(
            "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors",
            toolbarHoverClass,
          )}
        >
          1. Lista
        </button>
        <button
          type="button"
          onClick={handleLetterListClick}
          title="Lista por letras"
          className={cn(
            "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors",
            toolbarHoverClass,
          )}
        >
          A. Lista
        </button>
      </div>

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={cn(
          "w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-transparent focus:outline-none focus:ring-2",
          focusRingClass,
        )}
      />

      <p className="text-[11px] text-slate-500">
        Formatação suportada: <span className="font-medium">**negrito**</span>,{" "}
        <span className="font-medium">*itálico*</span>, listas com{" "}
        <span className="font-medium">-</span>,{" "}
        <span className="font-medium">1.</span> ou{" "}
        <span className="font-medium">a.</span>
      </p>
    </div>
  );
}
