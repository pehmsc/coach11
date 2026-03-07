export type ConvocationEditorStatus = "draft" | "confirmed" | "closed";

type GetConvocationEditorStateInput = {
  gameStatus: string | null | undefined;
  convocationStatus: ConvocationEditorStatus;
  isEditingConfirmed: boolean;
  canEditCompleted: boolean;
  correctionMode: boolean;
  correctionReason: string;
  hasPlayers: boolean;
  confirming: boolean;
};

export function getConvocationEditorState({
  gameStatus,
  convocationStatus,
  isEditingConfirmed,
  canEditCompleted,
  correctionMode,
  correctionReason,
  hasPlayers,
  confirming,
}: GetConvocationEditorStateInput) {
  const baseEditable =
    gameStatus === "scheduled" ||
    (gameStatus === "completed" &&
      correctionMode &&
      canEditCompleted &&
      correctionReason.trim().length > 0);

  const effectiveStatus =
    convocationStatus === "confirmed" && isEditingConfirmed
      ? ("draft" as const)
      : convocationStatus;

  const isConfirmed = effectiveStatus === "confirmed";
  const isClosed = effectiveStatus === "closed";

  return {
    baseEditable,
    effectiveStatus,
    isConfirmed,
    isClosed,
    canEditContent: baseEditable && !isConfirmed && !isClosed,
    canReopenConfirmed:
      convocationStatus === "confirmed" && !isEditingConfirmed && baseEditable,
    canConfirm:
      !confirming && hasPlayers && baseEditable && !isConfirmed && !isClosed,
  };
}
