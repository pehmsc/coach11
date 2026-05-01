/**
 * Devolve `true` se o utilizador pode editar o atleta — i.e. se o escalão
 * do atleta está na lista de escalões acessíveis ao utilizador.
 *
 * Função pura, espelha o gate aplicacional usado em `/api/players/[id]`
 * (PATCH e GET). A RLS do DB faz o gate primário; este helper serve para
 * decidir afordances de UI (ex: mostrar/esconder botão "Editar").
 */
export function canEditPlayer(
  context: { accessibleAgeGroupIds: string[] },
  playerAgeGroupId: string,
): boolean {
  return context.accessibleAgeGroupIds.includes(playerAgeGroupId);
}
