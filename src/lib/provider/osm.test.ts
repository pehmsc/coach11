import { describe, expect, it } from "vitest";
import {
  normalizeOsmLookupResult,
  normalizeOsmSuggestion,
  sanitizeAutocompleteQuery,
} from "./osm";

describe("osm provider normalization", () => {
  it("sanitizes autocomplete queries", () => {
    expect(sanitizeAutocompleteQuery("  Rua   da   Junqueira \n  ")).toBe(
      "Rua da Junqueira",
    );
    expect(sanitizeAutocompleteQuery("ab")).toBeNull();
  });

  it("normalizes search results into suggestions", () => {
    expect(
      normalizeOsmSuggestion({
        osm_type: "way",
        osm_id: 123,
        place_id: 456,
        lat: "38.7071",
        lon: "-9.2056",
        display_name: "Estádio Nacional, Cruz Quebrada, Oeiras, Lisboa, Portugal",
        name: "Estádio Nacional",
      }),
    ).toEqual({
      placeId: "W123",
      title: "Estádio Nacional",
      subtitle: "Cruz Quebrada, Oeiras, Lisboa, Portugal",
      formatted_address:
        "Estádio Nacional, Cruz Quebrada, Oeiras, Lisboa, Portugal",
      latitude: 38.7071,
      longitude: -9.2056,
      osm_place_id: "W123",
      location_source: "osm",
    });
  });

  it("normalizes lookup results", () => {
    expect(
      normalizeOsmLookupResult({
        osm_type: "relation",
        osm_id: "987",
        lat: "40.6405",
        lon: "-8.6538",
        display_name: "Aveiro, Região de Aveiro, Portugal",
      }),
    ).toEqual({
      latitude: 40.6405,
      longitude: -8.6538,
      formatted_address: "Aveiro, Região de Aveiro, Portugal",
      osm_place_id: "R987",
      location_source: "osm",
    });
  });
});
