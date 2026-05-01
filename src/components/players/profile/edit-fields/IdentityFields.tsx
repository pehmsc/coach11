import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PLAYER_POSITIONS,
  PLAYER_STATUSES,
} from "@/lib/schemas/players";
import {
  Field,
  Section,
  fieldError,
  inputClass,
  type FieldErrors,
} from "./shared";
import type { PlayerFormState } from "./diff-payload";
import { PLAYER_STATUS_CONFIG } from "../status-config";

interface IdentityFieldsProps {
  state: PlayerFormState;
  onChange: (patch: Partial<PlayerFormState>) => void;
  errors?: FieldErrors;
  disabled?: boolean;
}

const NONE = "__none__";

export function IdentityFields({
  state,
  onChange,
  errors,
  disabled,
}: IdentityFieldsProps) {
  return (
    <Section title="Identidade">
      <Field
        id="first_name"
        label="Primeiro nome"
        error={fieldError(errors, "first_name")}
      >
        <Input
          id="first_name"
          value={state.first_name}
          onChange={(e) => onChange({ first_name: e.target.value })}
          disabled={disabled}
          required
        />
      </Field>
      <Field
        id="last_name"
        label="Apelido"
        error={fieldError(errors, "last_name")}
      >
        <Input
          id="last_name"
          value={state.last_name}
          onChange={(e) => onChange({ last_name: e.target.value })}
          disabled={disabled}
          required
        />
      </Field>
      <Field
        id="birth_date"
        label="Data de nascimento"
        error={fieldError(errors, "birth_date")}
      >
        <Input
          id="birth_date"
          type="date"
          value={state.birth_date}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => onChange({ birth_date: e.target.value })}
          disabled={disabled}
        />
      </Field>
      <Field
        id="jersey_number"
        label="Número de camisola"
        error={fieldError(errors, "jersey_number")}
      >
        <Input
          id="jersey_number"
          type="number"
          min={0}
          max={99}
          value={state.jersey_number}
          onChange={(e) => onChange({ jersey_number: e.target.value })}
          disabled={disabled}
        />
      </Field>
      <Field
        id="preferred_position"
        label="Posição preferida"
        error={fieldError(errors, "preferred_position")}
      >
        <select
          id="preferred_position"
          value={state.preferred_position || NONE}
          onChange={(e) =>
            onChange({
              preferred_position:
                e.target.value === NONE ? "" : e.target.value,
            })
          }
          disabled={disabled}
          className={inputClass}
        >
          <option value={NONE}>—</option>
          {PLAYER_POSITIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </Field>
      <Field
        id="secondary_position"
        label="Posição secundária"
        error={fieldError(errors, "secondary_position")}
      >
        <select
          id="secondary_position"
          value={state.secondary_position || NONE}
          onChange={(e) =>
            onChange({
              secondary_position:
                e.target.value === NONE ? "" : e.target.value,
            })
          }
          disabled={disabled}
          className={inputClass}
        >
          <option value={NONE}>—</option>
          {PLAYER_POSITIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </Field>
      <Field
        id="status"
        label="Estado"
        error={fieldError(errors, "status")}
      >
        <Select
          value={state.status}
          onValueChange={(v) =>
            onChange({ status: v as PlayerFormState["status"] })
          }
          disabled={disabled}
        >
          <SelectTrigger id="status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PLAYER_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {PLAYER_STATUS_CONFIG[s]?.label ?? s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </Section>
  );
}
