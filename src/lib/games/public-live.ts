import type { SupabaseClient } from "@supabase/supabase-js";
import {
  GAME_EVENT_SELECT_COLUMNS,
  normalizeStoredGameEventRowsForClient,
  type StoredGameEventParticipantFields,
} from "./live-event-participants";

export type PublicGameLivePhase =
  | "pre_match"
  | "first_half"
  | "halftime"
  | "second_half"
  | "review"
  | "completed";

export type PublicGameLiveCheckpoint = {
  phase: PublicGameLivePhase;
  baseSeconds: number;
  runningSinceMs: number | null;
  savedAt: number;
};

export type PublicGameLiveEvent = {
  id: string;
  minute: number;
  eventType:
    | "goal"
    | "penalty_goal"
    | "own_goal"
    | "yellow_card"
    | "red_card"
    | "substitution_out";
  isOpponentEvent: boolean;
  playerLabel: string | null;
  relatedPlayerLabel: string | null;
  createdAt: string | null;
};

export type PublicGameLiveSnapshot = {
  status: string | null;
  scoreHome: number;
  scoreAway: number;
  checkpoint: PublicGameLiveCheckpoint | null;
  events: PublicGameLiveEvent[];
};

type PublicGameLiveSource = {
  id: string;
  is_home: boolean;
  status: string | null;
  score_home: number | null;
  score_away: number | null;
};

type GameEventRow = {
  id: string;
  event_type: string | null;
  player_id: string | null;
  related_player_id: string | null;
  external_player_convocation_id?: string | null;
  external_related_player_convocation_id?: string | null;
  minute: number | null;
  is_opponent_event: boolean | null;
  created_at: string | null;
};

type CheckpointRow = {
  phase: string | null;
  base_seconds: number | null;
  running_since_ms: number | null;
  updated_at: string | null;
};

const UUID_LIKE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuidLike(value: string) {
  return UUID_LIKE_PATTERN.test(value);
}

function normalizePhase(value: string | null | undefined): PublicGameLivePhase | null {
  if (
    value === "pre_match" ||
    value === "first_half" ||
    value === "halftime" ||
    value === "second_half" ||
    value === "review" ||
    value === "completed"
  ) {
    return value;
  }

  return null;
}

function isMissingRelationError(
  message: string | null | undefined,
  relationName: string,
) {
  if (!message) return false;

  return (
    message.includes(relationName) &&
    (message.includes("does not exist") || message.includes("relation"))
  );
}

function isPublicGameEventType(
  value: string | null | undefined,
): value is PublicGameLiveEvent["eventType"] | "substitution_in" {
  return (
    value === "goal" ||
    value === "penalty_goal" ||
    value === "own_goal" ||
    value === "yellow_card" ||
    value === "red_card" ||
    value === "substitution_out" ||
    value === "substitution_in"
  );
}

function normalizePublicGameEventType(
  value: PublicGameLiveEvent["eventType"] | "substitution_in",
): PublicGameLiveEvent["eventType"] {
  return value === "substitution_in" ? "substitution_out" : value;
}

export function filterPublicLiveEvents(rows: GameEventRow[]): PublicGameLiveEvent[] {
  const eligibleRows = normalizeStoredGameEventRowsForClient(
    rows as Array<GameEventRow & StoredGameEventParticipantFields>,
  )
    .filter(
      (row) =>
        typeof row.id === "string" &&
        isPublicGameEventType(row.event_type) &&
        typeof row.minute === "number" &&
        Number.isFinite(row.minute),
    )
    .sort((a, b) => {
      const minuteDiff = (a.minute ?? 0) - (b.minute ?? 0);
      if (minuteDiff !== 0) return minuteDiff;

      return (a.created_at || "").localeCompare(b.created_at || "");
    });

  return eligibleRows
    .filter((event) => {
      if (event.event_type !== "substitution_in") return true;

      return !eligibleRows.some(
        (other) =>
          other.event_type === "substitution_out" &&
          other.minute === event.minute &&
          other.player_id === event.related_player_id &&
          other.related_player_id === event.player_id,
        );
    })
    .map((event) => {
      const eventType = event.event_type;
      if (!isPublicGameEventType(eventType)) {
        return null;
      }

      return {
        id: event.id,
        minute: Math.max(1, Math.floor(event.minute ?? 1)),
        eventType: normalizePublicGameEventType(eventType),
        isOpponentEvent: event.is_opponent_event === true,
        playerLabel: typeof event.player_id === "string" ? event.player_id : null,
        relatedPlayerLabel:
          typeof event.related_player_id === "string"
            ? event.related_player_id
            : null,
        createdAt: event.created_at ?? null,
      };
    })
    .filter((event): event is PublicGameLiveEvent => event !== null);
}

export function computePublicLiveScore(params: {
  isHome: boolean;
  events: PublicGameLiveEvent[];
  fallbackScoreHome?: number | null;
  fallbackScoreAway?: number | null;
}) {
  const { isHome, events, fallbackScoreHome, fallbackScoreAway } = params;
  const scoringEvents = events.filter(
    (event) =>
      event.eventType === "goal" ||
      event.eventType === "penalty_goal" ||
      event.eventType === "own_goal",
  );

  if (
    scoringEvents.length === 0 &&
    typeof fallbackScoreHome === "number" &&
    typeof fallbackScoreAway === "number"
  ) {
    return {
      scoreHome: Math.max(0, Math.floor(fallbackScoreHome)),
      scoreAway: Math.max(0, Math.floor(fallbackScoreAway)),
    };
  }

  let scoreHome = 0;
  let scoreAway = 0;

  const incrementScore = (isOurTeamGoal: boolean) => {
    if (isHome) {
      if (isOurTeamGoal) scoreHome += 1;
      else scoreAway += 1;
      return;
    }

    if (isOurTeamGoal) scoreAway += 1;
    else scoreHome += 1;
  };

  scoringEvents.forEach((event) => {
    if (event.eventType === "own_goal") {
      incrementScore(event.isOpponentEvent);
      return;
    }

    incrementScore(!event.isOpponentEvent);
  });

  return { scoreHome, scoreAway };
}

export function hasPublicGameLiveData(snapshot: PublicGameLiveSnapshot) {
  return (
    snapshot.status === "live" ||
    snapshot.checkpoint !== null ||
    snapshot.events.length > 0
  );
}

function formatPlayerLabel(name: string | null | undefined, jerseyNumber?: number | null) {
  const normalizedName = typeof name === "string" ? name.trim() : "";
  if (!normalizedName) return null;

  if (typeof jerseyNumber === "number") {
    return `#${jerseyNumber} ${normalizedName}`;
  }

  return normalizedName;
}

export async function getPublicGameLiveSnapshot(
  db: SupabaseClient,
  game: PublicGameLiveSource,
): Promise<PublicGameLiveSnapshot> {
  // Public live is restricted to score/time/event data.
  // Internal review fields such as coach_rating, summary notes, and MVP stay in
  // the authenticated summary/live flows and are intentionally excluded here.
  const [{ data: checkpointRow, error: checkpointError }, { data: eventRows, error: eventError }] =
    await Promise.all([
      db
        .from("game_live_checkpoints")
        .select("phase, base_seconds, running_since_ms, updated_at")
        .eq("game_id", game.id)
        .maybeSingle(),
      db
        .from("game_events")
        .select(GAME_EVENT_SELECT_COLUMNS)
        .eq("game_id", game.id)
        .order("minute", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

  if (checkpointError && !isMissingRelationError(checkpointError.message, "game_live_checkpoints")) {
    throw new Error(`public_live_checkpoint_failed:${checkpointError.message}`);
  }

  if (eventError) {
    throw new Error(`public_live_events_failed:${eventError.message}`);
  }

  const filteredEvents = filterPublicLiveEvents((eventRows || []) as GameEventRow[]);
  const internalPlayerIds = new Set<string>();
  const externalPlayerIds = new Set<string>();

  filteredEvents.forEach((event) => {
    [event.playerLabel, event.relatedPlayerLabel].forEach((value) => {
      if (!value) return;
      if (value.startsWith("external:")) {
        const externalId = value.replace(/^external:/, "").trim();
        if (externalId) externalPlayerIds.add(externalId);
        return;
      }
      if (isUuidLike(value)) {
        internalPlayerIds.add(value);
      }
    });
  });

  const playerLabels = new Map<string, string>();

  if (internalPlayerIds.size > 0) {
    const { data: players, error: playersError } = await db
      .from("players")
      .select("id, first_name, last_name, jersey_number")
      .in("id", Array.from(internalPlayerIds));

    if (playersError) {
      throw new Error(`public_live_players_failed:${playersError.message}`);
    }

    (players || []).forEach((player) => {
      const fullName = [player.first_name, player.last_name]
        .filter((part) => typeof part === "string" && part.trim().length > 0)
        .join(" ");
      const label = formatPlayerLabel(fullName || "Jogador", player.jersey_number);
      if (label) {
        playerLabels.set(player.id, label);
      }
    });
  }

  if (externalPlayerIds.size > 0) {
    const { data: externalPlayers, error: externalPlayersError } = await db
      .from("external_player_convocations")
      .select("id, name, jersey_number")
      .in("id", Array.from(externalPlayerIds));

    if (
      externalPlayersError &&
      !isMissingRelationError(
        externalPlayersError.message,
        "external_player_convocations",
      )
    ) {
      throw new Error(
        `public_live_external_players_failed:${externalPlayersError.message}`,
      );
    }

    (externalPlayers || []).forEach((player) => {
      const label = formatPlayerLabel(player.name || "Jogador", player.jersey_number);
      if (label) {
        playerLabels.set(`external:${player.id}`, label);
      }
    });
  }

  const publicEvents = filteredEvents.map((event) => ({
    ...event,
    playerLabel:
      event.playerLabel && playerLabels.has(event.playerLabel)
        ? playerLabels.get(event.playerLabel) ?? null
        : null,
    relatedPlayerLabel:
      event.relatedPlayerLabel && playerLabels.has(event.relatedPlayerLabel)
        ? playerLabels.get(event.relatedPlayerLabel) ?? null
        : null,
  }));

  const score = computePublicLiveScore({
    isHome: game.is_home,
    events: publicEvents,
    fallbackScoreHome: game.score_home,
    fallbackScoreAway: game.score_away,
  });

  const checkpoint = checkpointRow
    ? {
        phase: normalizePhase((checkpointRow as CheckpointRow).phase) ?? "pre_match",
        baseSeconds: Math.max(
          0,
          Math.floor((checkpointRow as CheckpointRow).base_seconds ?? 0),
        ),
        runningSinceMs:
          typeof (checkpointRow as CheckpointRow).running_since_ms === "number"
            ? (checkpointRow as CheckpointRow).running_since_ms
            : null,
        savedAt:
          typeof (checkpointRow as CheckpointRow).updated_at === "string"
            ? new Date((checkpointRow as CheckpointRow).updated_at as string).getTime()
            : Date.now(),
      }
    : null;

  return {
    status: game.status ?? null,
    scoreHome: score.scoreHome,
    scoreAway: score.scoreAway,
    checkpoint,
    events: publicEvents,
  };
}
