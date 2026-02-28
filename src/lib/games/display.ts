import { resolveShortName } from "@/lib/football/short-name";

export function isClosedGameStatus(status: string | null | undefined) {
  return status === "completed" || status === "cancelled";
}

export function getFixtureConnector(isHome: boolean) {
  return isHome ? "vs" : "@";
}

export function formatFixtureOpponentLabel(options: {
  isHome: boolean;
  opponentName?: string | null;
  opponentShortName?: string | null;
  fallbackName?: string;
}) {
  const opponentName = options.opponentName?.trim() || options.fallbackName || "Adversário";
  const opponentShortName = options.opponentShortName?.trim();
  const shortTag = opponentShortName ? ` (${opponentShortName})` : "";
  return `${getFixtureConnector(options.isHome)} ${opponentName}${shortTag}`;
}

export function resolveFixtureScoreboardShortNames(options: {
  isHome: boolean;
  ourTeamPreferredShortName?: string | null;
  ourTeamName?: string | null;
  opponentPreferredShortName?: string | null;
  opponentName?: string | null;
}) {
  const ourTeamShortName = resolveShortName(
    options.ourTeamPreferredShortName,
    options.ourTeamName,
    "EQUIPA",
  );
  const opponentTeamShortName = resolveShortName(
    options.opponentPreferredShortName,
    options.opponentName,
    "ADV",
  );

  return {
    ourTeamShortName,
    opponentTeamShortName,
    homeShortName: options.isHome ? ourTeamShortName : opponentTeamShortName,
    awayShortName: options.isHome ? opponentTeamShortName : ourTeamShortName,
  };
}
