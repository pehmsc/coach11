"use client";

import { X } from "lucide-react";
import type { GameEvent } from "@/types/database";
import type { LivePlayer } from "./types";
import { EVENT_LABELS } from "./types";
import { formatCardEventLabel } from "@/lib/games/format-card-event-label";

const CARD_EVENT_TYPES = new Set(["yellow_card", "red_card"]);

function labelForEvent(
  event: GameEvent,
  allEvents: ReadonlyArray<GameEvent>,
): string {
  if (CARD_EVENT_TYPES.has(event.event_type)) {
    const baseLabel = formatCardEventLabel(event, allEvents);
    return event.event_type === "yellow_card"
      ? `🟨 ${baseLabel}`
      : `🟥 ${baseLabel}`;
  }
  return EVENT_LABELS[event.event_type] || event.event_type;
}

interface EventsLogProps {
  displayEvents: GameEvent[];
  convocatedPlayers: LivePlayer[];
  isFinalized: boolean;
  deleteEvent: (eventId: string) => void;
}

export function EventsLog({
  displayEvents,
  convocatedPlayers,
  isFinalized,
  deleteEvent,
}: EventsLogProps) {
  if (displayEvents.length === 0) return null;

  return (
    <div className="mb-5">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
        Eventos
      </h3>
      <div className="space-y-1">
        {displayEvents.map((ev) => {
          const pl = convocatedPlayers.find((p) => p.id === ev.player_id);
          const assist = convocatedPlayers.find((p) => p.id === ev.related_player_id);
          return (
            <div
              key={ev.id}
              className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100"
            >
              <span className="text-xs text-slate-400 w-8 text-right flex-shrink-0">
                {ev.minute}&apos;
              </span>
              <span className="text-sm flex-1">
                {labelForEvent(ev, displayEvents)}
                {ev.event_type === "substitution_out" || ev.event_type === "substitution_in"
                  ? ev.is_opponent_event
                    ? " — Adversário"
                    : ev.event_type === "substitution_out"
                      ? assist && pl
                        ? ` — ${assist.first_name} ${assist.last_name} ➜ ${pl.first_name} ${pl.last_name}`
                        : pl
                          ? ` ➜ ${pl.first_name} ${pl.last_name}`
                          : ""
                      : pl && assist
                        ? ` — ${pl.first_name} ${pl.last_name} ➜ ${assist.first_name} ${assist.last_name}`
                        : pl
                          ? ` — ${pl.first_name} ${pl.last_name}`
                          : ""
                  : ev.is_opponent_event
                    ? pl
                      ? ` — Adversário (sofreu: ${pl.first_name} ${pl.last_name})`
                      : " — Adversário"
                    : pl
                      ? ` — ${pl.first_name} ${pl.last_name}`
                      : ""}
                {assist && ev.event_type === "goal" ? ` (🅰️ ${assist.first_name} ${assist.last_name})` : ""}
              </span>
              {!isFinalized && (
                <button
                  onClick={() => void deleteEvent(ev.id)}
                  className="p-1 hover:bg-red-50 rounded-lg transition-colors group"
                >
                  <X size={14} className="text-slate-300 group-hover:text-red-500" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
