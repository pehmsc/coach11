"use client";

import { useMemo, type ChangeEvent } from "react";
import { getTacticalSystemOptions } from "@/lib/football/tactical-systems";

const OTHER_OPTION_VALUE = "__other__";

type Accent = "emerald" | "blue";

interface TacticalSystemPickerProps {
  value: string;
  onChange: (next: string) => void;
  footballFormat: string | null;
  disabled?: boolean;
  accent?: Accent;
}

const ACCENT_RING: Record<Accent, string> = {
  emerald: "focus:ring-emerald-500",
  blue: "focus:ring-blue-500",
};

export function TacticalSystemPicker({
  value,
  onChange,
  footballFormat,
  disabled = false,
  accent = "emerald",
}: TacticalSystemPickerProps) {
  const tacticalSystemOptions = getTacticalSystemOptions(footballFormat);

  const isOtherMode = useMemo(() => {
    if (tacticalSystemOptions.length === 0) return true;
    if (!value) return false;
    return !tacticalSystemOptions.includes(value);
  }, [tacticalSystemOptions, value]);

  const selectValue = isOtherMode ? OTHER_OPTION_VALUE : value;

  function handleSelectChange(e: ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    if (next === OTHER_OPTION_VALUE) {
      onChange("");
      return;
    }
    onChange(next);
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value);
  }

  const helperText = footballFormat
    ? `Sugestões para futebol ${footballFormat} (escalão). Escolhe Outro para escrever um sistema livre.`
    : "Sem formato definido — texto livre.";

  if (tacticalSystemOptions.length === 0) {
    return (
      <>
        <input
          type="text"
          value={value}
          onChange={handleInputChange}
          disabled={disabled}
          placeholder="ex: 1-4-3-3"
          maxLength={40}
          className={`w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${ACCENT_RING[accent]}`}
        />
        <p className="text-[10px] text-slate-400">{helperText}</p>
      </>
    );
  }

  return (
    <>
      <select
        value={selectValue}
        onChange={handleSelectChange}
        disabled={disabled}
        className={`w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 ${ACCENT_RING[accent]}`}
      >
        <option value="">— Sem indicação —</option>
        {tacticalSystemOptions
          .filter((option) => option !== "Outro")
          .map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        <option value={OTHER_OPTION_VALUE}>Outro</option>
      </select>

      {isOtherMode && (
        <input
          type="text"
          value={value}
          onChange={handleInputChange}
          disabled={disabled}
          placeholder="ex: 1-4-3-3 (futebol 11) ou outro"
          maxLength={40}
          autoFocus
          className={`mt-1.5 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${ACCENT_RING[accent]}`}
        />
      )}

      <p className="text-[10px] text-slate-400">{helperText}</p>
    </>
  );
}
