import type { ExerciseCategory } from "@/types/database";

export const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  attb: "ATTB",
  esquemas_taticos: "Esquemas Táticos",
  estrategia: "Estratégia",
  finalizacao: "Finalização",
  organizacao_defensiva: "Organização Defensiva",
  organizacao_ofensiva: "Organização Ofensiva",
  principios_de_jogo: "Princípios de Jogo",
  qualidades_fisicas: "Qualidades Físicas",
  transicao_defensiva: "Transição Defensiva",
  transicao_ofensiva: "Transição Ofensiva",
};

export const CATEGORY_COLORS: Record<ExerciseCategory, { bg: string; text: string }> = {
  attb: { bg: "bg-zinc-100", text: "text-zinc-700" },
  esquemas_taticos: { bg: "bg-pink-100", text: "text-pink-700" },
  estrategia: { bg: "bg-indigo-100", text: "text-indigo-700" },
  finalizacao: { bg: "bg-red-100", text: "text-red-700" },
  organizacao_defensiva: { bg: "bg-slate-100", text: "text-slate-700" },
  organizacao_ofensiva: { bg: "bg-cyan-100", text: "text-cyan-700" },
  principios_de_jogo: { bg: "bg-purple-100", text: "text-purple-700" },
  qualidades_fisicas: { bg: "bg-lime-100", text: "text-lime-700" },
  transicao_defensiva: { bg: "bg-orange-100", text: "text-orange-700" },
  transicao_ofensiva: { bg: "bg-amber-100", text: "text-amber-700" },
};

export const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS) as [
  ExerciseCategory,
  string,
][];

export const ORIENTATION_OPTIONS = [
  { value: "recovery", label: "Recuperação" },
  { value: "strength", label: "Força Máxima" },
  { value: "endurance", label: "Resistência" },
  { value: "speed", label: "Velocidade" },
  { value: "flexibility", label: "Flexibilidade" },
  { value: "other", label: "Outro" },
] as const;

export const REGIME_OPTIONS = [
  { value: "aerobic", label: "Aeróbico" },
  { value: "anaerobic_lactic", label: "Anaeróbico Láctico" },
  { value: "anaerobic_alactic", label: "Anaeróbico Aláctico" },
] as const;
