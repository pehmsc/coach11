import { describe, expect, it } from "vitest";
import { diffPayload, playerToFormState } from "./diff-payload";
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

describe("diffPayload", () => {
  it("[1] estado idêntico ao original devolve diff vazio", () => {
    const player = makePlayer();
    const form = playerToFormState(player);
    expect(diffPayload(player, form)).toEqual({});
  });

  it("[2] apenas first_name alterado", () => {
    const player = makePlayer();
    const form = playerToFormState(player);
    form.first_name = "Pedro";
    expect(diffPayload(player, form)).toEqual({ first_name: "Pedro" });
  });

  it("[3] email original null, novo string vazia → diff vazio", () => {
    const player = makePlayer({ email: undefined });
    const form = playerToFormState(player);
    form.email = "";
    expect(diffPayload(player, form)).toEqual({});
  });

  it("[4] email original 'a@b.com', novo string vazia → diff { email: null }", () => {
    const player = makePlayer({ email: "a@b.com" });
    const form = playerToFormState(player);
    form.email = "";
    expect(diffPayload(player, form)).toEqual({ email: null });
  });

  it("[5] múltiplos campos alterados", () => {
    const player = makePlayer({
      first_name: "João",
      last_name: "Silva",
      jersey_number: 7,
    });
    const form = playerToFormState(player);
    form.first_name = "Pedro";
    form.jersey_number = "9";
    form.notes = "Nova nota";
    const diff = diffPayload(player, form);
    expect(diff).toEqual({
      first_name: "Pedro",
      jersey_number: 9,
      notes: "Nova nota",
    });
  });

  it("status alterado é incluído", () => {
    const player = makePlayer({ status: "active" });
    const form = playerToFormState(player);
    form.status = "injured";
    expect(diffPayload(player, form)).toEqual({ status: "injured" });
  });

  it("photo_consent_given alterado é incluído", () => {
    const player = makePlayer({ photo_consent_given: false });
    const form = playerToFormState(player);
    form.photo_consent_given = true;
    expect(diffPayload(player, form)).toEqual({ photo_consent_given: true });
  });

  it("preferred_position '' vs undefined original → diff vazio", () => {
    const player = makePlayer({ preferred_position: undefined });
    const form = playerToFormState(player);
    form.preferred_position = "";
    expect(diffPayload(player, form)).toEqual({});
  });

  it("preferred_position 'MC' vs undefined → diff { preferred_position: 'MC' }", () => {
    const player = makePlayer({ preferred_position: undefined });
    const form = playerToFormState(player);
    form.preferred_position = "MC";
    expect(diffPayload(player, form)).toEqual({ preferred_position: "MC" });
  });

  it("jersey_number 7 → '' clears (diff { jersey_number: null })", () => {
    const player = makePlayer({ jersey_number: 7 });
    const form = playerToFormState(player);
    form.jersey_number = "";
    expect(diffPayload(player, form)).toEqual({ jersey_number: null });
  });

  it("whitespace-only no first_name vs original com nome → trim, diff { first_name: '' }", () => {
    const player = makePlayer({ first_name: "Pedro" });
    const form = playerToFormState(player);
    form.first_name = "  ";
    // Trim resulta em "" — schema rejeita mas o diff inclui
    expect(diffPayload(player, form).first_name).toBe("");
  });

  it("whitespace adicionado no email mas mesmo conteúdo → diff vazio", () => {
    const player = makePlayer({ email: "a@b.com" });
    const form = playerToFormState(player);
    form.email = "  a@b.com  ";
    expect(diffPayload(player, form)).toEqual({});
  });
});
