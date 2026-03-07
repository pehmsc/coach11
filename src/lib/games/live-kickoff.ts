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

  return {
    canStart: true,
    reason: null,
  };
}
