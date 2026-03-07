import { describe, expect, it } from "vitest";
import { getConvocationEditorState } from "./convocation-editor";

describe("convocation-editor", () => {
  it("keeps a saved convocation reopenable for scheduled games", () => {
    expect(
      getConvocationEditorState({
        gameStatus: "scheduled",
        convocationStatus: "confirmed",
        isEditingConfirmed: false,
        canEditCompleted: false,
        correctionMode: false,
        correctionReason: "",
        hasPlayers: true,
        confirming: false,
      }),
    ).toMatchObject({
      baseEditable: true,
      effectiveStatus: "confirmed",
      canEditContent: false,
      canReopenConfirmed: true,
      canConfirm: false,
    });
  });

  it("treats a reopened saved convocation as editable draft again", () => {
    expect(
      getConvocationEditorState({
        gameStatus: "scheduled",
        convocationStatus: "confirmed",
        isEditingConfirmed: true,
        canEditCompleted: false,
        correctionMode: false,
        correctionReason: "",
        hasPlayers: true,
        confirming: false,
      }),
    ).toMatchObject({
      baseEditable: true,
      effectiveStatus: "draft",
      canEditContent: true,
      canReopenConfirmed: false,
      canConfirm: true,
    });
  });
});
