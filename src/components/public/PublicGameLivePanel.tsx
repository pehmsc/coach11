"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowRightLeft, ShieldAlert, ShieldMinus, Target } from "lucide-react";
import { LiveScoreboardCard } from "@/components/games/live/LiveScoreboardCard";
import { useGameLiveController } from "@/lib/hooks/useGameLiveController";
import type { Game } from "@/types/database";
import type {
  PublicGameLiveEvent,
  PublicGameLivePhase,
  PublicGameLiveSnapshot,
} from "@/lib/games/public-live";
import { hasPublicGameLiveData } from "@/lib/games/public-live";

type PublicGameLivePanelProps = {
  apiPath: string;
  game: Pick<
    Game,
    "game_datetime" | "location" | "is_home" | "opponent_name" | "opponent_short_name"
  >;
  homeClubName: string | null;
  homeClubShortName: string | null;
  initialSnapshot: PublicGameLiveSnapshot;
  coverImageUrl?: string | null;
  coverImageAlt?: string | null;
};

function isRunningPhase(phase: PublicGameLivePhase | null | undefined) {
  return phase === "first_half" || phase === "second_half";
}

function formatClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function phaseLabel(phase: PublicGameLivePhase | null | undefined) {
  switch (phase) {
    case "first_half":
      return "1ª parte";
    case "halftime":
      return "Intervalo";
    case "second_half":
      return "2ª parte";
    case "review":
      return "Pós-jogo";
    case "completed":
      return "Final";
    default:
      return "Pré-jogo";
  }
}

function eventTone(eventType: PublicGameLiveEvent["eventType"]) {
  switch (eventType) {
    case "goal":
    case "penalty_goal":
    case "own_goal":
      return {
        chip: "bg-emerald-100 text-emerald-700",
        icon: <Target size={14} />,
      };
    case "yellow_card":
      return {
        chip: "bg-amber-100 text-amber-700",
        icon: <ShieldMinus size={14} />,
      };
    case "red_card":
      return {
        chip: "bg-red-100 text-red-700",
        icon: <ShieldAlert size={14} />,
      };
    default:
      return {
        chip: "bg-blue-100 text-blue-700",
        icon: <ArrowRightLeft size={14} />,
      };
  }
}

function eventLabel(event: PublicGameLiveEvent) {
  switch (event.eventType) {
    case "goal":
      return "Golo";
    case "penalty_goal":
      return "Golo (penálti)";
    case "own_goal":
      return "Autogolo";
    case "yellow_card":
      return "Cartão amarelo";
    case "red_card":
      return "Cartão vermelho";
    default:
      return "Substituição";
  }
}

function eventDescription(event: PublicGameLiveEvent) {
  if (event.isOpponentEvent) {
    if (event.eventType === "substitution_out" && event.relatedPlayerLabel) {
      return `Adversário · alteração em ${event.minute}'`;
    }

    return "Adversário";
  }

  if (event.eventType === "substitution_out") {
    if (event.playerLabel && event.relatedPlayerLabel) {
      return `${event.playerLabel} ↔ ${event.relatedPlayerLabel}`;
    }

    return event.playerLabel || event.relatedPlayerLabel || "Alteração";
  }

  return event.playerLabel || "Equipa";
}

export function PublicGameLivePanel({
  apiPath,
  game,
  homeClubName,
  homeClubShortName,
  initialSnapshot,
  coverImageUrl,
  coverImageAlt,
}: PublicGameLivePanelProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [now, setNow] = useState(() => new Date());
  const normalizedStatus =
    snapshot.status === "live" ||
    snapshot.status === "completed" ||
    snapshot.status === "cancelled"
      ? snapshot.status
      : "scheduled";
  const controller = useGameLiveController({
    game: {
      ...game,
      id: "",
      created_at: "",
      status: normalizedStatus,
      game_datetime: game.game_datetime,
      is_home: game.is_home,
      opponent_name: game.opponent_name,
      opponent_short_name: game.opponent_short_name,
      location: game.location,
    },
    now,
    homeClubName,
    homeClubShortName,
  });

  const hasLiveData = hasPublicGameLiveData(snapshot);
  const shouldPoll =
    hasLiveData ||
    (controller.gameStartAt
      ? now.getTime() >= controller.gameStartAt.getTime() - 10 * 60 * 1000 &&
        now.getTime() <= controller.gameStartAt.getTime() + 3 * 60 * 60 * 1000
      : false);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(new Date());
    }, shouldPoll ? 1000 : 30_000);

    return () => window.clearInterval(interval);
  }, [shouldPoll]);

  useEffect(() => {
    if (!shouldPoll) return;

    let cancelled = false;

    const refreshSnapshot = async () => {
      try {
        const res = await fetch(apiPath, { cache: "no-store" });
        if (!res.ok) return;

        const payload = (await res.json().catch(() => null)) as
          | { snapshot?: PublicGameLiveSnapshot }
          | null;
        if (!cancelled && payload?.snapshot) {
          setSnapshot(payload.snapshot);
        }
      } catch {
        // ignore transient polling failures in the public panel
      }
    };

    void refreshSnapshot();
    const interval = window.setInterval(() => {
      void refreshSnapshot();
    }, 20_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [apiPath, shouldPoll]);

  const clockSeconds = useMemo(() => {
    if (!snapshot.checkpoint) return 0;

    const extraSeconds =
      snapshot.checkpoint.runningSinceMs && isRunningPhase(snapshot.checkpoint.phase)
        ? Math.max(0, Math.floor((now.getTime() - snapshot.checkpoint.runningSinceMs) / 1000))
        : 0;

    return Math.max(0, snapshot.checkpoint.baseSeconds + extraSeconds);
  }, [now, snapshot.checkpoint]);

  const eventsContent = useMemo(() => {
    if (snapshot.events.length === 0) {
      return (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
          Ainda não existem eventos públicos registados para este jogo.
        </div>
      );
    }

    return snapshot.events.map((event) => {
      const tone = eventTone(event.eventType);
      return (
        <div
          key={event.id}
          className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"
        >
          <div className="w-10 flex-shrink-0 text-right text-sm font-semibold text-slate-400">
            {event.minute}&apos;
          </div>
          <div className={`inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${tone.chip}`}>
            {tone.icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">
              {eventLabel(event)}
            </p>
            <p className="truncate text-sm text-slate-500">
              {eventDescription(event)}
            </p>
          </div>
        </div>
      );
    });
  }, [snapshot.events]);

  const currentMinute = clockSeconds > 0 ? Math.floor(clockSeconds / 60) + 1 : 1;
  const currentPhaseLabel = snapshot.checkpoint
    ? phaseLabel(snapshot.checkpoint.phase)
    : snapshot.status === "completed"
      ? "Final"
      : snapshot.status === "live"
        ? "Ao vivo"
        : "Pré-jogo";
  const isLiveActive = snapshot.status === "live";

  if (!hasLiveData) {
    if (!coverImageUrl) {
      return null;
    }

    return (
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
        <div className="relative h-56 w-full sm:h-72">
          <Image
            src={coverImageUrl}
            alt={coverImageAlt || "Imagem do jogo"}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 768px"
          />
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                isLiveActive
                  ? "bg-red-50 text-red-700"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {isLiveActive ? (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                </span>
              ) : (
                <Activity size={14} />
              )}
              {isLiveActive ? "Ao vivo" : "Acompanhamento do jogo"}
            </div>
            <div className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600">
              {currentPhaseLabel}
            </div>
          </div>
          <div className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-500">
            Atualização automática
          </div>
        </div>
      </div>

      <div className="p-4 pb-0">
        <LiveScoreboardCard
          matchMetaLabel={controller.matchMetaLabel}
          homeShortName={controller.homeShortName}
          awayShortName={controller.awayShortName}
          scoreHome={snapshot.scoreHome}
          scoreAway={snapshot.scoreAway}
          clockSeconds={clockSeconds}
          currentMinute={currentMinute}
          isFinalized={snapshot.status === "completed"}
          formatClock={formatClock}
          className="mb-0"
        />
      </div>

      <div className="border-t border-slate-100 px-4 py-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Eventos do jogo
          </p>
          <p className="text-xs text-slate-400">
            Feed com atualização automática
          </p>
        </div>

        <div className="max-h-[22rem] space-y-2 overflow-y-auto pr-1">
          {eventsContent}
        </div>
      </div>
    </section>
  );
}
