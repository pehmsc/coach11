"use client";

import { useMemo, useState, type ChangeEvent } from "react";
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

  // "Outro" modo ligado SE:
  //  - utilizador clicou explicitamente em "Outro" no dropdown (userPickedOther), OU
  //  - nao ha sugestoes para o footballFormat (sempre livre), OU
  //  - o value actual nao pertence as sugestoes (e.g. jogo F11 num escalao F9
  //    ou tactical_system="Outro" legacy guardado em DB)
  // Modelo declarativo evita useEffect + setState com cascading renders.
  const [userPickedOther, setUserPickedOther] = useState(false);

  const isOtherMode = useMemo(() => {
    if (userPickedOther) return true;
    if (tacticalSystemOptions.length === 0) return true;
    return value !== "" && !tacticalSystemOptions.includes(value);
  }, [userPickedOther, tacticalSystemOptions, value]);

  const selectValue = isOtherMode ? OTHER_OPTION_VALUE : value;

  function handleSelectChange(e: ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    if (next === OTHER_OPTION_VALUE) {
      // Preservar value anterior — utilizador pode editar a partir dele.
      // Marcar escolha explicita para o input livre aparecer mesmo que
      // o value seja "" (cenario do bug do PR #172).
      setUserPickedOther(true);
      return;
    }
    setUserPickedOther(false);
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
