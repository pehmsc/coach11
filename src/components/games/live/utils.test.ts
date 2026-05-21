import { describe, it, expect } from "vitest";
import { clampToValidMatchMinute } from "./utils";

describe("clampToValidMatchMinute", () => {
  it("devolve o minuto quando válido", () => {
    expect(clampToValidMatchMinute(45)).toBe(45);
    expect(clampToValidMatchMinute(0)).toBe(0);
    expect(clampToValidMatchMinute(90)).toBe(90);
    expect(clampToValidMatchMinute(120)).toBe(120);
  });

  it("trunca decimais", () => {
    expect(clampToValidMatchMinute(45.7)).toBe(45);
  });

  it("devolve null para valores absurdos (>200)", () => {
    expect(clampToValidMatchMinute(201)).toBeNull();
    expect(clampToValidMatchMinute(1408)).toBeNull();
    expect(clampToValidMatchMinute(2011)).toBeNull();
  });

  it("devolve null para negativos", () => {
    expect(clampToValidMatchMinute(-1)).toBeNull();
    expect(clampToValidMatchMinute(-100)).toBeNull();
  });

  it("devolve null para NaN/Infinity/undefined/null", () => {
    expect(clampToValidMatchMinute(NaN)).toBeNull();
    expect(clampToValidMatchMinute(Infinity)).toBeNull();
    expect(clampToValidMatchMinute(-Infinity)).toBeNull();
    expect(clampToValidMatchMinute(undefined)).toBeNull();
    expect(clampToValidMatchMinute(null)).toBeNull();
  });

  it("aceita 200 (limite incluído)", () => {
    expect(clampToValidMatchMinute(200)).toBe(200);
  });
});
