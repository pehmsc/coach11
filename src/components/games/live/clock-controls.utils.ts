import type { MatchPhase } from "./types";

export type PendingTransition =
  | "end_first_half"
  | "start_second_half"
  | "end_second_half";

export interface TransitionContent {
  title: string;
  description: string;
  confirmLabel: string;
  destructive: boolean;
}

export function transitionContent(
  t: PendingTransition,
  minute: number,
): TransitionContent {
  switch (t) {
    case "end_first_half":
      return {
        title: "Terminar a 1.ª parte?",
        description: `Estás aos ${minute}'. Esta ação fixa o minuto de fim da 1.ª parte e inicia o intervalo. Eventos posteriores serão registados na 2.ª parte.`,
        confirmLabel: "Sim, terminar",
        destructive: true,
      };
    case "start_second_half":
      return {
        title: "Iniciar a 2.ª parte?",
        description: `Estás aos ${minute}'. O relógio retoma a contagem.`,
        confirmLabel: "Sim, iniciar",
        destructive: false,
      };
    case "end_second_half":
      return {
        title: "Terminar a 2.ª parte?",
        description: `Estás aos ${minute}'. Esta ação fixa o minuto de fim do jogo e abre a revisão final dos eventos.`,
        confirmLabel: "Sim, terminar",
        destructive: true,
      };
  }
}

export interface TransitionContext {
  pauseClock: () => void;
  startClock: () => void;
  setPhase: (p: MatchPhase) => void;
}

export function applyTransition(
  t: PendingTransition,
  ctx: TransitionContext,
): void {
  switch (t) {
    case "end_first_half":
      ctx.pauseClock();
      ctx.setPhase("halftime");
      return;
    case "start_second_half":
      ctx.setPhase("second_half");
      ctx.startClock();
      return;
    case "end_second_half":
      ctx.pauseClock();
      ctx.setPhase("review");
      return;
  }
}
