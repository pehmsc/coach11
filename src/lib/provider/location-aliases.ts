function normalizeAliasSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type LocationAliasSuggestion = {
  placeId: string;
  title: string;
  subtitle: string | null;
  formatted_address: string;
  latitude: number;
  longitude: number;
  osm_place_id: string;
  location_source: "manual";
};

type LocationAliasEntry = LocationAliasSuggestion & {
  aliases: string[];
};

const LOCATION_ALIASES: LocationAliasEntry[] = [
  {
    placeId: "ALIAS:CAMPO_MAJOR_BATISTA_DA_SILVA",
    title: "Campo Major Batista da Silva",
    subtitle: "Restelo, Lisboa, Portugal",
    formatted_address: "Rua de Alcolena 3A, Lisboa, Portugal",
    latitude: 38.7024591,
    longitude: -9.2078559,
    osm_place_id: "",
    location_source: "manual",
    aliases: [
      "Campo Major Batista Silva",
      "Campo Major Batista da Silva",
      "Campo Major Batista",
      "Major Batista Silva",
      "Rua de Alcolena 3A",
      "R de Alcolena 3A",
      "Alcolena 3A Lisboa",
    ],
  },
];

function getScore(query: string, candidate: string) {
  if (candidate === query) return 100;
  if (candidate.startsWith(query)) return 80;
  if (candidate.includes(query)) return 60;

  const queryTokens = query.split(" ").filter(Boolean);
  if (queryTokens.length > 0 && queryTokens.every((token) => candidate.includes(token))) {
    return 40;
  }

  return 0;
}

export function isLocationAliasPlaceId(value: string) {
  return /^ALIAS:[A-Z0-9_]+$/.test(value.trim().toUpperCase());
}

export function resolveLocationAlias(placeId: string) {
  const normalizedPlaceId = placeId.trim().toUpperCase();
  return (
    LOCATION_ALIASES.find((entry) => entry.placeId === normalizedPlaceId) || null
  );
}

export function findLocationAliasSuggestions(query: string, limit = 5) {
  const normalizedQuery = normalizeAliasSearch(query);
  if (!normalizedQuery) return [];

  const matches = LOCATION_ALIASES.map((entry) => {
    const bestScore = Math.max(
      getScore(normalizedQuery, normalizeAliasSearch(entry.title)),
      getScore(normalizedQuery, normalizeAliasSearch(entry.formatted_address)),
      ...entry.aliases.map((alias) =>
        getScore(normalizedQuery, normalizeAliasSearch(alias)),
      ),
    );

    return {
      entry,
      score: bestScore,
    };
  })
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.min(Math.max(limit, 1), 5));

  return matches.map(({ entry }) => ({
    placeId: entry.placeId,
    title: entry.title,
    subtitle: entry.subtitle,
    formatted_address: entry.formatted_address,
    latitude: entry.latitude,
    longitude: entry.longitude,
    osm_place_id: entry.osm_place_id,
    location_source: entry.location_source,
  }));
}
