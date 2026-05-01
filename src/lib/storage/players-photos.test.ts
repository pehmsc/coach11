import { describe, expect, it, vi } from "vitest";
import {
  buildPlayerPhotoPath,
  getPlayerPhotoSignedUrl,
} from "./players-photos";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("buildPlayerPhotoPath", () => {
  it("[1] formato '{ageGroupId}/{playerId}.webp'", () => {
    expect(
      buildPlayerPhotoPath("ag-uuid-123", "player-uuid-456"),
    ).toBe("ag-uuid-123/player-uuid-456.webp");
  });

  it("path correcto para UUIDs reais", () => {
    expect(
      buildPlayerPhotoPath(
        "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        "550e8400-e29b-41d4-a716-446655440000",
      ),
    ).toBe(
      "f47ac10b-58cc-4372-a567-0e02b2c3d479/550e8400-e29b-41d4-a716-446655440000.webp",
    );
  });
});

describe("getPlayerPhotoSignedUrl", () => {
  function makeMock(
    response: { data?: { signedUrl: string } | null; error?: { message: string } | null },
  ): SupabaseClient {
    const createSignedUrl = vi.fn().mockResolvedValue(response);
    const from = vi.fn().mockReturnValue({ createSignedUrl });
    return {
      storage: { from },
    } as unknown as SupabaseClient;
  }

  it("[2] devolve null para path null/undefined sem chamar Storage", async () => {
    const supabase = makeMock({ data: null });
    expect(await getPlayerPhotoSignedUrl(supabase, null)).toBeNull();
    expect(await getPlayerPhotoSignedUrl(supabase, undefined)).toBeNull();
    expect(await getPlayerPhotoSignedUrl(supabase, "")).toBeNull();
    expect(await getPlayerPhotoSignedUrl(supabase, "  ")).toBeNull();
  });

  it("[3] devolve null e log quando Storage retorna erro", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = makeMock({
      data: null,
      error: { message: "Object not found" },
    });
    const result = await getPlayerPhotoSignedUrl(supabase, "ag/p.webp");
    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("[4] devolve URL quando Storage responde com sucesso", async () => {
    const supabase = makeMock({
      data: { signedUrl: "https://x.supabase.co/signed/abc" },
    });
    const result = await getPlayerPhotoSignedUrl(supabase, "ag/p.webp");
    expect(result).toBe("https://x.supabase.co/signed/abc");
  });

  it("usa TTL custom quando fornecido", async () => {
    const createSignedUrl = vi
      .fn()
      .mockResolvedValue({ data: { signedUrl: "https://x" } });
    const supabase = {
      storage: { from: vi.fn().mockReturnValue({ createSignedUrl }) },
    } as unknown as SupabaseClient;
    await getPlayerPhotoSignedUrl(supabase, "ag/p.webp", 600);
    expect(createSignedUrl).toHaveBeenCalledWith("ag/p.webp", 600);
  });
});
