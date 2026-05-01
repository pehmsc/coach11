import { Input } from "@/components/ui/input";
import { Field, Section, fieldError, type FieldErrors } from "./shared";
import type { PlayerFormState } from "./diff-payload";

interface PlayerContactFieldsProps {
  state: PlayerFormState;
  onChange: (patch: Partial<PlayerFormState>) => void;
  errors?: FieldErrors;
  disabled?: boolean;
}

export function PlayerContactFields({
  state,
  onChange,
  errors,
  disabled,
}: PlayerContactFieldsProps) {
  return (
    <Section title="Contactos do atleta">
      <Field
        id="phone"
        label="Telemóvel"
        error={fieldError(errors, "phone")}
      >
        <Input
          id="phone"
          type="tel"
          value={state.phone}
          onChange={(e) => onChange({ phone: e.target.value })}
          disabled={disabled}
        />
      </Field>
      <Field
        id="email"
        label="Email"
        error={fieldError(errors, "email")}
      >
        <Input
          id="email"
          type="email"
          value={state.email}
          onChange={(e) => onChange({ email: e.target.value })}
          disabled={disabled}
        />
      </Field>
    </Section>
  );
}
