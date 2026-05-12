type ScoreInputs = {
  score_home: number | null;
  score_away: number | null;
  is_home: boolean | null;
};

type ResultInputs = ScoreInputs & {
  status?: string | null;
};

export function getOurScore(game: ScoreInputs): number | null {
  if (game.score_home === null || game.score_away === null) return null;
  return game.is_home ? game.score_home : game.score_away;
}

export function getOpponentScore(game: ScoreInputs): number | null {
  if (game.score_home === null || game.score_away === null) return null;
  return game.is_home ? game.score_away : game.score_home;
}

export function getGameResult(game: ResultInputs): "W" | "D" | "L" | null {
  if (game.status && game.status !== "completed") return null;
  if (game.score_home === null || game.score_away === null) return null;
  const our = game.is_home ? game.score_home : game.score_away;
  const opp = game.is_home ? game.score_away : game.score_home;
  if (our > opp) return "W";
  if (our < opp) return "L";
  return "D";
}
