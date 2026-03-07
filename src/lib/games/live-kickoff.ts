type LiveKickoffPlayer = {
  isExternal?: boolean;
};

type GetLiveKickoffStateInput = {
  starters: LiveKickoffPlayer[];
};

export function getLiveKickoffState({
  starters,
}: GetLiveKickoffStateInput) {
  if (starters.length === 0) {
    return {
      canStart: false,
      reason: "Seleciona pelo menos 1 titular.",
    };
  }

  const externalStarterCount = starters.filter((player) => player.isExternal).length;
  if (externalStarterCount > 0) {
    return {
      canStart: false,
      reason:
        externalStarterCount === 1
          ? 'A live interna ainda não suporta jogadores "Outro" como titulares. Mantém esse jogador no banco ou edita a convocatória antes de iniciar.'
          : 'A live interna ainda não suporta jogadores "Outro" como titulares. Mantém-nos no banco ou edita a convocatória antes de iniciar.',
    };
  }

  return {
    canStart: true,
    reason: null,
  };
}
