import { sanitizePublicPlayerName } from "../public-share";
import { normalizeLiveStatusForUi } from "./lineup";

type PublicConvocationSquadPlayer = {
  id: string;
  firstName: string | null | undefined;
  lastName: string | null | undefined;
};

type PublicConvocationExternalPlayer = {
  id: string;
  name: string | null | undefined;
  lineupStatus?: string | null | undefined;
};

type BuildPublicConvocationEntriesInput = {
  selectedPlayerIds: string[];
  squadPlayers: PublicConvocationSquadPlayer[];
  starterIds?: Iterable<string>;
  externalPlayers?: PublicConvocationExternalPlayer[];
};

export type PublicConvocationEntry = {
  id: string;
  name: string;
  isStarter: boolean;
  isExternal: boolean;
};

function normalizePublicConvocationNotes(value: string | null | undefined) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function sanitizeExternalPlayerName(name: string | null | undefined) {
  const normalized = typeof name === "string" ? name.trim() : "";
  return normalized || "Jogador";
}

function comparePublicConvocationEntries(
  a: PublicConvocationEntry,
  b: PublicConvocationEntry,
) {
  if (a.isStarter !== b.isStarter) {
    return a.isStarter ? -1 : 1;
  }

  return (
    a.name.localeCompare(b.name, "pt", { sensitivity: "base" }) ||
    a.id.localeCompare(b.id, "pt", { sensitivity: "base" })
  );
}

export function buildPublicConvocationEntries({
  selectedPlayerIds,
  squadPlayers,
  starterIds = [],
  externalPlayers = [],
}: BuildPublicConvocationEntriesInput): PublicConvocationEntry[] {
  const starterIdSet = new Set(Array.from(starterIds));
  const squadPlayerById = new Map(
    squadPlayers.map((player) => [
      player.id,
      sanitizePublicPlayerName(player.firstName, player.lastName),
    ]),
  );

  const uniqueSelectedIds = Array.from(
    new Set(
      selectedPlayerIds.filter(
        (playerId): playerId is string =>
          typeof playerId === "string" && playerId.trim().length > 0,
      ),
    ),
  );

  const entries = uniqueSelectedIds.map((playerId) => ({
    id: playerId,
    name: squadPlayerById.get(playerId) || "Jogador",
    isStarter: starterIdSet.has(playerId),
    isExternal: false,
  }));

  externalPlayers.forEach((player) => {
    if (!player.id) return;

    entries.push({
      id: `external:${player.id}`,
      name: sanitizeExternalPlayerName(player.name),
      isStarter: normalizeLiveStatusForUi(player.lineupStatus) === "on_field",
      isExternal: true,
    });
  });

  return entries.sort(comparePublicConvocationEntries);
}

// Notas do jogo (`games.notes`) e notas da convocatória (`convocations.notes`)
// são dois campos públicos distintos com regras diferentes:
// - Notas do jogo: instruções gerais pré-jogo (sempre visíveis no público).
// - Notas da convocatória: contextualizam a lista de convocados (só visíveis
//   quando a convocatória está publicada).
// As funções abaixo não fazem fallback cruzado entre as duas para evitar que
// uma nota apareça duplicada em ambas as secções nem que a nota pública do
// jogo herde a regra de privacidade da convocatória.
export function resolveGamePublicNotes(notes: string | null | undefined) {
  return normalizePublicConvocationNotes(notes);
}

export function resolveConvocationNotes(notes: string | null | undefined) {
  return normalizePublicConvocationNotes(notes);
}

export function hasPublicConvocationContent(params: {
  playerCount: number;
  notes?: string | null | undefined;
}) {
  return params.playerCount > 0 || normalizePublicConvocationNotes(params.notes) !== null;
}

export function isConvocationPublic(status: string | null | undefined) {
  return status === "published";
}
