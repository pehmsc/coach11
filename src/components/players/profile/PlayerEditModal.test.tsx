import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlayerEditModal } from "./PlayerEditModal";
import type { Player } from "@/types/database";

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "p-1",
    age_group_id: "ag-1",
    first_name: "Maria",
    last_name: "Costa",
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("PlayerEditModal — readonly", () => {
  it("botão 'Guardar' tem atributo disabled", () => {
    render(
      <PlayerEditModal
        player={makePlayer()}
        mode="readonly"
        open={true}
        onOpenChange={() => {}}
      />,
    );
    const guardar = screen.getByRole("button", { name: /guardar/i });
    expect(guardar).toBeDisabled();
  });

  it("não há inputs nem textareas editáveis", () => {
    const { container } = render(
      <PlayerEditModal
        player={makePlayer({
          first_name: "Maria",
          last_name: "Costa",
          phone: "910000000",
          notes: "Observação X",
        })}
        mode="readonly"
        open={true}
        onOpenChange={() => {}}
      />,
    );
    expect(container.querySelector("input")).toBeNull();
    expect(container.querySelector("textarea")).toBeNull();
  });

  it("campos null são mostrados como '—'", () => {
    render(
      <PlayerEditModal
        player={makePlayer({
          first_name: "Maria",
          last_name: "Costa",
          birth_date: undefined,
          parent_email: null,
        })}
        mode="readonly"
        open={true}
        onOpenChange={() => {}}
      />,
    );
    // Pelo menos um '—' visível para os campos vazios
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });
});
