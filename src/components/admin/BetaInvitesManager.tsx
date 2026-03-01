"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2, Mail, ShieldAlert, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type BetaInviteItem = {
  id: string;
  email: string;
  invite_type: string;
  status: string;
  expires_at: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
  onboardingUrl: string;
};

type Props = {
  embedded?: boolean;
};

export function BetaInvitesManager({ embedded = false }: Props) {
  const [email, setEmail] = useState("");
  const [inviteTypeFilter, setInviteTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [invites, setInvites] = useState<BetaInviteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  useEffect(() => {
    void loadInvites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteTypeFilter, statusFilter]);

  async function loadInvites() {
    setLoading(true);

    try {
      const params = new URLSearchParams();
      params.set("inviteType", inviteTypeFilter);
      params.set("status", statusFilter);

      const res = await fetch(`/api/admin/beta-invites/list?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(payload?.error || "Não foi possível carregar os convites beta.");
        setInvites([]);
        return;
      }

      setInvites(Array.isArray(payload?.invites) ? (payload.invites as BetaInviteItem[]) : []);
    } catch {
      toast.error("Erro de ligação ao carregar os convites beta.");
      setInvites([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      toast.error("Indica um email válido.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/beta-invites/create-coordinator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok || payload?.success !== true) {
        toast.error(payload?.error || "Não foi possível criar o convite beta.");
        return;
      }

      setEmail("");
      toast.success("Convite beta criado.");
      await loadInvites();
    } catch {
      toast.error("Erro de ligação ao criar o convite beta.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(inviteId: string) {
    setRevokingId(inviteId);
    try {
      const res = await fetch("/api/admin/beta-invites/revoke", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteId }),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok || payload?.success !== true) {
        toast.error(payload?.error || "Não foi possível revogar o convite beta.");
        return;
      }

      toast.success("Convite beta revogado.");
      await loadInvites();
    } catch {
      toast.error("Erro de ligação ao revogar o convite beta.");
    } finally {
      setRevokingId(null);
    }
  }

  async function handleCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      toast.success("Link de registo copiado.");
      window.setTimeout(() => setCopiedUrl(null), 1600);
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  }

  function statusLabel(status: string) {
    switch (status) {
      case "accepted":
        return "Aceite";
      case "revoked":
        return "Revogado";
      case "expired":
        return "Expirado";
      default:
        return "Enviado";
    }
  }

  const content = (
    <div className="space-y-4">
      <form onSubmit={handleCreateInvite} className="grid gap-3 md:grid-cols-[1fr_auto]">
        <div className="space-y-1.5">
          <Label>Email do coordenador beta</Label>
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="coordenador@email.com"
            required
          />
        </div>
        <Button
          type="submit"
          className="self-end bg-emerald-600 hover:bg-emerald-700"
          disabled={submitting}
        >
          {submitting ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Mail size={14} className="mr-2" />}
          Convidar coordenador
        </Button>
      </form>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-slate-700">Tipo</span>
          <select
            value={inviteTypeFilter}
            onChange={(event) => setInviteTypeFilter(event.target.value)}
            className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
          >
            <option value="all">Todos</option>
            <option value="beta_coordinator">Beta coordinator</option>
            <option value="staff">Staff</option>
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-slate-700">Estado</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
          >
            <option value="all">Todos</option>
            <option value="sent">Sent</option>
            <option value="accepted">Accepted</option>
            <option value="revoked">Revoked</option>
            <option value="expired">Expired</option>
          </select>
        </label>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          A carregar convites beta...
        </div>
      ) : invites.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          Ainda não existem convites beta com estes filtros.
        </div>
      ) : (
        <div className="space-y-3">
          {invites.map((invite) => (
            <div key={invite.id} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{invite.email}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {invite.invite_type === "beta_coordinator" ? "Coordenador beta" : "Staff"} · {statusLabel(invite.status)}
                  </p>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <p>Criado em {new Date(invite.created_at).toLocaleString("pt-PT")}</p>
                  {invite.accepted_at ? (
                    <p>Aceite em {new Date(invite.accepted_at).toLocaleString("pt-PT")}</p>
                  ) : null}
                  {invite.revoked_at ? (
                    <p>Revogado em {new Date(invite.revoked_at).toLocaleString("pt-PT")}</p>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                <Input value={invite.onboardingUrl} readOnly className="bg-white text-xs" />
                <Button type="button" variant="outline" size="icon" onClick={() => void handleCopy(invite.onboardingUrl)}>
                  {copiedUrl === invite.onboardingUrl ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="border-red-200 text-red-600 hover:bg-red-50"
                  onClick={() => void handleRevoke(invite.id)}
                  disabled={revokingId === invite.id}
                >
                  {revokingId === invite.id ? (
                    <Loader2 size={14} className="mr-2 animate-spin" />
                  ) : (
                    <XCircle size={14} className="mr-2" />
                  )}
                  Revogar convite
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldAlert size={16} />
          Beta · Convites de Coordenador
        </CardTitle>
        <CardDescription>
          Cria, acompanha e revoga convites de coordenadores beta.
        </CardDescription>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}
