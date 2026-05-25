"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronLeft,
  Loader2,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatGameDateTime } from "@/lib/events/time";
import type {
  AdminClubSnapshotAgeGroup,
  AdminClubSnapshotPayload,
  AdminClubSnapshotPendingCoordinator,
} from "@/app/api/admin/clubs/[id]/snapshot/route";

interface Props {
  clubId: string;
}

function PlanBadge({ planType }: { planType: "individual" | "club" }) {
  const isClub = planType === "club";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${
        isClub
          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
          : "bg-indigo-50 text-indigo-700 ring-indigo-200"
      }`}
    >
      {isClub ? "Clube" : "Individual"}
    </span>
  );
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  try {
    return formatDistanceToNow(parseISO(iso), { locale: pt, addSuffix: true });
  } catch {
    return "—";
  }
}

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-3">
      <p className="text-[10px] uppercase font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function AgeGroupRow({ ag }: { ag: AdminClubSnapshotAgeGroup }) {
  const inactive = ag.trainings_last_7d === 0 && ag.games_last_7d === 0;
  return (
    <tr className={inactive ? "bg-amber-50/40" : undefined}>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-900">{ag.name}</span>
          {ag.football_format ? (
            <span className="inline-flex rounded-full bg-slate-100 text-slate-600 px-1.5 py-0.5 text-[10px] font-semibold">
              {ag.football_format}
            </span>
          ) : null}
          {inactive ? (
            <span className="inline-flex rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5 text-[10px] font-semibold">
              ⚠ inactivo 7d
            </span>
          ) : null}
        </div>
      </td>
      <td className="px-3 py-2.5 text-right text-sm text-slate-900">{ag.n_players}</td>
      <td className="px-3 py-2.5 text-right text-sm text-slate-900">{ag.n_staff}</td>
      <td className="px-3 py-2.5 text-right text-sm text-slate-900">{ag.trainings_last_7d}</td>
      <td className="px-3 py-2.5 text-right text-sm text-slate-900">{ag.games_last_7d}</td>
      <td className="px-3 py-2.5 text-right text-xs text-slate-500">
        {fmtRelative(ag.last_activity_at)}
      </td>
    </tr>
  );
}

export function ClubSnapshotView({ clubId }: Props) {
  const [snapshot, setSnapshot] = useState<AdminClubSnapshotPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessedAtIso] = useState(() => new Date().toISOString());

  async function refresh() {
    setError(null);
    try {
      const res = await fetch(`/api/admin/clubs/${clubId}/snapshot`, {
        cache: "no-store",
      });
      const payload = (await res.json().catch(() => null)) as
        | { success?: boolean; snapshot?: AdminClubSnapshotPayload; error?: string }
        | null;
      if (!res.ok || !payload?.snapshot) {
        setError(payload?.error || "Erro ao carregar snapshot.");
        return;
      }
      setSnapshot(payload.snapshot);
    } catch {
      setError("Erro de ligacao.");
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/clubs/${clubId}/snapshot`, {
          cache: "no-store",
        });
        const payload = (await res.json().catch(() => null)) as
          | { success?: boolean; snapshot?: AdminClubSnapshotPayload; error?: string }
          | null;
        if (cancelled) return;
        if (!res.ok || !payload?.snapshot) {
          setError(payload?.error || "Erro ao carregar snapshot.");
          return;
        }
        setSnapshot(payload.snapshot);
      } catch {
        if (!cancelled) setError("Erro de ligacao.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clubId]);

  const accessedAtLabel = useMemo(
    () => formatGameDateTime(accessedAtIso, "shortWithYear"),
    [accessedAtIso],
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full rounded-xl" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <div className="flex items-start gap-2">
          <AlertCircle size={20} className="text-red-400 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-red-900">
              {error || "Snapshot indisponivel."}
            </p>
            <Link
              href="/admin/clubs"
              className="mt-2 inline-block text-xs font-medium text-red-700 hover:underline"
            >
              Voltar a Clubes
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const {
    club,
    totals,
    coordinators,
    pending_coordinator: pendingCoordinator,
    age_groups: ageGroups,
  } = snapshot;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/clubs"
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"
        >
          <ChevronLeft size={14} aria-hidden="true" />
          Voltar a Clubes
        </Link>

        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="size-12 flex-shrink-0 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center overflow-hidden">
              {club.logo_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={club.logo_url}
                  alt={club.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Building2 size={22} aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-slate-900 truncate">
                {club.name}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-mono">{club.slug}</span>
                <span>·</span>
                <PlanBadge planType={club.plan_type} />
                <span>·</span>
                <span>
                  Cliente desde{" "}
                  {formatGameDateTime(club.created_at, "shortWithYear").split(
                    " · ",
                  )[0]}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <p className="font-semibold flex items-center gap-1.5">
              <ShieldCheck size={13} aria-hidden="true" />
              Snapshot read-only
            </p>
            <p className="mt-0.5 text-[11px]">
              Acesso de suporte · {accessedAtLabel}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Escalões" value={totals.n_age_groups} />
        <KpiCard label="Atletas" value={totals.n_players} />
        <KpiCard label="Staff" value={totals.n_staff} />
        <KpiCard label="Treinos / 7d" value={totals.trainings_last_7d} />
        <KpiCard label="Jogos / 7d" value={totals.games_last_7d} />
      </div>

      <PendingCoordinatorCard
        clubId={clubId}
        pendingCoordinator={pendingCoordinator}
        hasRegisteredCoordinator={coordinators.length > 0}
        onInviteSent={() => {
          void refresh();
        }}
      />

      <div className="rounded-2xl border border-slate-100 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">
          {coordinators.length === 1
            ? "Coordenador do clube"
            : `Coordenadores do clube (${coordinators.length})`}
        </h2>
        {coordinators.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">
            {pendingCoordinator
              ? "O coordenador pendente ainda não se registou (ver card acima)."
              : "Nenhum membro com role club_coordinator/owner/admin encontrado."}
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {coordinators.map((coord) => (
              <li key={coord.profile_id} className="flex items-center gap-3">
                <div className="size-10 flex-shrink-0 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-sm font-semibold overflow-hidden">
                  {coord.avatar_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={coord.avatar_url}
                      alt={coord.full_name ?? "Coordenador"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    (coord.full_name || coord.email || "?")
                      .slice(0, 2)
                      .toUpperCase()
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {coord.full_name || "(sem nome)"}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {coord.email || "(sem email)"}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Último login: {fmtRelative(coord.last_sign_in_at)}
                    {coord.joined_at ? (
                      <>
                        {" "}
                        · Membro desde {fmtRelative(coord.joined_at)}
                      </>
                    ) : null}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">
          Escalões ({ageGroups.length})
        </h2>
        {ageGroups.length === 0 ? (
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-6 text-center">
            <p className="text-sm text-slate-500">
              Este clube ainda nao tem escaloes criados.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-100 bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold">Escalão</th>
                  <th className="text-right px-3 py-2 font-semibold">Atletas</th>
                  <th className="text-right px-3 py-2 font-semibold">Staff</th>
                  <th className="text-right px-3 py-2 font-semibold">Treinos / 7d</th>
                  <th className="text-right px-3 py-2 font-semibold">Jogos / 7d</th>
                  <th className="text-right px-3 py-2 font-semibold">Última actividade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ageGroups.map((ag) => (
                  <AgeGroupRow key={ag.id} ag={ag} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
        <p className="font-semibold">Snapshot v1</p>
        <p className="mt-1">
          Read-only. Outras acções de suporte (reset password, marcar status
          de billing, ver audit log) e métricas PostHog ficam para PRs
          incrementais.
        </p>
      </div>
    </div>
  );
}

function PendingCoordinatorCard({
  clubId,
  pendingCoordinator,
  hasRegisteredCoordinator,
  onInviteSent,
}: {
  clubId: string;
  pendingCoordinator: AdminClubSnapshotPendingCoordinator | null;
  hasRegisteredCoordinator: boolean;
  onInviteSent: () => void;
}) {
  const [sending, setSending] = useState(false);

  if (!pendingCoordinator) return null;

  // Se ja ha coordenador registado, o pending e historico — mostra apenas
  // info compacta sem botao.
  const isHistorical = hasRegisteredCoordinator;
  const wasSent = pendingCoordinator.invite_sent_at !== null;

  async function handleSendInvite() {
    setSending(true);
    try {
      const res = await fetch(
        `/api/admin/clubs/${clubId}/invite-coordinator`,
        { method: "POST" },
      );
      const payload = (await res.json().catch(() => null)) as
        | { success?: boolean; emailSent?: boolean; warning?: string; error?: string }
        | null;
      if (!res.ok || !payload?.success) {
        toast.error(payload?.error || "Erro a enviar convite.");
        return;
      }
      if (payload.emailSent) {
        toast.success(`Convite enviado a ${pendingCoordinator?.email}.`);
      } else if (payload.warning) {
        toast.warning(payload.warning);
      } else {
        toast.success("Convite registado.");
      }
      onInviteSent();
    } catch {
      toast.error("Erro de ligação.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className={`rounded-2xl border p-4 ${
        isHistorical
          ? "border-slate-100 bg-slate-50/50"
          : "border-amber-200 bg-amber-50/60"
      }`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="size-10 flex-shrink-0 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
            <Mail size={18} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-slate-900">
              {isHistorical
                ? "Coordenador (dados recolhidos no onboarding)"
                : wasSent
                  ? "Coordenador pendente — convite enviado"
                  : "Coordenador pendente — sem convite ainda"}
            </h2>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {pendingCoordinator.name}
            </p>
            <p className="text-xs text-slate-600">
              {pendingCoordinator.email}
              {pendingCoordinator.phone ? (
                <>
                  {" "}
                  · {pendingCoordinator.phone}
                </>
              ) : null}
            </p>
            {wasSent ? (
              <p className="mt-1 text-[11px] text-slate-500 inline-flex items-center gap-1">
                <CheckCircle2 size={11} className="text-emerald-600" aria-hidden="true" />
                Convite enviado {fmtRelative(pendingCoordinator.invite_sent_at)}
              </p>
            ) : null}
          </div>
        </div>

        {!isHistorical ? (
          <Button
            type="button"
            onClick={() => void handleSendInvite()}
            disabled={sending}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {sending ? (
              <>
                <Loader2 size={14} className="mr-1.5 animate-spin" />
                A enviar...
              </>
            ) : wasSent ? (
              "Reenviar convite"
            ) : (
              "Enviar convite"
            )}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
