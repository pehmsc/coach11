"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Building2, Users } from "lucide-react";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdminClubsListItem } from "@/app/api/admin/clubs/list/route";

const PLAN_TYPE_FILTERS = [
  { value: "all", label: "Todos" },
  { value: "club", label: "Clubes" },
  { value: "individual", label: "Individuais" },
] as const;

type PlanTypeFilter = (typeof PLAN_TYPE_FILTERS)[number]["value"];

type SortKey = "created_desc" | "name_asc" | "players_desc" | "staff_desc";

const SORT_LABELS: Record<SortKey, string> = {
  created_desc: "Mais recentes",
  name_asc: "Nome (A-Z)",
  players_desc: "Mais atletas",
  staff_desc: "Mais staff",
};

function PlanTypeBadge({ planType }: { planType: AdminClubsListItem["plan_type"] }) {
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

export function ClubsAdminPanel() {
  const [clubs, setClubs] = useState<AdminClubsListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [planFilter, setPlanFilter] = useState<PlanTypeFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_desc");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/clubs/list");
      const payload = (await res.json().catch(() => null)) as
        | { success?: boolean; clubs?: AdminClubsListItem[]; error?: string }
        | null;
      if (!res.ok || !payload?.clubs) {
        setError(payload?.error || "Erro ao carregar clubes.");
        return;
      }
      setClubs(payload.clubs);
    } catch {
      setError("Erro de ligacao.");
    } finally {
      setLoading(false);
    }
  }

  const visibleClubs = useMemo(() => {
    const filtered =
      planFilter === "all"
        ? clubs
        : clubs.filter((c) => c.plan_type === planFilter);
    const sorted = [...filtered];
    switch (sortKey) {
      case "name_asc":
        sorted.sort((a, b) => a.name.localeCompare(b.name, "pt"));
        break;
      case "players_desc":
        sorted.sort((a, b) => b.n_players - a.n_players);
        break;
      case "staff_desc":
        sorted.sort((a, b) => b.n_staff - a.n_staff);
        break;
      case "created_desc":
      default:
        sorted.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        break;
    }
    return sorted;
  }, [clubs, planFilter, sortKey]);

  const counts = useMemo(() => {
    const club = clubs.filter((c) => c.plan_type === "club").length;
    const individual = clubs.filter((c) => c.plan_type === "individual").length;
    return { club, individual, total: clubs.length };
  }, [clubs]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Clientes</CardTitle>
        <CardDescription>
          {counts.total} clube{counts.total === 1 ? "" : "s"} —{" "}
          {counts.club} clube{counts.club === 1 ? "" : "s"} sales-led,{" "}
          {counts.individual} individu{counts.individual === 1 ? "al" : "ais"}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase text-slate-500">
              Tipo
            </p>
            <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              {PLAN_TYPE_FILTERS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPlanFilter(option.value)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    planFilter === option.value
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase text-slate-500">
              Ordenar por
            </span>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <option key={key} value={key}>
                  {SORT_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
            <AlertCircle
              size={24}
              className="mx-auto mb-2 text-red-400"
              aria-hidden="true"
            />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        ) : visibleClubs.length === 0 ? (
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-6 text-center">
            <p className="text-sm text-slate-500">
              Sem clubes para este filtro.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {visibleClubs.map((club) => (
              <li
                key={club.id}
                className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3"
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 overflow-hidden">
                  {club.logo_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={club.logo_url}
                      alt={club.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Building2 size={18} aria-hidden="true" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {club.name}
                    </p>
                    <PlanTypeBadge planType={club.plan_type} />
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Criado{" "}
                    {format(parseISO(club.created_at), "d MMM yyyy", {
                      locale: pt,
                    })}{" "}
                    · slug <span className="font-mono">{club.slug}</span>
                  </p>
                </div>
                <div className="hidden sm:flex flex-shrink-0 gap-4 text-right">
                  <div>
                    <p className="text-xs text-slate-400">Escaloes</p>
                    <p className="text-sm font-semibold text-slate-900">
                      {club.n_age_groups}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Atletas</p>
                    <p className="text-sm font-semibold text-slate-900">
                      {club.n_players}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Staff</p>
                    <p className="text-sm font-semibold text-slate-900">
                      {club.n_staff}
                    </p>
                  </div>
                </div>
                <div className="sm:hidden flex flex-col items-end gap-0.5 text-[10px] text-slate-500">
                  <span>{club.n_age_groups} esc.</span>
                  <span className="inline-flex items-center gap-0.5">
                    <Users size={10} aria-hidden="true" />
                    {club.n_players}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}

        {!loading && !error && visibleClubs.length > 0 && (
          <p className="mt-3 text-xs text-slate-500">
            {visibleClubs.length} cliente{visibleClubs.length === 1 ? "" : "s"} visivel{visibleClubs.length === 1 ? "" : "s"}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
