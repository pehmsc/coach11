export const AGE_GROUP_STAFF_ROLES = [
  "head_coach",
  "assistant_coach",
  "intern_coach",
  "goalkeeper_coach",
  "fitness_coach",
  "physiotherapist",
  "doctor",
  "analyst",
  "team_manager",
] as const;

export type AgeGroupStaffRole = (typeof AGE_GROUP_STAFF_ROLES)[number];

export const AGE_GROUP_STAFF_ROLE_LABELS: Record<AgeGroupStaffRole, string> = {
  head_coach: "Treinador Principal",
  assistant_coach: "Treinador Adjunto",
  intern_coach: "Treinador Estagiário",
  goalkeeper_coach: "Treinador de Guarda-Redes",
  fitness_coach: "Preparador Físico",
  physiotherapist: "Fisioterapeuta",
  doctor: "Médico",
  analyst: "Analista / Observador",
  team_manager: "Team Manager",
};

/** Roles que um coordenador de escalão pode convidar. */
export const AGE_COORDINATOR_INVITABLE_ROLES = AGE_GROUP_STAFF_ROLES;

/**
 * Roles completas incluindo coordenadores (para labels genéricos).
 * Coordenadores não são age_group_staff — têm tratamento especial.
 */
export const ALL_STAFF_ROLE_LABELS: Record<string, string> = {
  club_coordinator: "Coordenador de Clube",
  age_coordinator: "Coordenador de Escalão",
  age_group_coordinator: "Coordenador de Escalão",
  ...AGE_GROUP_STAFF_ROLE_LABELS,
};

export function isAgeGroupStaffRole(value: unknown): value is AgeGroupStaffRole {
  return typeof value === "string" && AGE_GROUP_STAFF_ROLES.includes(value as AgeGroupStaffRole);
}

export function normalizeAgeGroupStaffRole(
  value: unknown,
): AgeGroupStaffRole | null {
  if (typeof value !== "string") return null;

  const role = value.trim();
  // Backward compat: antigos "coach" → "head_coach"
  if (role === "coach") return "head_coach";
  if (role === "head_coach") return "head_coach";
  return isAgeGroupStaffRole(role) ? role : null;
}

export function getStaffRoleLabel(value: string | null | undefined) {
  if (value === "coordinator") return "Coordenador";
  if (value === "club_coordinator") return "Coordenador de Clube";
  if (value === "age_coordinator" || value === "age_group_coordinator") return "Coordenador de Escalão";
  if (value === "staff") return "Equipa técnica";

  const normalized = normalizeAgeGroupStaffRole(value);
  if (normalized) return AGE_GROUP_STAFF_ROLE_LABELS[normalized];

  if (!value) return "Utilizador";
  return value;
}
