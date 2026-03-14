"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  X,
  Mail,
  Check,
  Copy,
  Users,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { StaffInvite } from "@/components/team/setup/types";
import { ROLE_OPTIONS, ROLE_LABELS } from "@/components/team/setup/types";

interface LegacyStaffSectionProps {
  accountRole: string;
  showStaffForm: boolean;
  setShowStaffForm: (v: boolean) => void;
  inviteResult: { code: string; emailSent: boolean; name: string } | null;
  setInviteResult: (v: { code: string; emailSent: boolean; name: string } | null) => void;
  copiedCode: string | null;
  copyCode: (code: string) => void;
  staffForm: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    role: string;
  };
  setStaffForm: (v: ((f: { firstName: string; lastName: string; email: string; phone: string; role: string }) => { firstName: string; lastName: string; email: string; phone: string; role: string })) => void;
  sendingInvite: boolean;
  handleSendStaffInvite: (e: { preventDefault(): void }) => void;
  staffInvites: StaffInvite[];
  activeStaffProfileIds: string[];
  staffInvitesExpanded: boolean;
  setStaffInvitesExpanded: (v: boolean | ((prev: boolean) => boolean)) => void;
  confirmDeleteId: string | null;
  setConfirmDeleteId: (v: string | null) => void;
  deletingId: string | null;
  handleDeleteInvite: (invite: StaffInvite) => void;
  setError: (v: string | null) => void;
}

export function LegacyStaffSection({
  accountRole,
  showStaffForm,
  setShowStaffForm,
  inviteResult,
  setInviteResult,
  copiedCode,
  copyCode,
  staffForm,
  setStaffForm,
  sendingInvite,
  handleSendStaffInvite,
  staffInvites,
  activeStaffProfileIds,
  staffInvitesExpanded,
  setStaffInvitesExpanded,
  confirmDeleteId,
  setConfirmDeleteId,
  deletingId,
  handleDeleteInvite,
  setError,
}: LegacyStaffSectionProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Users size={16} /> Equipa Técnica
            </CardTitle>
            <CardDescription className="mt-1">
              {accountRole === "coordinator"
                ? "Convida treinadores para acederem à plataforma"
                : "Apenas o coordenador pode gerir convites e membros da equipa técnica"}
            </CardDescription>
          </div>
          {accountRole === "coordinator" && !showStaffForm && (
            <Button
              size="sm"
              onClick={() => {
                setShowStaffForm(true);
                setInviteResult(null);
                setError(null);
              }}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus size={14} className="mr-1" /> Convidar
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {showStaffForm && accountRole === "coordinator" && (
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-semibold text-slate-800 text-sm">
                Novo convite
              </h4>
              <button
                onClick={() => {
                  setShowStaffForm(false);
                  setInviteResult(null);
                }}
              >
                <X size={16} className="text-slate-400" />
              </button>
            </div>

            {inviteResult ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4">
                <p className="text-emerald-800 font-semibold text-sm mb-1">
                  {inviteResult!.emailSent
                    ? `✓ Email enviado para ${inviteResult!.name}!`
                    : `✓ Código gerado para ${inviteResult!.name}`}
                </p>
                {!inviteResult!.emailSent && (
                  <p className="text-emerald-700 text-xs mb-3">
                    O email não foi enviado. Partilha o código manualmente:
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-white border border-emerald-200 rounded-lg px-3 py-2 font-mono text-lg font-bold text-slate-800 text-center tracking-widest">
                    {inviteResult!.code}
                  </code>
                  <button
                    onClick={() => copyCode(inviteResult!.code)}
                    className="p-2 bg-emerald-100 hover:bg-emerald-200 rounded-lg transition-colors"
                  >
                    {copiedCode === inviteResult!.code ? (
                      <Check size={16} className="text-emerald-600" />
                    ) : (
                      <Copy size={16} className="text-emerald-600" />
                    )}
                  </button>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setInviteResult(null);
                    setShowStaffForm(true);
                  }}
                  className="mt-3 w-full"
                >
                  Convidar outro treinador
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSendStaffInvite} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Primeiro nome *</Label>
                    <Input
                      value={staffForm.firstName}
                      required
                      placeholder="João"
                      onChange={(e) =>
                        setStaffForm((f) => ({
                          ...f,
                          firstName: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Apelido *</Label>
                    <Input
                      value={staffForm.lastName}
                      required
                      placeholder="Silva"
                      onChange={(e) =>
                        setStaffForm((f) => ({
                          ...f,
                          lastName: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Email *</Label>
                  <Input
                    type="email"
                    value={staffForm.email}
                    required
                    placeholder="treinador@email.com"
                    onChange={(e) =>
                      setStaffForm((f) => ({ ...f, email: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Telemóvel</Label>
                  <Input
                    type="tel"
                    value={staffForm.phone}
                    placeholder="9XX XXX XXX"
                    onChange={(e) =>
                      setStaffForm((f) => ({ ...f, phone: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Função *</Label>
                  <Select
                    value={staffForm.role}
                    onValueChange={(v) =>
                      setStaffForm((f) => ({ ...f, role: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="submit"
                  disabled={sendingInvite}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                >
                  <Mail size={14} className="mr-2" />
                  {sendingInvite
                    ? "A enviar..."
                    : "Enviar convite por email"}
                </Button>
              </form>
            )}
          </div>
        )}

        {staffInvites.length > 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
            <button
              type="button"
              onClick={() => setStaffInvitesExpanded((prev: boolean) => !prev)}
              className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-slate-100 transition-colors"
            >
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Convites enviados
                </p>
                <p className="text-xs text-slate-400">
                  {staffInvites.length} convite{staffInvites.length !== 1 ? "s" : ""}
                </p>
              </div>
              {staffInvitesExpanded ? (
                <ChevronUp size={16} className="text-slate-400" />
              ) : (
                <ChevronDown size={16} className="text-slate-400" />
              )}
            </button>

            {staffInvitesExpanded && (
              <div className="space-y-2 border-t border-slate-200 p-3">
                {staffInvites.map((invite) => {
                  const isActiveMember =
                    !!invite.accepted_at &&
                    !!invite.accepted_by &&
                    activeStaffProfileIds.includes(invite.accepted_by);

                  return (
                    <div
                      key={invite.id}
                      className="rounded-xl border border-slate-100 bg-white"
                    >
                      <div className="flex items-center gap-3 p-3">
                        <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-slate-500">
                            {invite.first_name?.[0]}
                            {invite.last_name?.[0]}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-800 text-sm truncate">
                            {invite.first_name} {invite.last_name}
                          </p>
                          <p className="text-xs text-slate-400 truncate">
                            {ROLE_LABELS[invite.role] || invite.role} ·{" "}
                            {invite.email}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {isActiveMember ? (
                            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                              Activo
                            </span>
                          ) : invite.accepted_at ? (
                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                              Aceite (pendente)
                            </span>
                          ) : (
                            <>
                              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                                Pendente
                              </span>
                              {accountRole === "coordinator" && (
                                <button
                                  onClick={() => copyCode(invite.invite_code)}
                                  title="Copiar código"
                                  className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors"
                                >
                                  {copiedCode === invite.invite_code ? (
                                    <Check size={14} className="text-emerald-500" />
                                  ) : (
                                    <Copy size={14} className="text-slate-400" />
                                  )}
                                </button>
                              )}
                            </>
                          )}
                          {accountRole === "coordinator" && (
                            <button
                              onClick={() =>
                                setConfirmDeleteId(
                                  confirmDeleteId === invite.id ? null : invite.id,
                                )
                              }
                              disabled={deletingId === invite.id}
                              title={
                                invite.accepted_at
                                  ? "Remover membro"
                                  : "Cancelar convite"
                              }
                              className="p-1.5 hover:bg-red-50 rounded-lg transition-colors group"
                            >
                              {deletingId === invite.id ? (
                                <Loader2
                                  size={14}
                                  className="text-slate-300 animate-spin"
                                />
                              ) : (
                                <Trash2
                                  size={14}
                                  className="text-slate-300 group-hover:text-red-500 transition-colors"
                                />
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {accountRole === "coordinator" && confirmDeleteId === invite.id && (
                        <div className="px-3 pb-3 flex items-center gap-2">
                          <p className="text-xs text-red-600 flex-1">
                            {invite.accepted_at
                              ? "Remover este membro da equipa técnica?"
                              : "Cancelar este convite?"}
                          </p>
                          <button
                            onClick={() => handleDeleteInvite(invite)}
                            className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-3 py-1 rounded-lg transition-colors"
                          >
                            Confirmar
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-xs font-semibold text-slate-500 hover:text-slate-700 px-2 py-1 rounded-lg transition-colors"
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          !showStaffForm && (
            <p className="text-sm text-slate-400 text-center py-4">
              {accountRole === "coordinator"
                ? "Ainda não convidaste nenhum treinador."
                : "Sem treinadores associados a este escalão."}
            </p>
          )
        )}
      </CardContent>
    </Card>
  );
}
