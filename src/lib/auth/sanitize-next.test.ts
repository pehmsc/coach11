import { describe, expect, it } from "vitest";
import { sanitizeNextPath } from "./sanitize-next";

describe("sanitizeNextPath", () => {
  it("accepts a safe dashboard path", () => {
    expect(sanitizeNextPath("/dashboard")).toBe("/dashboard");
  });

  it("blocks protocol-relative URLs", () => {
    expect(sanitizeNextPath("//evil.com")).toBe("/dashboard");
  });

  it("blocks slash-backslash payloads", () => {
    expect(sanitizeNextPath("/\\evil.com")).toBe("/dashboard");
  });

  it("blocks absolute https URLs", () => {
    expect(sanitizeNextPath("https://evil.com")).toBe("/dashboard");
  });

  it("blocks encoded protocol-relative payloads", () => {
    expect(sanitizeNextPath("%2F%2Fevil.com")).toBe("/dashboard");
  });

  it("accepts safe internal paths with query params", () => {
    expect(sanitizeNextPath("/players?x=1")).toBe("/players?x=1");
  });
});
