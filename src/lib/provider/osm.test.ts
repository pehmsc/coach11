import { describe, expect, it } from "vitest";
import { findLocationAliasSuggestions } from "./location-aliases";
import {
  buildAutocompleteQueries,
  isValidLocationPlaceId,
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

  it("builds fallback autocomplete variants for portuguese place names", () => {
    expect(buildAutocompleteQueries("Campo Major Batista Silva")).toEqual([
      "Campo Major Batista Silva",
      "Campo Major Batista Silva, Portugal",
      "Campo Major Batista da Silva",
      "Campo Major Batista da Silva, Portugal",
      "Campo Major Batista de Silva",
      "Campo Major Batista de Silva, Portugal",
      "Campo Major Batista do Silva",
      "Campo Major Batista do Silva, Portugal",
    ]);
  });

  it("matches curated venue aliases before hitting external geocoding", () => {
    expect(findLocationAliasSuggestions("Campo Major Batista Silva", 5)).toEqual([
      {
        placeId: "ALIAS:CAMPO_MAJOR_BATISTA_DA_SILVA",
        title: "Campo Major Batista da Silva",
        subtitle: "Restelo, Lisboa, Portugal",
        formatted_address: "Campo Major Batista da Silva, Lisboa, Portugal",
        latitude: 38.7024591,
        longitude: -9.2078559,
        osm_place_id: "",
        location_source: "manual",
      },
    ]);
  });

  it("accepts both OSM and internal location identifiers", () => {
    expect(isValidLocationPlaceId("W123")).toBe(true);
    expect(isValidLocationPlaceId("ALIAS:CAMPO_MAJOR_BATISTA_DA_SILVA")).toBe(
      true,
    );
    expect(isValidLocationPlaceId("123")).toBe(false);
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
