/**
 * Estado UI da convocatória — mapeia 1:1 com games.convocation_status na DB.
 *
 * - 'draft': em edição/sem publicar.
 * - 'published': confirmada e visível no link público.
 *
 * Nota histórica: este enum era 3-state ('draft'|'confirmed'|'closed') durante
 * a transição para o modelo unificado. O estado 'closed' nunca foi usado em
 * produção e foi removido. 'confirmed' renomeado para 'published' para alinhar
 * com a DB e com a resposta do endpoint /confirm.
 */
export type ConvocationEditorStatus = "draft" | "published";

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
    convocationStatus === "published" && isEditingConfirmed
      ? ("draft" as const)
      : convocationStatus;

  const isConfirmed = effectiveStatus === "published";
  // 'closed' deprecado: nunca verdadeiro. Mantido no contracto público para
  // não obrigar a refactor em cascata nos callers que apenas leem o flag.
  const isClosed = false;

  return {
    baseEditable,
    effectiveStatus,
    isConfirmed,
    isClosed,
    canEditContent: baseEditable && !isConfirmed && !isClosed,
    canReopenConfirmed:
      convocationStatus === "published" && !isEditingConfirmed && baseEditable,
    canConfirm:
      !confirming && hasPlayers && baseEditable && !isConfirmed && !isClosed,
  };
}
