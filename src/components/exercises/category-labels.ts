import type { ExerciseCategory } from "@/types/database";

export const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  warmup: "Aquecimento",
  technical: "Técnico",
  tactical: "Tático",
  formal_game: "Jogo Formal",
  finishing: "Finalização",
  defensive_org: "Org. Defensiva",
  offensive_org: "Org. Ofensiva",
  transition: "Transição",
  physical: "Físico",
  set_pieces: "Bolas Paradas",
  strategy: "Estratégia",
  cooldown: "Retorno à Calma",
  other: "Outro",
};

export const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS) as [
  ExerciseCategory,
  string,
][];
