import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  isPublicShareRateLimitedError,
  slugifyPublicAccessSegment,
} from "./public-share";

describe("public-share", () => {
  it("slugifies public access segments safely", () => {
    expect(
      slugifyPublicAccessSegment('Escola de Futebol "Os Belenenses" Sub 13'),
    ).toBe("escola-de-futebol-os-belenenses-sub-13");
  });

  it("detects public share rate limit errors", () => {
    expect(
      isPublicShareRateLimitedError(new Error("public_share_rate_limited")),
    ).toBe(true);
    expect(
      isPublicShareRateLimitedError(new Error("public_share_lookup_failed")),
    ).toBe(false);
    expect(isPublicShareRateLimitedError("public_share_rate_limited")).toBe(false);
  });
});
