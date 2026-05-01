import { Field, fieldError, textareaClass, type FieldErrors } from "./shared";
import type { PlayerFormState } from "./diff-payload";

interface NotesFieldProps {
  state: PlayerFormState;
  onChange: (patch: Partial<PlayerFormState>) => void;
  errors?: FieldErrors;
  disabled?: boolean;
}

const MAX_LENGTH = 2000;

export function NotesField({
  state,
  onChange,
  errors,
  disabled,
}: NotesFieldProps) {
  const remaining = MAX_LENGTH - state.notes.length;
  return (
    <div>
      <h3 className="mb-2 text-sm font-bold text-slate-900">Observações</h3>
      <Field
        id="notes"
        label="Notas"
        error={fieldError(errors, "notes")}
        hint={`${remaining} caracteres restantes`}
      >
        <textarea
          id="notes"
          value={state.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          disabled={disabled}
          rows={4}
          maxLength={MAX_LENGTH}
          className={textareaClass}
        />
      </Field>
    </div>
  );
}
