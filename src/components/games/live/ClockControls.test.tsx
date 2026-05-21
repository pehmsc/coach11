import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClockControls } from "./ClockControls";
import type { MatchPhase, ClockState } from "./types";

interface RenderOpts {
  phase?: MatchPhase;
  currentMinute?: number;
}

function renderClockControls(opts: RenderOpts = {}) {
  const pauseClock = vi.fn();
  const startClock = vi.fn();
  const setPhase = vi.fn();
  const adjustClockBySeconds = vi.fn();
  const setClockMinute = vi.fn();
  const handleStartFirstHalf = vi.fn();

  const clockState: ClockState = {
    baseSeconds: 0,
    runningSinceMs: null,
  };

  render(
    <ClockControls
      phase={opts.phase ?? "first_half"}
      currentMinute={opts.currentMinute ?? 42}
      clockState={clockState}
      isLivePhase={true}
      playersOnField={{ length: 11 }}
      startingFirstHalf={false}
      kickoffError={null}
      kickoffState={{ canStart: true, reason: null }}
      adjustClockBySeconds={adjustClockBySeconds}
      setClockMinute={setClockMinute}
      handleStartFirstHalf={handleStartFirstHalf}
      pauseClock={pauseClock}
      startClock={startClock}
      setPhase={setPhase}
    />,
  );

  return { pauseClock, startClock, setPhase, setClockMinute };
}

describe("ClockControls — confirmation dialog", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("[#1] clicar 'Terminar 1ª parte' abre dialog com título e minuto na descrição", async () => {
    const user = userEvent.setup();
    renderClockControls({ phase: "first_half", currentMinute: 42 });

    await user.click(screen.getByRole("button", { name: /terminar 1ª parte/i }));

    expect(
      await screen.findByRole("alertdialog"),
    ).toBeInTheDocument();
    expect(screen.getByText("Terminar a 1.ª parte?")).toBeInTheDocument();
    expect(
      screen.getByText(/Estás aos 42'/),
    ).toBeInTheDocument();
  });

  it("[#2] clicar Cancelar fecha o dialog e não chama os handlers", async () => {
    const user = userEvent.setup();
    const { pauseClock, setPhase } = renderClockControls({ phase: "first_half" });

    await user.click(screen.getByRole("button", { name: /terminar 1ª parte/i }));
    await screen.findByRole("alertdialog");

    await user.click(screen.getByRole("button", { name: /cancelar/i }));

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(pauseClock).not.toHaveBeenCalled();
    expect(setPhase).not.toHaveBeenCalled();
  });

  it("[#3] premir Escape equivale a Cancelar", async () => {
    const user = userEvent.setup();
    const { pauseClock, setPhase } = renderClockControls({ phase: "first_half" });

    await user.click(screen.getByRole("button", { name: /terminar 1ª parte/i }));
    await screen.findByRole("alertdialog");

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(pauseClock).not.toHaveBeenCalled();
    expect(setPhase).not.toHaveBeenCalled();
  });

  it("[#4] após o rAF resolver, clicar 'Sim, terminar' chama pauseClock + setPhase('halftime') uma vez", async () => {
    const user = userEvent.setup();
    const { pauseClock, setPhase } = renderClockControls({ phase: "first_half" });

    await user.click(screen.getByRole("button", { name: /terminar 1ª parte/i }));
    await screen.findByRole("alertdialog");

    // Esperar que o botão de confirm fique enabled (após rAF x2).
    const confirmBtn = await screen.findByRole("button", {
      name: /sim, terminar/i,
    });
    await waitFor(() => expect(confirmBtn).not.toBeDisabled());

    await user.click(confirmBtn);

    expect(pauseClock).toHaveBeenCalledTimes(1);
    expect(setPhase).toHaveBeenCalledTimes(1);
    expect(setPhase).toHaveBeenCalledWith("halftime");
  });

  it("[#5] no momento da abertura (antes do rAF resolver), o botão 'Sim, terminar' está disabled", async () => {
    const user = userEvent.setup();
    renderClockControls({ phase: "first_half" });

    await user.click(screen.getByRole("button", { name: /terminar 1ª parte/i }));
    await screen.findByRole("alertdialog");

    const confirmBtn = screen.getByRole("button", { name: /sim, terminar/i });
    // Pelo menos no primeiro frame após abrir, o botão deve estar disabled.
    expect(confirmBtn).toBeDisabled();
  });

  it("[#6] foco inicial vai para o botão Cancelar", async () => {
    const user = userEvent.setup();
    renderClockControls({ phase: "first_half" });

    await user.click(screen.getByRole("button", { name: /terminar 1ª parte/i }));
    await screen.findByRole("alertdialog");

    const cancelBtn = screen.getByRole("button", { name: /cancelar/i });
    await waitFor(() => expect(cancelBtn).toHaveFocus());
  });
});

describe("ClockControls — variantes de transição", () => {
  it("phase=halftime: dialog 'Iniciar a 2.ª parte?' não-destructive", async () => {
    const user = userEvent.setup();
    const { startClock, setPhase } = renderClockControls({
      phase: "halftime",
      currentMinute: 45,
    });

    await user.click(screen.getByRole("button", { name: /iniciar 2ª parte/i }));
    await screen.findByRole("alertdialog");

    expect(screen.getByText("Iniciar a 2.ª parte?")).toBeInTheDocument();

    const confirmBtn = await screen.findByRole("button", {
      name: /sim, iniciar/i,
    });
    await waitFor(() => expect(confirmBtn).not.toBeDisabled());
    await user.click(confirmBtn);

    expect(setPhase).toHaveBeenCalledWith("second_half");
    expect(startClock).toHaveBeenCalledTimes(1);
  });

  it("phase=second_half: dialog 'Terminar a 2.ª parte?' confirma → pauseClock + review", async () => {
    const user = userEvent.setup();
    const { pauseClock, setPhase } = renderClockControls({
      phase: "second_half",
      currentMinute: 90,
    });

    await user.click(screen.getByRole("button", { name: /terminar 2ª parte/i }));
    await screen.findByRole("alertdialog");

    const confirmBtn = await screen.findByRole("button", {
      name: /sim, terminar/i,
    });
    await waitFor(() => expect(confirmBtn).not.toBeDisabled());
    await user.click(confirmBtn);

    expect(pauseClock).toHaveBeenCalledTimes(1);
    expect(setPhase).toHaveBeenCalledWith("review");
  });
});

describe("ClockControls — input editável de minuto", () => {
  it("Enter no input com valor 60 chama setClockMinute(60)", async () => {
    const user = userEvent.setup();
    const { setClockMinute } = renderClockControls({ currentMinute: 42 });

    const input = screen.getByLabelText(/minuto de jogo/i);
    await user.clear(input);
    await user.type(input, "60{Enter}");

    expect(setClockMinute).toHaveBeenCalledWith(60);
  });

  it("Blur com valor inválido (>200) restaura o valor original", async () => {
    const user = userEvent.setup();
    const { setClockMinute } = renderClockControls({ currentMinute: 42 });

    const input = screen.getByLabelText(/minuto de jogo/i) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "5000");
    input.blur();

    expect(setClockMinute).not.toHaveBeenCalled();
    await waitFor(() => expect(input.value).toBe("42"));
  });

  it("Escape restaura o valor sem chamar setClockMinute", async () => {
    const user = userEvent.setup();
    const { setClockMinute } = renderClockControls({ currentMinute: 42 });

    const input = screen.getByLabelText(/minuto de jogo/i) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "99{Escape}");

    expect(setClockMinute).not.toHaveBeenCalled();
    expect(input.value).toBe("42");
  });

  it("Sincroniza valor quando currentMinute muda externamente", () => {
    const setClockMinute = vi.fn();
    const baseProps = {
      phase: "first_half" as const,
      clockState: { baseSeconds: 0, runningSinceMs: null },
      isLivePhase: true,
      playersOnField: { length: 11 },
      startingFirstHalf: false,
      kickoffError: null,
      kickoffState: { canStart: true, reason: null },
      adjustClockBySeconds: vi.fn(),
      handleStartFirstHalf: vi.fn(),
      pauseClock: vi.fn(),
      startClock: vi.fn(),
      setClockMinute,
      setPhase: vi.fn(),
    };

    const { rerender } = render(
      <ClockControls {...baseProps} currentMinute={10} />,
    );
    expect(
      (screen.getByLabelText(/minuto de jogo/i) as HTMLInputElement).value,
    ).toBe("10");

    rerender(<ClockControls {...baseProps} currentMinute={25} />);
    expect(
      (screen.getByLabelText(/minuto de jogo/i) as HTMLInputElement).value,
    ).toBe("25");
  });
});
