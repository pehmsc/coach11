"use client";

import { Button } from "@/components/ui/button";
import { AppModal } from "@/components/ui/app-modal";
import type { Player } from "@/types/database";
import { PLAYER_STATUS_CONFIG } from "./status-config";

interface PlayerEditModalProps {
  player: Player;
  /**
   * `"readonly"` (PR 1): todos os campos são displays. Botão "Guardar"
   * disabled.
   * `"edit"` (PR 2): trocará displays por inputs e ativará submit.
   */
  mode: "readonly" | "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DASH = "—";

function displayText(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return DASH;
  if (typeof value === "string" && value.trim().length === 0) return DASH;
  return String(value);
}

function displayBool(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return DASH;
  return value ? "Sim" : "Não";
}

interface FieldProps {
  label: string;
  value: string;
  /** Permite render de blocks longos (notes) com whitespace preserved. */
  multiline?: boolean;
}

function Field({ label, value, multiline = false }: FieldProps) {
  return (
    <div className="space-y-1">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd
        className={`text-sm text-slate-900 ${multiline ? "whitespace-pre-wrap" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-bold text-slate-900">{title}</h3>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</dl>
    </div>
  );
}

export function PlayerEditModal({
  player,
  mode,
  open,
  onOpenChange,
}: PlayerEditModalProps) {
  const statusLabel =
    PLAYER_STATUS_CONFIG[player.status]?.label ??
    PLAYER_STATUS_CONFIG.active.label;

  const isReadonly = mode === "readonly";

  return (
    <AppModal
      open={open}
      title={`${player.first_name} ${player.last_name}`.trim()}
      onClose={() => onOpenChange(false)}
    >
      <div className="space-y-5">
        <Section title="Identidade">
          <Field label="Primeiro nome" value={displayText(player.first_name)} />
          <Field label="Apelido" value={displayText(player.last_name)} />
          <Field
            label="Data de nascimento"
            value={displayText(player.birth_date)}
          />
          <Field
            label="Posição preferida"
            value={displayText(player.preferred_position)}
          />
          <Field
            label="Posição secundária"
            value={displayText(player.secondary_position)}
          />
          <Field
            label="Número de camisola"
            value={displayText(player.jersey_number)}
          />
          <Field label="Estado" value={statusLabel} />
        </Section>

        <Section title="Contactos do atleta">
          <Field label="Telemóvel" value={displayText(player.phone)} />
          <Field label="Email" value={displayText(player.email)} />
        </Section>

        <Section title="Contactos do encarregado">
          <Field
            label="Email do encarregado"
            value={displayText(player.parent_email)}
          />
          <Field
            label="Telemóvel do encarregado"
            value={displayText(player.parent_phone)}
          />
        </Section>

        <div>
          <h3 className="mb-2 text-sm font-bold text-slate-900">Observações</h3>
          <dl>
            <Field
              label="Notas"
              value={displayText(player.notes)}
              multiline
            />
          </dl>
        </div>

        <Section title="RGPD">
          <Field
            label="Consentimento para apresentar foto"
            value={displayBool(player.photo_consent_given)}
          />
        </Section>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Fechar
          </Button>
          <Button
            type="button"
            disabled={isReadonly}
            title={
              isReadonly ? "Edição disponível em breve." : undefined
            }
            className="bg-blue-600 hover:bg-blue-700"
          >
            Guardar
          </Button>
        </div>
      </div>
    </AppModal>
  );
}
