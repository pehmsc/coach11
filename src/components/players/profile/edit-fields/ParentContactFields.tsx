import { Input } from "@/components/ui/input";
import { Field, Section, fieldError, type FieldErrors } from "./shared";
import type { PlayerFormState } from "./diff-payload";

interface ParentContactFieldsProps {
  state: PlayerFormState;
  onChange: (patch: Partial<PlayerFormState>) => void;
  errors?: FieldErrors;
  disabled?: boolean;
}

export function ParentContactFields({
  state,
  onChange,
  errors,
  disabled,
}: ParentContactFieldsProps) {
  return (
    <Section title="Contactos do encarregado">
      <Field
        id="parent_email"
        label="Email do encarregado"
        error={fieldError(errors, "parent_email")}
      >
        <Input
          id="parent_email"
          type="email"
          value={state.parent_email}
          onChange={(e) => onChange({ parent_email: e.target.value })}
          disabled={disabled}
        />
      </Field>
      <Field
        id="parent_phone"
        label="Telemóvel do encarregado"
        error={fieldError(errors, "parent_phone")}
      >
        <Input
          id="parent_phone"
          type="tel"
          value={state.parent_phone}
          onChange={(e) => onChange({ parent_phone: e.target.value })}
          disabled={disabled}
        />
      </Field>
    </Section>
  );
}
