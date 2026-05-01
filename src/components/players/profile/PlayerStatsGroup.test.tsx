import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  PlayerStatsGroup,
  type PlayerSeasonStats,
} from "./PlayerStatsGroup";

function makeStats(
  overrides: Partial<PlayerSeasonStats> = {},
): PlayerSeasonStats {
  return {
    player_id: "p-1",
    games_convoked: 12,
    games_started: 8,
    games_substitute: 4,
    total_minutes: 540,
    goals: 5,
    assists: 3,
    yellow_cards: 2,
    red_cards: 0,
    own_goals: 0,
    avg_rating: 7.4,
    attendance_total: 20,
    attendance_present: 18,
    attendance_rate: 90,
    ...overrides,
  };
}

describe("PlayerStatsGroup", () => {
  it("renderiza tiles com valores correctos", () => {
    render(<PlayerStatsGroup stats={makeStats()} status="active" />);
    expect(screen.getByText("12")).toBeInTheDocument(); // convocatórias
    expect(screen.getByText("8 / 4")).toBeInTheDocument(); // titular/sup
    expect(screen.getByText("540")).toBeInTheDocument(); // minutos
    expect(screen.getByText("5")).toBeInTheDocument(); // golos
    expect(screen.getByText("7.4")).toBeInTheDocument(); // avg_rating
    expect(screen.getByText("90%")).toBeInTheDocument(); // presença
    expect(screen.getByText("Activo")).toBeInTheDocument(); // status
  });

  it("mostra estado vazio quando stats=null", () => {
    render(<PlayerStatsGroup stats={null} status="active" />);
    expect(
      screen.getByText("Sem dados para a época actual."),
    ).toBeInTheDocument();
    // Status badge ainda aparece
    expect(screen.getByText("Activo")).toBeInTheDocument();
  });
});
