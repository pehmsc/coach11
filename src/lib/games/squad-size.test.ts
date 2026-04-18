import { describe, expect, it } from "vitest";

/**
 * The starters-limit logic lives inline inside useGameConvocation,
 * reading `parseInt(footballFormat)`. These tests verify the expected
 * limit for each football type the app supports.
 */
function startersLimitForFormat(footballFormat: string | null): number {
  if (!footballFormat) return 0;
  return parseInt(footballFormat, 10) || 0;
}

describe("startersLimitForFormat", () => {
  it("returns 9 for football_format '9' (Futebol 9)", () => {
    expect(startersLimitForFormat("9")).toBe(9);
  });

  it("returns 7 for football_format '7' (Futebol 7)", () => {
    expect(startersLimitForFormat("7")).toBe(7);
  });

  it("returns 11 for football_format '11' (Futebol 11)", () => {
    expect(startersLimitForFormat("11")).toBe(11);
  });

  it("returns 5 for football_format '5' (Futsal)", () => {
    expect(startersLimitForFormat("5")).toBe(5);
  });

  it("returns 0 for null format", () => {
    expect(startersLimitForFormat(null)).toBe(0);
  });

  it("returns 0 for empty string", () => {
    expect(startersLimitForFormat("")).toBe(0);
  });
});
