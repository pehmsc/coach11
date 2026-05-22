"use client";

import { useCallback, useEffect, useMemo, useState, use } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import {
  AlertTriangle,
  ClipboardList,
  Loader2,
  Trash2,
  History,
  StickyNote,
  Info as InfoIcon,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getFormationsForFormat } from "@/lib/formations";
import {
  getGameResult,
  getOpponentScore,
  getOurScore,
} from "@/lib/games/score-helpers";
import { StickyBackLink } from "@/components/navigation/StickyBackLink";
import { Breadcrumb } from "@/components/navigation/Breadcrumb";
import { getReturnTo } from "@/hooks/useReturnTo";
import { OpponentLogoUploader } from "@/components/opponents/OpponentLogoUploader";
import { OpponentObservationsTab } from "@/components/games/observations/OpponentObservationsTab";
import {
  useOpponentAutosave,
  type SaveStatus,
} from "@/components/opponents/useOpponentAutosave";
import type { FootballFormat, Opponent } from "@/types/database";
import { opponentUpdateSchema } from "@/lib/validations/opponent";

type DetailTab = "notas" | "observacoes" | "historico" | "info";

type GameRow = {
  id: string;
  game_datetime: string | null;
  is_home: boolean | null;
  score_home: number | null;
  score_away: number | null;
  competition_id: string | null;
  title: string | null;
  status: string | null;
  competitions: { id: string; name: string | null } | null;
};

type GamesPayload = {
  success?: boolean;
  stats?: {
    wins: number;
    draws: number;
    losses: number;
    goals_for: number;
    goals_against: number;
  };
  games?: GameRow[];
  error?: string;
};

type AgeGroupRef = {
  id: string;
  name: string;
  football_format: FootballFormat;
};

function initialsFor(name: string, shortName?: string | null): string {
  if (shortName?.trim()) return shortName.trim().slice(0, 2).toUpperCase();
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function SaveIndicator({ status, error }: { status: SaveStatus; error: string | null }) {
  if (status === "saving") {
    return (
      <span className="ml-2 inline-flex items-center gap-1 text-xs text-slate-500">
        <Loader2 size={11} className="animate-spin" /> A guardar...
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="ml-2 text-xs text-emerald-600 transition-opacity">
        ✓ Guardado
      </span>
    );
  }
  if (status === "error") {
    return (
      <span
        className="ml-2 text-xs text-red-600"
        title={error ?? undefined}
      >
        ✗ Falha
      </span>
    );
  }
  return null;
}

export default function OpponentDetailPage({
  params,
}: {
  params: Promise<{ ageGroupId: string; opponentId: string }>;
}) {
  const { ageGroupId, opponentId } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [opponent, setOpponent] = useState<Opponent | null>(null);
  const [ageGroup, setAgeGroup] = useState<AgeGroupRef | null>(null);
  const [tab, setTab] = useState<DetailTab>("notas");
  const opponentsFallback = `/teams/${ageGroupId}/opponents`;
  const [returnHref] = useState(() =>
    getReturnTo("opponents", opponentsFallback),
  );
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteGameCount, setDeleteGameCount] = useState<number | null>(null);

  const [games, setGames] = useState<GameRow[]>([]);
  const [stats, setStats] = useState<GamesPayload["stats"] | null>(null);
  const [gamesLoading, setGamesLoading] = useState(false);

  const autosave = useOpponentAutosave({
    ageGroupId,
    opponentId,
    onSaved: (patch) => {
      setOpponent((prev) =>
        prev ? ({ ...prev, ...(patch as Partial<Opponent>) }) : prev,
      );
    },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [oppRes, agRes] = await Promise.all([
        fetch(`/api/age-groups/${ageGroupId}/opponents/${opponentId}`, {
          cache: "no-store",
        }),
        fetch(`/api/club/age-groups`, { cache: "no-store" }).catch(() => null),
      ]);
      const oppPayload = await oppRes.json().catch(() => null);
      if (!oppRes.ok || !oppPayload?.success) {
        toast.error(oppPayload?.error || "Erro ao carregar adversario.");
        router.replace(`/teams/${ageGroupId}`);
        return;
      }
      setOpponent(oppPayload.opponent);
      setNameDraft(oppPayload.opponent.name);

      // age_groups endpoint pode ou nao estar disponivel — fallback opcional
      if (agRes && agRes.ok) {
        const agJson = await agRes.json().catch(() => null);
        const found = (agJson?.ageGroups ?? agJson?.age_groups ?? []).find(
          (a: { id: string }) => a.id === ageGroupId,
        );
        if (found) {
          setAgeGroup({
            id: found.id,
            name: found.name,
            football_format: found.football_format,
          });
        }
      }
    } catch {
      toast.error("Erro de ligacao.");
    } finally {
      setLoading(false);
    }
  }, [ageGroupId, opponentId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadGames = useCallback(async () => {
    setGamesLoading(true);
    try {
      const res = await fetch(
        `/api/age-groups/${ageGroupId}/opponents/${opponentId}/games`,
        { cache: "no-store" },
      );
      const payload = (await res.json().catch(() => null)) as GamesPayload | null;
      if (!res.ok || !payload?.success) {
        toast.error(payload?.error || "Erro ao carregar jogos.");
        return;
      }
      setGames(payload.games ?? []);
      setStats(payload.stats ?? null);
    } catch {
      toast.error("Erro de ligacao.");
    } finally {
      setGamesLoading(false);
    }
  }, [ageGroupId, opponentId]);

  useEffect(() => {
    if (tab === "historico") void loadGames();
  }, [tab, loadGames]);

  const formations = useMemo(
    () => getFormationsForFormat(ageGroup?.football_format),
    [ageGroup?.football_format],
  );

  async function saveName() {
    if (!opponent) return;
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setNameError("Nome obrigatorio.");
      return;
    }
    if (trimmed === opponent.name) {
      setEditingName(false);
      setNameError(null);
      return;
    }
    setSavingName(true);
    setNameError(null);
    try {
      const res = await fetch(
        `/api/age-groups/${ageGroupId}/opponents/${opponentId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        },
      );
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) {
        setNameError(payload?.error || "Erro ao guardar nome.");
        return;
      }
      setOpponent(payload.opponent);
      setNameDraft(payload.opponent.name);
      setEditingName(false);
    } catch {
      setNameError("Erro de ligacao.");
    } finally {
      setSavingName(false);
    }
  }

  function patch(field: keyof Opponent, value: string | number | null) {
    if (!opponent) return;
    const next: Partial<Opponent> = { [field]: value };
    setOpponent({ ...opponent, ...next });
    // Validar inline com Zod (apenas o campo afectado)
    const candidate = { [field]: value };
    const result = opponentUpdateSchema.safeParse(candidate);
    if (!result.success) {
      return; // erro de validacao impede o PATCH; UI mostra inline em campos especificos
    }
    autosave.schedule({ [field]: value } as Record<string, unknown>);
  }

  async function openDelete() {
    setShowDelete(true);
    setDeleteGameCount(null);
    try {
      const res = await fetch(
        `/api/age-groups/${ageGroupId}/opponents/${opponentId}/games`,
        { cache: "no-store" },
      );
      const payload = (await res.json().catch(() => null)) as GamesPayload | null;
      if (res.ok && payload?.games) {
        setDeleteGameCount(payload.games.length);
      } else {
        setDeleteGameCount(0);
      }
    } catch {
      setDeleteGameCount(0);
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/age-groups/${ageGroupId}/opponents/${opponentId}`,
        { method: "DELETE" },
      );
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) {
        toast.error(payload?.error || "Erro ao apagar adversario.");
        return;
      }
      const affected = payload.games_affected ?? 0;
      toast.success(
        affected > 0
          ? `Adversario apagado. ${affected} jogo(s) mantem o nome mas perdem a ligacao.`
          : "Adversario apagado.",
      );
      router.replace(`/teams/${ageGroupId}/opponents`);
    } catch {
      toast.error("Erro de ligacao.");
    } finally {
      setDeleting(false);
      setShowDelete(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500">
        <Loader2 size={20} className="mr-2 animate-spin" />
        A carregar...
      </div>
    );
  }
  if (!opponent) return null;

  const initials = initialsFor(opponent.name, opponent.short_name);

  return (
    <div className="min-h-screen bg-slate-50">
      <StickyBackLink
        href={returnHref}
        label="Voltar aos adversários"
        sticky={false}
        wrapperClassName="bg-slate-50 px-4 py-2 max-w-5xl mx-auto"
      >
        <Breadcrumb
          items={[
            { label: "Equipas", href: "/teams" },
            {
              label: ageGroup?.name ?? "Escalão",
              href: `/teams/${ageGroupId}`,
            },
            {
              label: "Adversários",
              href: `/teams/${ageGroupId}/opponents`,
              shortLabel: "Adv.",
            },
            { label: opponent.name },
          ]}
        />
      </StickyBackLink>

      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 space-y-2">
          <div className="flex items-center gap-3">
            <OpponentLogoUploader
              ageGroupId={ageGroupId}
              opponentId={opponentId}
              currentLogoUrl={opponent.logo_url}
              fallbackInitials={initials}
              onUploaded={(logoUrl) =>
                setOpponent((prev) =>
                  prev ? { ...prev, logo_url: logoUrl } : prev,
                )
              }
            />

            <div className="flex-1 min-w-0">
              {editingName ? (
                <div className="flex items-center gap-2">
                  <Input
                    autoFocus
                    value={nameDraft}
                    onChange={(e) => {
                      setNameDraft(e.target.value);
                      setNameError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void saveName();
                      if (e.key === "Escape") {
                        setEditingName(false);
                        setNameDraft(opponent.name);
                        setNameError(null);
                      }
                    }}
                    onBlur={() => void saveName()}
                    disabled={savingName}
                    aria-invalid={!!nameError}
                    className="text-lg font-bold"
                  />
                  {savingName && (
                    <Loader2 size={14} className="animate-spin text-slate-400" />
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditingName(true);
                    setNameDraft(opponent.name);
                  }}
                  className="text-left"
                >
                  <h1 className="text-lg font-bold text-slate-900 leading-tight truncate hover:text-emerald-700">
                    {opponent.name}
                  </h1>
                </button>
              )}
              <p className="text-xs text-slate-500">
                {opponent.short_name ? `${opponent.short_name} · ` : ""}
                {ageGroup?.name ?? "Escalao"}
              </p>
              {nameError && (
                <p className="text-xs text-red-600 mt-0.5">{nameError}</p>
              )}
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={openDelete}
              title="Apagar adversario"
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 size={16} />
            </Button>
          </div>

          {/* Tabs internas */}
          <div className="flex gap-0 overflow-x-auto -mx-4 px-4">
            {([
              { id: "notas", label: "Notas", icon: StickyNote },
              { id: "observacoes", label: "Observações", icon: ClipboardList },
              {
                id: "historico",
                label: games.length > 0 ? `Historico (${games.length})` : "Historico",
                icon: History,
              },
              { id: "info", label: "Info", icon: InfoIcon },
            ] as const).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  tab === t.id
                    ? "border-emerald-600 text-emerald-700"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                <t.icon size={13} />
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-4">
        {tab === "notas" && (
          <NotasTab
            opponent={opponent}
            formations={formations}
            patch={patch}
            saveStatus={autosave.status}
            saveError={autosave.errorMessage}
          />
        )}
        {tab === "observacoes" && (
          <OpponentObservationsTab
            opponent={opponent}
            onPromoted={() => void load()}
          />
        )}
        {tab === "historico" && (
          <HistoricoTab
            games={games}
            stats={stats}
            loading={gamesLoading}
          />
        )}
        {tab === "info" && (
          <InfoTab
            opponent={opponent}
            patch={patch}
            saveStatus={autosave.status}
            saveError={autosave.errorMessage}
          />
        )}
      </div>

      {showDelete && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 md:items-center"
          onClick={() => {
            if (deleting) return;
            setShowDelete(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-2">
              <AlertTriangle
                size={20}
                className="mt-0.5 flex-shrink-0 text-red-600"
              />
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Apagar &ldquo;{opponent.name}&rdquo;?
                </h3>
                {deleteGameCount === null ? (
                  <p className="mt-1 text-xs text-slate-500">A verificar jogos ligados...</p>
                ) : deleteGameCount === 0 ? (
                  <p className="mt-1 text-xs text-slate-600">
                    Esta accao nao pode ser desfeita.
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-slate-700">
                    Este adversario tem <strong>{deleteGameCount}</strong>{" "}
                    jogo(s) ligado(s). Apagar ira{" "}
                    <strong>desligar os jogos</strong> — mantem o nome do
                    adversario como texto livre, mas perdem a ligacao ao perfil.
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowDelete(false)}
                disabled={deleting}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700"
                onClick={() => void confirmDelete()}
                disabled={deleting || deleteGameCount === null}
              >
                {deleting ? (
                  <>
                    <Loader2 size={14} className="mr-1.5 animate-spin" />
                    A apagar...
                  </>
                ) : (
                  "Apagar"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Notas ────────────────────────────────────────────────────────────────

function NotasTab({
  opponent,
  formations,
  patch,
  saveStatus,
  saveError,
}: {
  opponent: Opponent;
  formations: readonly string[];
  patch: (field: keyof Opponent, value: string | number | null) => void;
  saveStatus: SaveStatus;
  saveError: string | null;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div>
        <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
          Formacao tactica
          <SaveIndicator status={saveStatus} error={saveError} />
        </label>
        <Select
          value={opponent.tactical_formation ?? ""}
          onValueChange={(v) => patch("tactical_formation", v || null)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecionar formacao" />
          </SelectTrigger>
          <SelectContent>
            {formations.map((f) => (
              <SelectItem key={f} value={f}>
                {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
          Sigla curta
        </label>
        <Input
          maxLength={5}
          value={opponent.short_name ?? ""}
          onChange={(e) => patch("short_name", e.target.value)}
          placeholder="Ex: SLB"
        />
      </div>

      <div className="md:col-span-2">
        <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
          Pontos fortes
        </label>
        <textarea
          rows={3}
          value={opponent.pontos_fortes ?? ""}
          onChange={(e) => patch("pontos_fortes", e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder="Ex: rapidos no contra-ataque, fortes na bola parada..."
        />
      </div>

      <div className="md:col-span-2">
        <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
          Pontos fracos
        </label>
        <textarea
          rows={3}
          value={opponent.pontos_fracos ?? ""}
          onChange={(e) => patch("pontos_fracos", e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder="Ex: defesa central lenta, problemas nos cantos..."
        />
      </div>

      <div className="md:col-span-2">
        <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
          Atletas chave
        </label>
        <textarea
          rows={3}
          value={opponent.atletas_chave ?? ""}
          onChange={(e) => patch("atletas_chave", e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder="Ex: #10 finalizador, #7 alas..."
        />
      </div>

      <div className="md:col-span-2">
        <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
          Notas gerais
        </label>
        <textarea
          rows={3}
          value={opponent.notas_gerais ?? ""}
          onChange={(e) => patch("notas_gerais", e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder="Outras observacoes..."
        />
      </div>
    </div>
  );
}

// ─── Tab: Historico ────────────────────────────────────────────────────────────

function HistoricoTab({
  games,
  stats,
  loading,
}: {
  games: GameRow[];
  stats: GamesPayload["stats"] | null;
  loading: boolean;
}) {
  const router = useRouter();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-slate-500">
        <Loader2 size={20} className="animate-spin mr-2" />
        A carregar jogos...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {stats && (stats.wins + stats.draws + stats.losses > 0) && (
        <div className="rounded-xl border border-slate-100 bg-white p-3">
          <p className="text-sm font-semibold text-slate-900">
            <span className="text-emerald-600">{stats.wins} V</span>
            {" — "}
            <span className="text-slate-500">{stats.draws} E</span>
            {" — "}
            <span className="text-red-600">{stats.losses} D</span>
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            GM {stats.goals_for} · GS {stats.goals_against}
          </p>
        </div>
      )}

      {games.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
          <History size={28} className="mx-auto mb-2 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">
            Ainda nao jogaram contra este adversario.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {games.map((g) => {
            const dt = g.game_datetime ? parseISO(g.game_datetime) : null;
            const our = getOurScore(g);
            const opp = getOpponentScore(g);
            const score = our != null && opp != null ? `${our}–${opp}` : "—";
            const result = getGameResult(g);
            const resultBadge =
              result === "W"
                ? { label: "V", color: "bg-emerald-100 text-emerald-700" }
                : result === "L"
                  ? { label: "D", color: "bg-red-100 text-red-700" }
                  : result === "D"
                    ? { label: "E", color: "bg-slate-100 text-slate-600" }
                    : null;
            const competitionName = g.competitions?.name ?? null;
            return (
              <li
                key={g.id}
                onClick={() => router.push(`/games/${g.id}`)}
                className="cursor-pointer rounded-xl border border-slate-100 bg-white p-3 hover:border-slate-200 hover:shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400">
                      {dt ? format(dt, "d MMM yyyy", { locale: pt }) : "—"}
                      {competitionName ? ` · ${competitionName}` : ""}
                      {g.title ? ` · ${g.title}` : ""}
                    </p>
                    <p className="text-sm font-semibold text-slate-900">
                      {g.is_home ? "Casa" : "Fora"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-base font-bold text-slate-900">
                      {score}
                    </span>
                    {resultBadge && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${resultBadge.color}`}
                      >
                        {resultBadge.label}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <section className="rounded-xl border border-slate-100 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-1">
          Observacoes pos-jogo
        </h3>
        <p className="text-xs text-slate-500">
          Notas registadas durante jogos serao consolidadas aqui.
        </p>
        <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center">
          <MessageSquare size={20} className="mx-auto mb-1 text-slate-300" />
          <p className="text-xs font-semibold text-slate-700">Em breve</p>
          <p className="text-[11px] text-slate-500">
            Disponivel na Sprint 3 com o modulo de Ficha de Jogo.
          </p>
        </div>
      </section>
    </div>
  );
}

// ─── Tab: Info ─────────────────────────────────────────────────────────────────

function InfoTab({
  opponent,
  patch,
  saveStatus,
  saveError,
}: {
  opponent: Opponent;
  patch: (field: keyof Opponent, value: string | number | null) => void;
  saveStatus: SaveStatus;
  saveError: string | null;
}) {
  // Inicializa local state uma vez na montagem (Opponent ja carregado).
  // Inputs nao-controlados pelo prop apos isto — onBlur compara com prop.
  const [phoneLocal, setPhoneLocal] = useState(opponent.phone ?? "");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [latLocal, setLatLocal] = useState(
    opponent.home_ground_lat != null ? String(opponent.home_ground_lat) : "",
  );
  const [lngLocal, setLngLocal] = useState(
    opponent.home_ground_lng != null ? String(opponent.home_ground_lng) : "",
  );

  function handlePhoneBlur() {
    const trimmed = phoneLocal.trim();
    if (trimmed === "" && opponent.phone != null) {
      patch("phone", null);
      setPhoneError(null);
      return;
    }
    const regex = /^(\+351\s?)?[239]\d{2}\s?\d{3}\s?\d{3}$/;
    if (trimmed && !regex.test(trimmed)) {
      setPhoneError("Formato invalido (ex: +351 912 345 678).");
      return;
    }
    setPhoneError(null);
    if (trimmed !== (opponent.phone ?? "")) {
      patch("phone", trimmed || null);
    }
  }

  function handleLatLngBlur() {
    const lat = latLocal.trim() === "" ? null : Number(latLocal);
    const lng = lngLocal.trim() === "" ? null : Number(lngLocal);
    if (lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) {
      toast.error("Latitude invalida.");
      return;
    }
    if (lng !== null && (!Number.isFinite(lng) || lng < -180 || lng > 180)) {
      toast.error("Longitude invalida.");
      return;
    }
    if (lat !== (opponent.home_ground_lat ?? null)) {
      patch("home_ground_lat", lat);
    }
    if (lng !== (opponent.home_ground_lng ?? null)) {
      patch("home_ground_lng", lng);
    }
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div>
        <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
          Campo (nome)
          <SaveIndicator status={saveStatus} error={saveError} />
        </label>
        <Input
          value={opponent.home_ground ?? ""}
          onChange={(e) => patch("home_ground", e.target.value)}
          placeholder="Ex: Campo Municipal de Lourel"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
          Treinador
        </label>
        <Input
          value={opponent.coach_name ?? ""}
          onChange={(e) => patch("coach_name", e.target.value)}
          placeholder="Nome do treinador"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
          Telefone
        </label>
        <Input
          value={phoneLocal}
          onChange={(e) => setPhoneLocal(e.target.value)}
          onBlur={handlePhoneBlur}
          placeholder="+351 912 345 678"
          aria-invalid={!!phoneError}
        />
        {phoneError && (
          <p className="mt-1 text-xs text-red-600">{phoneError}</p>
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
          Outros contactos
        </label>
        <Input
          value={opponent.contact_info ?? ""}
          onChange={(e) => patch("contact_info", e.target.value)}
          placeholder="Email, redes sociais..."
        />
      </div>

      <div className="md:col-span-2">
        <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
          Morada do campo
        </label>
        <textarea
          rows={2}
          value={opponent.home_ground_address ?? ""}
          onChange={(e) => patch("home_ground_address", e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder="Rua, codigo postal, cidade"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
          Latitude
        </label>
        <Input
          type="number"
          step="0.000001"
          value={latLocal}
          onChange={(e) => setLatLocal(e.target.value)}
          onBlur={handleLatLngBlur}
          placeholder="Ex: 38.7223"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
          Longitude
        </label>
        <Input
          type="number"
          step="0.000001"
          value={lngLocal}
          onChange={(e) => setLngLocal(e.target.value)}
          onBlur={handleLatLngBlur}
          placeholder="Ex: -9.1393"
        />
      </div>

      <div className="md:col-span-2">
        <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
          Notas sobre formacao / academia
        </label>
        <textarea
          rows={3}
          value={opponent.youth_academy_notes ?? ""}
          onChange={(e) => patch("youth_academy_notes", e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder="Informacoes sobre formacao do adversario..."
        />
      </div>
    </div>
  );
}
