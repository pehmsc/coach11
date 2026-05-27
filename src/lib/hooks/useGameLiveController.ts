import { formatGameDateTime, parseGameDateTime } from "@/lib/events/time";
import { resolveFixtureScoreboardShortNames } from "@/lib/games/display";
import type { Game } from "@/types/database";

type UseGameLiveControllerParams = {
  game: Game | null;
  now: Date;
  homeClubName: string | null;
  homeClubShortName: string | null;
};

export function useGameLiveController({
  game,
  now,
  homeClubName,
  homeClubShortName,
}: UseGameLiveControllerParams) {
  // game_datetime e wall-clock PT — converter para instante UTC correcto.
  const gameStartAt = game?.game_datetime ? parseGameDateTime(game.game_datetime) : null;
  const liveUnlocked = gameStartAt
    ? now >= new Date(gameStartAt.getTime() - 10 * 60 * 1000)
    : true;
  const matchDateTimeLabel = game?.game_datetime
    ? formatGameDateTime(game.game_datetime, "shortWithoutYear")
    : "Sem data";
  const matchMetaLabel = game?.location
    ? `${matchDateTimeLabel} · ${game.location}`
    : matchDateTimeLabel;
  const scoreboardLabels = resolveFixtureScoreboardShortNames({
    isHome: game?.is_home ?? true,
    ourTeamPreferredShortName: homeClubShortName,
    ourTeamName: homeClubName || "Casa",
    opponentPreferredShortName: game?.opponent_short_name,
    opponentName: game?.opponent_name || "Adversário",
  });

  return {
    gameStartAt,
    liveUnlocked,
    matchDateTimeLabel,
    matchMetaLabel,
    ...scoreboardLabels,
  };
}
