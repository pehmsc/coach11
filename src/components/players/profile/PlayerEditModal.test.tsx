import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

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

  it("não há inputs nem textareas editáveis em readonly", () => {
    const { container } = render(
      <PlayerEditModal
        player={makePlayer({
          first_name: "Maria",
          phone: "910",
          notes: "x",
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
        player={makePlayer({ parent_email: null })}
        mode="readonly"
        open={true}
        onOpenChange={() => {}}
      />,
    );
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});

describe("PlayerEditModal — edit mode", () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("[#4] alterar first_name e clicar Guardar envia PATCH com diff", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const updated: Player = makePlayer({ first_name: "Maria João" });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, player: updated }),
    });

    render(
      <PlayerEditModal
        player={makePlayer()}
        mode="edit"
        open={true}
        onOpenChange={() => {}}
        onSaved={onSaved}
      />,
    );

    const firstNameInput = screen.getByLabelText(
      /primeiro nome/i,
    ) as HTMLInputElement;
    await user.clear(firstNameInput);
    await user.type(firstNameInput, "Maria João");

    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.method).toBe("PATCH");
    const body = JSON.parse(init.body);
    expect(body).toEqual({ first_name: "Maria João" });
  });

  it("[#5] erro 422 mostra erros inline e modal não fecha", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        error: "Validação falhou.",
        fieldErrors: { first_name: ["Nome demasiado curto"] },
      }),
    });

    render(
      <PlayerEditModal
        player={makePlayer()}
        mode="edit"
        open={true}
        onOpenChange={onOpenChange}
      />,
    );

    const firstNameInput = screen.getByLabelText(
      /primeiro nome/i,
    ) as HTMLInputElement;
    await user.clear(firstNameInput);
    await user.type(firstNameInput, "X");

    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(
      await screen.findByText(/corrige os campos sinalizados/i),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/nome demasiado curto/i),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("[#6] erro 500 mostra alerta inline e modal não fecha", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "Erro ao guardar" }),
    });

    render(
      <PlayerEditModal
        player={makePlayer()}
        mode="edit"
        open={true}
        onOpenChange={onOpenChange}
      />,
    );

    const firstNameInput = screen.getByLabelText(
      /primeiro nome/i,
    ) as HTMLInputElement;
    await user.clear(firstNameInput);
    await user.type(firstNameInput, "Outra");

    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => {
      expect(screen.getByText(/erro ao guardar/i)).toBeInTheDocument();
    });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("[#7] sucesso chama onSaved e fecha modal", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onSaved = vi.fn();
    const updated = makePlayer({ first_name: "Outra" });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, player: updated }),
    });

    render(
      <PlayerEditModal
        player={makePlayer()}
        mode="edit"
        open={true}
        onOpenChange={onOpenChange}
        onSaved={onSaved}
      />,
    );

    const firstNameInput = screen.getByLabelText(
      /primeiro nome/i,
    ) as HTMLInputElement;
    await user.clear(firstNameInput);
    await user.type(firstNameInput, "Outra");

    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith(updated);
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("[#9] sem alterações, clicar Guardar fecha sem chamar fetch", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <PlayerEditModal
        player={makePlayer()}
        mode="edit"
        open={true}
        onOpenChange={onOpenChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(global.fetch).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
