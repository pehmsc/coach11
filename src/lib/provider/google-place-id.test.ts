import { describe, expect, it } from "vitest";
import {
  decodeGooglePlaceId,
  encodeGooglePlaceId,
  isGooglePlaceId,
} from "./google-place-id";

describe("google place id helpers", () => {
  it("encodes and decodes google place ids", () => {
    expect(encodeGooglePlaceId("ChIJX08Wnl7LHg0RcmDstdWuk4Q")).toBe(
      "GOOGLE:ChIJX08Wnl7LHg0RcmDstdWuk4Q",
    );
    expect(decodeGooglePlaceId("GOOGLE:ChIJX08Wnl7LHg0RcmDstdWuk4Q")).toBe(
      "ChIJX08Wnl7LHg0RcmDstdWuk4Q",
    );
  });

  it("detects google-prefixed place ids only", () => {
    expect(isGooglePlaceId("GOOGLE:abc123")).toBe(true);
    expect(isGooglePlaceId("abc123")).toBe(false);
    expect(isGooglePlaceId("")).toBe(false);
  });
});
