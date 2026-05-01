"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AppModal } from "@/components/ui/app-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { Player } from "@/types/database";
import { PLAYER_STATUS_CONFIG } from "./status-config";
import {
  diffPayload,
  playerToFormState,
  type PlayerFormState,
} from "./edit-fields/diff-payload";
import type { FieldErrors } from "./edit-fields/shared";
import { IdentityFields } from "./edit-fields/IdentityFields";
import { PlayerContactFields } from "./edit-fields/PlayerContactFields";
import { ParentContactFields } from "./edit-fields/ParentContactFields";
import { NotesField } from "./edit-fields/NotesField";
import { RGPDField } from "./edit-fields/RGPDField";

type Mode = "readonly" | "edit";

interface PlayerEditModalProps {
  player: Player;
  /**
   * `"readonly"` (PR 1): todos os campos são displays. Botão "Guardar"
   * disabled.
   * `"edit"` (PR 2): inputs editáveis + submit funcional.
   */
  mode: Mode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (updated: Player) => void;
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
  multiline?: boolean;
}

function ReadonlyField({ label, value, multiline = false }: FieldProps) {
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

interface ReadonlySectionProps {
  title: string;
  children: React.ReactNode;
}

function ReadonlySection({ title, children }: ReadonlySectionProps) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-bold text-slate-900">{title}</h3>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</dl>
    </div>
  );
}

function ReadonlyContent({ player }: { player: Player }) {
  const statusLabel =
    PLAYER_STATUS_CONFIG[player.status]?.label ??
    PLAYER_STATUS_CONFIG.active.label;
  return (
    <>
      <ReadonlySection title="Identidade">
        <ReadonlyField
          label="Primeiro nome"
          value={displayText(player.first_name)}
        />
        <ReadonlyField label="Apelido" value={displayText(player.last_name)} />
        <ReadonlyField
          label="Data de nascimento"
          value={displayText(player.birth_date)}
        />
        <ReadonlyField
          label="Posição preferida"
          value={displayText(player.preferred_position)}
        />
        <ReadonlyField
          label="Posição secundária"
          value={displayText(player.secondary_position)}
        />
        <ReadonlyField
          label="Número de camisola"
          value={displayText(player.jersey_number)}
        />
        <ReadonlyField label="Estado" value={statusLabel} />
      </ReadonlySection>
      <ReadonlySection title="Contactos do atleta">
        <ReadonlyField label="Telemóvel" value={displayText(player.phone)} />
        <ReadonlyField label="Email" value={displayText(player.email)} />
      </ReadonlySection>
      <ReadonlySection title="Contactos do encarregado">
        <ReadonlyField
          label="Email do encarregado"
          value={displayText(player.parent_email)}
        />
        <ReadonlyField
          label="Telemóvel do encarregado"
          value={displayText(player.parent_phone)}
        />
      </ReadonlySection>
      <div>
        <h3 className="mb-2 text-sm font-bold text-slate-900">Observações</h3>
        <dl>
          <ReadonlyField
            label="Notas"
            value={displayText(player.notes)}
            multiline
          />
        </dl>
      </div>
      <ReadonlySection title="RGPD">
        <ReadonlyField
          label="Consentimento para apresentar foto"
          value={displayBool(player.photo_consent_given)}
        />
      </ReadonlySection>
    </>
  );
}

interface EditContentProps {
  state: PlayerFormState;
  onChange: (patch: Partial<PlayerFormState>) => void;
  errors?: FieldErrors;
  disabled?: boolean;
}

function EditContent({
  state,
  onChange,
  errors,
  disabled,
}: EditContentProps) {
  return (
    <>
      <IdentityFields
        state={state}
        onChange={onChange}
        errors={errors}
        disabled={disabled}
      />
      <PlayerContactFields
        state={state}
        onChange={onChange}
        errors={errors}
        disabled={disabled}
      />
      <ParentContactFields
        state={state}
        onChange={onChange}
        errors={errors}
        disabled={disabled}
      />
      <NotesField
        state={state}
        onChange={onChange}
        errors={errors}
        disabled={disabled}
      />
      <RGPDField state={state} onChange={onChange} disabled={disabled} />
    </>
  );
}

export function PlayerEditModal({
  player,
  mode,
  open,
  onOpenChange,
  onSaved,
}: PlayerEditModalProps) {
  const isReadonly = mode === "readonly";
  const [formState, setFormState] = useState<PlayerFormState>(() =>
    playerToFormState(player),
  );
  const [saving, setSaving] = useState(false);
  const [topError, setTopError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors | undefined>();
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  // Re-inicializa o form sempre que abre com o player original.
  useEffect(() => {
    if (open) {
      setFormState(playerToFormState(player));
      setTopError(null);
      setFieldErrors(undefined);
    }
  }, [open, player]);

  function handleFieldChange(patch: Partial<PlayerFormState>) {
    setFormState((prev) => ({ ...prev, ...patch }));
  }

  const dirtyDiff = isReadonly ? {} : diffPayload(player, formState);
  const hasChanges = Object.keys(dirtyDiff).length > 0;

  function attemptClose() {
    if (saving) return;
    if (!isReadonly && hasChanges) {
      setConfirmDiscardOpen(true);
      return;
    }
    onOpenChange(false);
  }

  function discardAndClose() {
    setConfirmDiscardOpen(false);
    onOpenChange(false);
  }

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (saving || isReadonly) return;

    if (!hasChanges) {
      toast.info("Nada a alterar.");
      onOpenChange(false);
      return;
    }

    setSaving(true);
    setTopError(null);
    setFieldErrors(undefined);

    try {
      const res = await fetch(`/api/players/${player.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dirtyDiff),
      });

      const payload = (await res.json().catch(() => null)) as
        | {
            success?: boolean;
            player?: Player;
            error?: string;
            fieldErrors?: FieldErrors;
          }
        | null;

      if (res.status === 422 && payload?.fieldErrors) {
        setFieldErrors(payload.fieldErrors);
        setTopError("Corrige os campos sinalizados.");
        return;
      }

      if (!res.ok || !payload?.player) {
        setTopError(payload?.error || "Erro ao guardar. Tenta novamente.");
        return;
      }

      toast.success("Atleta atualizado.");
      onSaved?.(payload.player);
      onOpenChange(false);
    } catch {
      setTopError("Erro de ligação. Tenta novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <AppModal
        open={open}
        title={`${player.first_name} ${player.last_name}`.trim()}
        onClose={attemptClose}
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          {topError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle
                size={16}
                className="mt-0.5 flex-shrink-0"
                aria-hidden="true"
              />
              <p>{topError}</p>
            </div>
          )}

          {isReadonly ? (
            <ReadonlyContent player={player} />
          ) : (
            <EditContent
              state={formState}
              onChange={handleFieldChange}
              errors={fieldErrors}
              disabled={saving}
            />
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={attemptClose}
              disabled={saving}
            >
              {isReadonly ? "Fechar" : "Cancelar"}
            </Button>
            <Button
              type="submit"
              disabled={isReadonly || saving}
              title={isReadonly ? "Edição disponível em breve." : undefined}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saving ? (
                <>
                  <Loader2 size={14} className="mr-1.5 animate-spin" />
                  A guardar...
                </>
              ) : (
                "Guardar"
              )}
            </Button>
          </div>
        </form>
      </AppModal>

      <ConfirmDialog
        open={confirmDiscardOpen}
        onOpenChange={setConfirmDiscardOpen}
        title="Descartar alterações?"
        description="Tens alterações não guardadas. Se sair, as alterações serão perdidas."
        confirmLabel="Descartar"
        cancelLabel="Continuar a editar"
        destructive
        onConfirm={discardAndClose}
      />
    </>
  );
}
