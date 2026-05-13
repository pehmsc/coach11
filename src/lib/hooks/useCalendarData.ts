"use client";

import { useState, useEffect, useCallback } from "react";
import { format, startOfWeek, addDays, addWeeks, subWeeks } from "date-fns";
import { normalizeTimeValue } from "@/lib/events/time";
import { formatFixtureOpponentLabel } from "@/lib/games/display";
import type { GameCompetitionOption } from "@/components/games/game-form-fields";
import { type CalEvent, compareEventsByDateTime } from "@/components/calendar/types";

export function useCalendarData() {
  const [weekStart, setWeekStart] = useState(
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  );
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [ageGroupId, setAgeGroupId] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [ageGroupName, setAgeGroupName] = useState("");
  const [canDeleteEvents, setCanDeleteEvents] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [competitionOptions, setCompetitionOptions] = useState<GameCompetitionOption[]>([]);

  const loadEvents = useCallback(async () => {
    if (!ageGroupId) return;
    const from = format(weekStart, "yyyy-MM-dd");
    const to = format(addDays(weekStart, 6), "yyyy-MM-dd");

    setLoadError(null);
    try {
      const res = await fetch(
        `/api/calendar/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&ageGroupId=${encodeURIComponent(ageGroupId)}`,
      );
      const payload = (await res.json().catch(() => null)) as
        | {
            success?: boolean;
            ageGroupName?: string;
            teamId?: string | null;
            canDeleteEvents?: boolean;
            sessions?: Array<Record<string, unknown>>;
            games?: Array<Record<string, unknown>>;
            error?: string;
          }
        | null;

      if (!res.ok || !payload?.success) {
        setEvents([]);
        setLoadError(payload?.error || "Erro ao carregar calendário.");
        return;
      }

      if (typeof payload.ageGroupName === "string" && payload.ageGroupName.trim()) {
        setAgeGroupName(payload.ageGroupName);
      }
      if (typeof payload.teamId === "string") {
        setTeamId(payload.teamId);
      }
      if (typeof payload.canDeleteEvents === "boolean") {
        setCanDeleteEvents(payload.canDeleteEvents);
      }

      const sessions = payload.sessions || [];
      const games = payload.games || [];

      const sessionEvents: CalEvent[] = (sessions || []).map((s) => ({
        id: String(s.id),
        type: "training" as const,
        date: String(s.session_date || ""),
        title: typeof s.title === "string" ? s.title : "Treino",
        start_time:
          typeof s.start_time === "string"
            ? normalizeTimeValue(s.start_time) || undefined
            : undefined,
        end_time:
          typeof s.end_time === "string"
            ? normalizeTimeValue(s.end_time) || undefined
            : undefined,
        notes: typeof s.notes === "string" ? s.notes : undefined,
        status: typeof s.status === "string" ? s.status : undefined,
        location: typeof s.location === "string" ? s.location : undefined,
        formatted_address:
          typeof s.formatted_address === "string" ? s.formatted_address : undefined,
        latitude: typeof s.latitude === "number" ? s.latitude : null,
        longitude: typeof s.longitude === "number" ? s.longitude : null,
        osm_place_id:
          typeof s.osm_place_id === "string" ? s.osm_place_id : undefined,
        location_source:
          s.location_source === "google" ||
          s.location_source === "osm" ||
          s.location_source === "manual"
            ? s.location_source
            : undefined,
        image_url: typeof s.image_url === "string" ? s.image_url : undefined,
      }));

      const gameEvents: CalEvent[] = (games || []).map((g) => ({
        id: String(g.id),
        type: "game" as const,
        date:
          typeof g.game_datetime === "string" ? g.game_datetime.split("T")[0] : "",
        title:
          typeof g.title === "string" && g.title.trim().length > 0
            ? g.title
            : typeof g.opponent_name === "string" ||
                typeof g.opponent_short_name === "string"
              ? formatFixtureOpponentLabel({
                  isHome: typeof g.is_home === "boolean" ? g.is_home : true,
                  opponentName:
                    typeof g.opponent_name === "string" ? g.opponent_name : undefined,
                  opponentShortName:
                    typeof g.opponent_short_name === "string"
                      ? g.opponent_short_name
                      : undefined,
                })
              : "Jogo",
        start_time:
          typeof g.game_datetime === "string"
            ? g.game_datetime.split("T")[1]?.substring(0, 5)
            : undefined,
        end_time:
          typeof g.end_time === "string"
            ? normalizeTimeValue(g.end_time) || undefined
            : undefined,
        opponent_id:
          typeof g.opponent_id === "string" ? g.opponent_id : undefined,
        opponent_name:
          typeof g.opponent_name === "string" ? g.opponent_name : undefined,
        opponent_short_name:
          typeof g.opponent_short_name === "string"
            ? g.opponent_short_name
            : undefined,
        competition_id:
          typeof g.competition_id === "string" ? g.competition_id : undefined,
        location: typeof g.location === "string" ? g.location : undefined,
        formatted_address:
          typeof g.formatted_address === "string" ? g.formatted_address : undefined,
        latitude: typeof g.latitude === "number" ? g.latitude : null,
        longitude: typeof g.longitude === "number" ? g.longitude : null,
        osm_place_id:
          typeof g.osm_place_id === "string" ? g.osm_place_id : undefined,
        location_source:
          g.location_source === "google" ||
          g.location_source === "osm" ||
          g.location_source === "manual"
            ? g.location_source
            : undefined,
        is_home: typeof g.is_home === "boolean" ? g.is_home : undefined,
        status: typeof g.status === "string" ? g.status : undefined,
        image_url: typeof g.image_url === "string" ? g.image_url : undefined,
        notes: typeof g.notes === "string" ? g.notes : undefined,
      }));

      setEvents([...sessionEvents, ...gameEvents].sort(compareEventsByDateTime));
    } catch {
      setEvents([]);
      setLoadError("Erro de ligação ao carregar calendário.");
    }
  }, [ageGroupId, weekStart]);

  useEffect(() => {
    async function loadTeam() {
      setLoadError(null);
      const [contextRes, competitionsRes] = await Promise.all([
        fetch("/api/me/context"),
        fetch("/api/competitions"),
      ]);
      const payload = (await contextRes.json().catch(() => null)) as
        | {
            ageGroup?: { id?: string; club_name?: string; name?: string } | null;
            teamId?: string | null;
            error?: string;
          }
        | null;
      const competitionsPayload = (await competitionsRes.json().catch(() => null)) as
        | {
            success?: boolean;
            competitions?: Array<{
              id?: string;
              name?: string;
              season?: string | null;
              team_label?: string | null;
              is_active?: boolean;
            }>;
          }
        | null;

      if (!contextRes.ok) {
        setLoadError(payload?.error || "Erro ao carregar contexto do calendário.");
        setLoading(false);
        return;
      }

      const resolvedAgeGroupId = payload?.ageGroup?.id ?? null;
      const resolvedAgeGroupName =
        payload?.ageGroup?.club_name && payload?.ageGroup?.name
          ? `${payload.ageGroup.club_name} · ${payload.ageGroup.name}`
          : "";

      setAgeGroupId(resolvedAgeGroupId);
      setAgeGroupName(resolvedAgeGroupName);
      setTeamId(payload?.teamId ?? null);

      const options = (competitionsPayload?.competitions || [])
        .filter((competition) => !!competition.id)
        .map((competition) => ({
          id: competition.id as string,
          name: competition.name || "Competição",
          season: competition.season || null,
          team_label: competition.team_label || null,
          inactive: competition.is_active === false,
        }));
      setCompetitionOptions(options);
      setLoading(false);
    }

    void loadTeam();
  }, []);

  // Efeito de bootstrap/sincronização de dados com o backend.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch, setState is in the callback
    if (ageGroupId) void loadEvents();
  }, [ageGroupId, weekStart, loadEvents]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const goToPreviousWeek = useCallback(
    () => setWeekStart((w) => subWeeks(w, 1)),
    [],
  );
  const goToNextWeek = useCallback(
    () => setWeekStart((w) => addWeeks(w, 1)),
    [],
  );
  const goToCurrentWeek = useCallback(
    () => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 })),
    [],
  );

  return {
    weekStart,
    events,
    setEvents,
    loading,
    ageGroupId,
    teamId,
    setTeamId,
    ageGroupName,
    canDeleteEvents,
    loadError,
    competitionOptions,
    loadEvents,
    days,
    goToPreviousWeek,
    goToNextWeek,
    goToCurrentWeek,
  };
}
