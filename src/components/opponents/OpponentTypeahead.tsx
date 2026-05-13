"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { Loader2, Plus, Search, X, ExternalLink } from "lucide-react";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { OpponentCreateModal } from "@/components/opponents/OpponentCreateModal";

export type OpponentSelectionValue = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  tactical_formation: string | null;
  games_count?: number;
  last_game_at?: string | null;
};

interface OpponentTypeaheadProps {
  ageGroupId: string;
  footballFormat: string | null | undefined;
  value: OpponentSelectionValue | null;
  onChange: (value: OpponentSelectionValue | null) => void;
  disabled?: boolean;
  initialLegacyName?: string | null;
  compact?: boolean;
}

function initialsFor(name: string, shortName?: string | null): string {
  if (shortName?.trim()) return shortName.trim().slice(0, 2).toUpperCase();
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function metaLine(value: OpponentSelectionValue): string {
  const segments: string[] = [];
  if (value.tactical_formation) segments.push(value.tactical_formation);
  if (typeof value.games_count === "number") {
    segments.push(
      value.games_count === 0
        ? "Sem jogos prévios"
        : value.games_count === 1
          ? "1 jogo prévio"
          : `${value.games_count} jogos prévios`,
    );
  }
  return segments.join(" · ");
}

function itemMetaLine(opponent: OpponentSelectionValue): string {
  if (!opponent.games_count) return "Sem jogos prévios";
  const last = opponent.last_game_at
    ? format(parseISO(opponent.last_game_at), "d MMM yyyy", { locale: pt })
    : null;
  const games = opponent.games_count === 1 ? "1 jogo" : `${opponent.games_count} jogos`;
  return last ? `${games} · último: ${last}` : games;
}

export function OpponentTypeahead({
  ageGroupId,
  footballFormat,
  value,
  onChange,
  disabled = false,
  initialLegacyName = null,
  compact = false,
}: OpponentTypeaheadProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const [opponents, setOpponents] = useState<OpponentSelectionValue[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const showLegacyHint = !value && !!initialLegacyName && !open;

  const fetchOpponents = useCallback(
    async (q: string) => {
      setLoading(true);
      try {
        const url = new URL(
          `/api/age-groups/${ageGroupId}/opponents/typeahead`,
          window.location.origin,
        );
        if (q) url.searchParams.set("q", q);
        const res = await fetch(url.toString(), { cache: "no-store" });
        const payload = await res.json().catch(() => null);
        if (!res.ok || !payload?.success) {
          setOpponents([]);
          return;
        }
        setOpponents((payload.opponents ?? []) as OpponentSelectionValue[]);
        setHighlightIndex(0);
      } catch {
        setOpponents([]);
      } finally {
        setLoading(false);
      }
    },
    [ageGroupId],
  );

  useEffect(() => {
    if (!open) return;
    void fetchOpponents(debouncedQuery);
  }, [open, debouncedQuery, fetchOpponents]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (open && !value && initialLegacyName) {
      setQuery(initialLegacyName);
    }
  }, [open, value, initialLegacyName]);

  function handleSelect(opponent: OpponentSelectionValue) {
    onChange(opponent);
    setOpen(false);
    setQuery("");
  }

  function handleClear() {
    onChange(null);
    setQuery("");
    setOpen(false);
    inputRef.current?.focus();
  }

  function handleOpenCreate() {
    setOpen(false);
    setCreateOpen(true);
  }

  const totalOptions = opponents.length + 1; // +1 for "Criar" item

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => (i + 1) % totalOptions);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => (i - 1 + totalOptions) % totalOptions);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIndex === opponents.length) {
        handleOpenCreate();
      } else if (opponents[highlightIndex]) {
        handleSelect(opponents[highlightIndex]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const sizeClass = compact ? "h-8 text-sm" : "text-sm";
  const trimmedQuery = query.trim();

  const placeholder = useMemo(() => {
    if (initialLegacyName) return initialLegacyName;
    return "Procurar ou criar adversário…";
  }, [initialLegacyName]);

  return (
    <div className="space-y-1" ref={containerRef}>
      {value ? (
        <div
          className={`flex items-center gap-2 rounded-lg border-2 border-emerald-200 bg-emerald-50/50 p-2 ${
            disabled ? "opacity-60" : ""
          }`}
        >
          <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-md bg-slate-100">
            {value.logo_url ? (
              <Image
                src={value.logo_url}
                alt=""
                width={36}
                height={36}
                className="h-9 w-9 object-cover"
                unoptimized
              />
            ) : (
              <div
                className="flex h-9 w-9 items-center justify-center text-xs font-bold text-white"
                style={{
                  background:
                    "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                }}
              >
                {initialsFor(value.name, value.short_name)}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">
              {value.name}
            </p>
            {metaLine(value) && (
              <p className="truncate text-xs text-slate-500">{metaLine(value)}</p>
            )}
          </div>
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled}
            aria-label="Limpar adversário"
            className="flex-shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            placeholder={placeholder}
            disabled={disabled}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onKeyDown={handleKeyDown}
            className={`w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 ${sizeClass} focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60`}
          />
        </div>
      )}

      {showLegacyHint && (
        <p className="text-[11px] text-amber-700">
          ℹ Adversário em texto livre — selecciona um da lista ou cria novo
          para vincular.
        </p>
      )}

      {value && (
        <Link
          href={`/teams/${ageGroupId}/opponents/${value.id}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Ver notas de ${value.name} em nova tab`}
          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
        >
          Ver notas do adversário <ExternalLink size={11} />
        </Link>
      )}

      {open && !value && (
        <div className="relative">
          <div className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
            {loading && opponents.length === 0 ? (
              <div className="flex items-center justify-center gap-2 p-4 text-xs text-slate-500">
                <Loader2 size={12} className="animate-spin" /> A procurar…
              </div>
            ) : null}

            {opponents.map((opponent, idx) => (
              <button
                key={opponent.id}
                type="button"
                onClick={() => handleSelect(opponent)}
                onMouseEnter={() => setHighlightIndex(idx)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left ${
                  highlightIndex === idx ? "bg-slate-50" : ""
                }`}
              >
                <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-md bg-slate-100">
                  {opponent.logo_url ? (
                    <Image
                      src={opponent.logo_url}
                      alt=""
                      width={32}
                      height={32}
                      className="h-8 w-8 object-cover"
                      unoptimized
                    />
                  ) : (
                    <div
                      className="flex h-8 w-8 items-center justify-center text-[10px] font-bold text-white"
                      style={{
                        background:
                          "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                      }}
                    >
                      {initialsFor(opponent.name, opponent.short_name)}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {opponent.name}
                  </p>
                  <p className="truncate text-[11px] text-slate-500">
                    {itemMetaLine(opponent)}
                  </p>
                </div>
              </button>
            ))}

            <button
              type="button"
              onClick={handleOpenCreate}
              onMouseEnter={() => setHighlightIndex(opponents.length)}
              className={`flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-left text-emerald-700 ${
                highlightIndex === opponents.length ? "bg-emerald-50" : ""
              }`}
            >
              <Plus size={14} />
              <span className="text-sm font-semibold">
                {trimmedQuery
                  ? `Criar “${trimmedQuery}” como novo adversário`
                  : "Criar novo adversário"}
              </span>
            </button>
          </div>
        </div>
      )}

      <OpponentCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(created) => {
          setCreateOpen(false);
          onChange(created);
          setQuery("");
        }}
        ageGroupId={ageGroupId}
        footballFormat={footballFormat ?? null}
        defaultName={trimmedQuery}
      />
    </div>
  );
}
