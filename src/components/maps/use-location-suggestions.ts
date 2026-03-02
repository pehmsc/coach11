"use client";

import { useEffect, useState } from "react";

type SuggestionsState = {
  locations: string[];
  addresses: string[];
  loading: boolean;
};

type SuggestionsPayload = {
  locations?: string[];
  addresses?: string[];
};

const EMPTY_STATE: SuggestionsState = {
  locations: [],
  addresses: [],
  loading: false,
};

let cachedSuggestions: SuggestionsState | null = null;
let pendingRequest: Promise<SuggestionsState> | null = null;

async function fetchSuggestions() {
  if (cachedSuggestions) return cachedSuggestions;
  if (pendingRequest) return pendingRequest;

  pendingRequest = fetch("/api/location-suggestions", {
    cache: "no-store",
  })
    .then(async (response) => {
      const payload = (await response.json().catch(() => null)) as
        | SuggestionsPayload
        | null;

      const resolvedState = {
        locations: Array.isArray(payload?.locations)
          ? payload.locations.filter((value): value is string => typeof value === "string")
          : [],
        addresses: Array.isArray(payload?.addresses)
          ? payload.addresses.filter((value): value is string => typeof value === "string")
          : [],
        loading: false,
      };

      cachedSuggestions = resolvedState;
      return resolvedState;
    })
    .catch(() => EMPTY_STATE)
    .finally(() => {
      pendingRequest = null;
    });

  return pendingRequest;
}

export function useLocationSuggestions(enabled = true) {
  const [state, setState] = useState<SuggestionsState>(
    cachedSuggestions ?? { ...EMPTY_STATE, loading: enabled },
  );

  useEffect(() => {
    if (!enabled || cachedSuggestions) return;

    let cancelled = false;

    void fetchSuggestions().then((result) => {
      if (cancelled) return;
      setState(result);
    });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return enabled ? state : EMPTY_STATE;
}
