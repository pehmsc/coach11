import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlayerProfileHeader } from "./PlayerProfileHeader";
import type { Player } from "@/types/database";

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "p-1",
    age_group_id: "ag-1",
    first_name: "João",
    last_name: "Silva",
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("PlayerProfileHeader", () => {
  it("mostra botão 'Editar' quando canEdit=true", () => {
    render(<PlayerProfileHeader player={makePlayer()} canEdit={true} />);
    expect(
      screen.getByRole("button", { name: /editar/i }),
    ).toBeInTheDocument();
  });

  it("não mostra botão 'Editar' quando canEdit=false", () => {
    render(<PlayerProfileHeader player={makePlayer()} canEdit={false} />);
    expect(
      screen.queryByRole("button", { name: /editar/i }),
    ).not.toBeInTheDocument();
  });

  it("mostra badge 'Lesionado' quando status='injured'", () => {
    render(
      <PlayerProfileHeader
        player={makePlayer({ status: "injured" })}
        canEdit={true}
      />,
    );
    expect(screen.getByText("Lesionado")).toBeInTheDocument();
  });
});
