"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { AlertCircle, Loader2 } from "lucide-react";
import { StickyBackLink } from "@/components/navigation/StickyBackLink";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface TrainingRef {
  id: string;
  session_date: string;
  start_time?: string | null;
  end_time?: string | null;
  title?: string | null;
  status?: string | null;
  focus?: string | null;
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

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string }
> = {
  present: { label: "Presente", color: "bg-emerald-100 text-emerald-700" },
  late: { label: "Atrasado", color: "bg-amber-100 text-amber-700" },
  absent: { label: "Falta", color: "bg-red-100 text-red-700" },
  injured: { label: "Lesionado", color: "bg-orange-100 text-orange-700" },
};

function unwrapTraining(
  v: TrainingHistoryRow["training_sessions"],
): TrainingRef | null {
  if (!v) return null;
  if (Array.isArray(v)) return v[0] ?? null;
  return v;
}

export default function PlayerHistoryTrainingsPage() {
  const { id } = useParams<{ id: string }>();
  const [items, setItems] = useState<TrainingHistoryRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(offset: number, append: boolean) {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/players/${id}/trainings?limit=${PAGE_SIZE}&offset=${offset}`,
      );
      const payload = (await res.json().catch(() => null)) as ApiResponse | null;
      if (!res.ok || !payload?.items) {
        setError(payload?.error || "Erro ao carregar treinos.");
        return;
      }
      setItems((prev) =>
        append ? [...prev, ...payload.items!] : payload.items!,
      );
      setHasMore(Boolean(payload.hasMore));
    } catch {
      setError("Erro de ligação.");
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  }

  useEffect(() => {
    void load(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <StickyBackLink
        href={`/players/${id}`}
        label="Voltar ao perfil"
        wrapperClassName="-mx-4 mb-4 bg-slate-50/95 px-4 py-2 md:-mx-8 md:px-8"
      />

      <h1 className="mb-4 text-xl font-bold text-slate-900">
        Histórico de treinos
      </h1>

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
            Sem treinos registados nesta época.
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
                STATUS_CONFIG[row.status] ?? {
                  label: row.status,
                  color: "bg-slate-100 text-slate-700",
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
