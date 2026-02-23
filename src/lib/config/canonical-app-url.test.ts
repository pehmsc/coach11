import { describe, expect, it } from "vitest";
import { getCanonicalAppUrl } from "./canonical-app-url";

function env(partial: Partial<NodeJS.ProcessEnv>) {
  return partial as NodeJS.ProcessEnv;
}

describe("getCanonicalAppUrl", () => {
  it("uses NEXT_PUBLIC_APP_URL when configured", () => {
    const value = getCanonicalAppUrl(
      env({
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://coach11.app/base/path?foo=bar",
      }),
    );
    expect(value).toBe("https://coach11.app");
  });

  it("throws in production when app url env is missing", () => {
    expect(() =>
      getCanonicalAppUrl(
        env({
          NODE_ENV: "production",
          NEXT_PUBLIC_APP_URL: "",
          APP_URL: "",
        }),
      ),
    ).toThrow("APP_URL_MISSING");
  });

  it("falls back to localhost in development", () => {
    const value = getCanonicalAppUrl(
      env({
        NODE_ENV: "development",
        NEXT_PUBLIC_APP_URL: "",
        APP_URL: "",
      }),
    );
    expect(value).toBe("http://localhost:3000");
  });
});
