import { describe, expect, it, vi } from "vitest";
import {
  applyTransition,
  transitionContent,
  type TransitionContext,
} from "./clock-controls.utils";

function makeCtx(): TransitionContext & {
  pauseClock: ReturnType<typeof vi.fn>;
  startClock: ReturnType<typeof vi.fn>;
  setPhase: ReturnType<typeof vi.fn>;
} {
  return {
    pauseClock: vi.fn(),
    startClock: vi.fn(),
    setPhase: vi.fn(),
  };
}

describe("applyTransition", () => {
  it("[L1] end_first_half: pauseClock + setPhase('halftime')", () => {
    const ctx = makeCtx();
    applyTransition("end_first_half", ctx);
    expect(ctx.pauseClock).toHaveBeenCalledTimes(1);
    expect(ctx.setPhase).toHaveBeenCalledTimes(1);
    expect(ctx.setPhase).toHaveBeenCalledWith("halftime");
    expect(ctx.startClock).not.toHaveBeenCalled();
  });

  it("[L2] start_second_half: setPhase('second_half') + startClock", () => {
    const ctx = makeCtx();
    applyTransition("start_second_half", ctx);
    expect(ctx.setPhase).toHaveBeenCalledWith("second_half");
    expect(ctx.startClock).toHaveBeenCalledTimes(1);
    expect(ctx.pauseClock).not.toHaveBeenCalled();
  });

  it("[L3] end_second_half: pauseClock + setPhase('review')", () => {
    const ctx = makeCtx();
    applyTransition("end_second_half", ctx);
    expect(ctx.pauseClock).toHaveBeenCalledTimes(1);
    expect(ctx.setPhase).toHaveBeenCalledWith("review");
    expect(ctx.startClock).not.toHaveBeenCalled();
  });
});

describe("transitionContent", () => {
  it("[L4] end_first_half com minute=42: descrição inclui 42', destructive=true", () => {
    const c = transitionContent("end_first_half", 42);
    expect(c.title).toBe("Terminar a 1.ª parte?");
    expect(c.description).toContain("42'");
    expect(c.destructive).toBe(true);
    expect(c.confirmLabel).toBe("Sim, terminar");
  });

  it("start_second_half: destructive=false, confirmLabel='Sim, iniciar'", () => {
    const c = transitionContent("start_second_half", 45);
    expect(c.destructive).toBe(false);
    expect(c.confirmLabel).toBe("Sim, iniciar");
    expect(c.description).toContain("45'");
  });

  it("end_second_half: destructive=true, descrição menciona 'fim do jogo'", () => {
    const c = transitionContent("end_second_half", 90);
    expect(c.destructive).toBe(true);
    expect(c.description).toContain("90'");
    expect(c.description).toContain("fim do jogo");
  });
});
