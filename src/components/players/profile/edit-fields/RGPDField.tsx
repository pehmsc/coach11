import type { PlayerFormState } from "./diff-payload";

interface RGPDFieldProps {
  state: PlayerFormState;
  onChange: (patch: Partial<PlayerFormState>) => void;
  disabled?: boolean;
}

export function RGPDField({ state, onChange, disabled }: RGPDFieldProps) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-bold text-slate-900">RGPD</h3>
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={state.photo_consent_given}
          onChange={(e) =>
            onChange({ photo_consent_given: e.target.checked })
          }
          disabled={disabled}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed"
        />
        <span className="text-sm text-slate-700">
          Consentimento dado para apresentar a foto do atleta na app.
        </span>
      </label>
    </div>
  );
}
