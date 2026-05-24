"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { AlertCircle, Loader2 } from "lucide-react";
import { StickyBackLink } from "@/components/navigation/StickyBackLink";
import { Breadcrumb, type BreadcrumbItem } from "@/components/navigation/Breadcrumb";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getReturnTo } from "@/hooks/useReturnTo";

interface TrainingRef {
  id: string;
  session_date: string;
  start_time?: string | null;
  end_time?: string | null;
  title?: string | null;
  status?: string | null;
  focus?: string | null;
  ut_number?: number | null;
}

interface TrainingHistoryRow {
  id: string;
  training_session_id: string;
  status: string;
  justification?: string | null;
  marked_at?: string | null;
  training_sessions: TrainingRef | TrainingRef[] | null;
}

interface ApiResponse {
  success?: boolean;
  items?: TrainingHistoryRow[];
  hasMore?: boolean;
  error?: string;
}

const PAGE_SIZE = 20;

type StatusKey = "present" | "late" | "absent" | "injured";
const STATUS_KEYS: StatusKey[] = ["present", "late", "absent", "injured"];

const STATUS_CONFIG: Record<
  StatusKey,
  { label: string; color: string; pillActive: string; pillInactive: string }
> = {
  present: {
    label: "Presente",
    color: "bg-emerald-100 text-emerald-700",
    pillActive: "bg-emerald-600 text-white border-emerald-600",
    pillInactive: "bg-white text-emerald-700 border-emerald-200",
  },
  late: {
    label: "Atrasado",
    color: "bg-amber-100 text-amber-700",
    pillActive: "bg-amber-600 text-white border-amber-600",
    pillInactive: "bg-white text-amber-700 border-amber-200",
  },
  absent: {
    label: "Falta",
    color: "bg-red-100 text-red-700",
    pillActive: "bg-red-600 text-white border-red-600",
    pillInactive: "bg-white text-red-700 border-red-200",
  },
  injured: {
    label: "Lesionado",
    color: "bg-orange-100 text-orange-700",
    pillActive: "bg-orange-600 text-white border-orange-600",
    pillInactive: "bg-white text-orange-700 border-orange-200",
  },
};

type SortKey = "date_desc" | "date_asc";

const SORT_LABEL: Record<SortKey, string> = {
  date_desc: "Data (mais recente)",
  date_asc: "Data (mais antiga)",
};

function unwrapTraining(
  v: TrainingHistoryRow["training_sessions"],
): TrainingRef | null {
  if (!v) return null;
  if (Array.isArray(v)) return v[0] ?? null;
  return v;
}

/**
 * Scope override permite à rota escalão (/teams/[id]/players/[playerId]/trainings)
 * personalizar breadcrumb e returnHref sem duplicar a view inteira.
 */
export type PlayerTrainingsHistoryScope = {
  breadcrumbItemsPrefix: BreadcrumbItem[];
  fallbackReturnHref: string;
  returnToKey: string;
  backLabel: string;
};

interface Props {
  playerId: string;
  scope: PlayerTrainingsHistoryScope;
}

export function PlayerTrainingsHistoryView({ playerId, scope }: Props) {
  const [items, setItems] = useState<TrainingHistoryRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [returnHref] = useState(() =>
    getReturnTo(scope.returnToKey, scope.fallbackReturnHref),
  );

  const [statusSelected, setStatusSelected] = useState<Set<StatusKey>>(
    () => new Set(STATUS_KEYS),
  );
  const [utFilter, setUtFilter] = useState<number | "all">("all");
  const [sort, setSort] = useState<SortKey>("date_desc");
  const [discoveredUts, setDiscoveredUts] = useState<Set<number>>(new Set());

  const filterKey = useMemo(() => {
    const statusList = Array.from(statusSelected).sort().join(",");
    return `${statusList}|${utFilter}|${sort}`;
  }, [statusSelected, utFilter, sort]);

  const buildUrl = useCallback(
    (offset: number) => {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(offset));
      params.set("sort", sort);
      if (statusSelected.size > 0 && statusSelected.size < STATUS_KEYS.length) {
        params.set("status", Array.from(statusSelected).join(","));
      }
      if (utFilter !== "all") {
        params.set("ut", String(utFilter));
      }
      return `/api/players/${playerId}/trainings?${params.toString()}`;
    },
    [playerId, sort, statusSelected, utFilter],
  );

  const load = useCallback(
    async (offset: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await fetch(buildUrl(offset));
        const payload = (await res.json().catch(() => null)) as
          | ApiResponse
          | null;
        if (!res.ok || !payload?.items) {
          setError(payload?.error || "Erro ao carregar treinos.");
          return;
        }
        const fetched = payload.items;
        setItems((prev) => (append ? [...prev, ...fetched] : fetched));
        setHasMore(Boolean(payload.hasMore));
        setDiscoveredUts((prev) => {
          const next = new Set(prev);
          fetched.forEach((row) => {
            const session = unwrapTraining(row.training_sessions);
            if (typeof session?.ut_number === "number" && session.ut_number > 0) {
              next.add(session.ut_number);
            }
          });
          return next;
        });
      } catch {
        setError("Erro de ligação.");
      } finally {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [buildUrl],
  );

  useEffect(() => {
    void load(0, false);
  }, [load, filterKey]);

  function toggleStatus(key: StatusKey) {
    setStatusSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function clearFilters() {
    setStatusSelected(new Set(STATUS_KEYS));
    setUtFilter("all");
    setSort("date_desc");
  }

  const utOptions = useMemo(() => {
    const list = Array.from(discoveredUts).sort((a, b) => a - b);
    if (utFilter !== "all" && !list.includes(utFilter)) {
      list.push(utFilter);
      list.sort((a, b) => a - b);
    }
    return list;
  }, [discoveredUts, utFilter]);

  const allStatusSelected = statusSelected.size === STATUS_KEYS.length;
  const filtersActive =
    !allStatusSelected || utFilter !== "all" || sort !== "date_desc";

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <StickyBackLink
        href={returnHref}
        label={scope.backLabel}
        wrapperClassName="-mx-4 mb-4 bg-slate-50/95 px-4 py-2 md:-mx-8 md:px-8"
      >
        <Breadcrumb
          items={[
            ...scope.breadcrumbItemsPrefix,
            { label: "Treinos" },
          ]}
        />
      </StickyBackLink>

      <h1 className="mb-4 text-xl font-bold text-slate-900">
        Histórico de treinos
      </h1>

      <div className="mb-4 space-y-3 rounded-xl border border-slate-100 bg-white p-3">
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase text-slate-500">
            Status
          </p>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_KEYS.map((key) => {
              const cfg = STATUS_CONFIG[key];
              const active = statusSelected.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleStatus(key)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                    active ? cfg.pillActive : cfg.pillInactive
                  }`}
                  aria-pressed={active}
                >
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase text-slate-500">
              UT
            </span>
            <select
              value={utFilter === "all" ? "all" : String(utFilter)}
              onChange={(event) => {
                const value = event.target.value;
                setUtFilter(value === "all" ? "all" : Number.parseInt(value, 10));
              }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Todas</option>
              {utOptions.map((ut) => (
                <option key={ut} value={ut}>
                  UT{String(ut).padStart(2, "0")}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase text-slate-500">
              Ordenar por
            </span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="date_desc">{SORT_LABEL.date_desc}</option>
              <option value="date_asc">{SORT_LABEL.date_asc}</option>
            </select>
          </label>

          {filtersActive && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clearFilters}
              className="text-xs"
            >
              Limpar filtros
            </Button>
          )}
        </div>

        {!loading && !error && (
          <p className="text-xs text-slate-500">
            {items.length} {items.length === 1 ? "treino" : "treinos"}
            {hasMore ? " carregados (há mais)" : filtersActive ? " filtrados" : ""}
          </p>
        )}
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
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-6 text-center">
          <p className="text-sm text-slate-500">
            {filtersActive
              ? "Sem treinos para estes filtros."
              : "Sem treinos registados nesta época."}
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {items.map((row) => {
              const session = unwrapTraining(row.training_sessions);
              const sessionDate = session?.session_date
                ? parseISO(`${session.session_date}T00:00:00`)
                : null;
              const sc =
                (STATUS_CONFIG as Record<string, (typeof STATUS_CONFIG)[StatusKey]>)[row.status] ??
                {
                  label: row.status,
                  color: "bg-slate-100 text-slate-700",
                  pillActive: "",
                  pillInactive: "",
                };
              return (
                <li
                  key={row.id}
                  className="rounded-xl border border-slate-100 bg-white p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-400">
                        {sessionDate
                          ? format(sessionDate, "d MMM yyyy", { locale: pt })
                          : "—"}
                        {session?.start_time
                          ? ` · ${session.start_time.slice(0, 5)}`
                          : ""}
                        {typeof session?.ut_number === "number"
                          ? ` · UT${String(session.ut_number).padStart(2, "0")}`
                          : ""}
                      </p>
                      <p className="text-sm font-semibold text-slate-900">
                        {session?.title || "Treino"}
                      </p>
                      {session?.focus ? (
                        <p className="mt-0.5 text-xs text-slate-500">
                          {session.focus}
                        </p>
                      ) : null}
                      {row.justification ? (
                        <p className="mt-1 text-xs text-slate-500 italic">
                          {row.justification}
                        </p>
                      ) : null}
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold flex-shrink-0 ${sc.color}`}
                    >
                      {sc.label}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          {hasMore && (
            <div className="mt-4 flex justify-center">
              <Button
                type="button"
                variant="outline"
                onClick={() => void load(items.length, true)}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <>
                    <Loader2 size={14} className="mr-1.5 animate-spin" />
                    A carregar...
                  </>
                ) : (
                  "Carregar mais"
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
