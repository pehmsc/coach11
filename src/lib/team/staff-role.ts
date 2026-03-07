export const AGE_GROUP_STAFF_ROLES = ["coach", "assistant_coach"] as const;

export type AgeGroupStaffRole = (typeof AGE_GROUP_STAFF_ROLES)[number];

export const AGE_GROUP_STAFF_ROLE_LABELS: Record<AgeGroupStaffRole, string> = {
  coach: "Treinador Principal",
  assistant_coach: "Treinador Adjunto",
};

export function isAgeGroupStaffRole(value: unknown): value is AgeGroupStaffRole {
  return value === "coach" || value === "assistant_coach";
}

export function normalizeAgeGroupStaffRole(
  value: unknown,
): AgeGroupStaffRole | null {
  if (typeof value !== "string") return null;

  const role = value.trim();
  if (role === "head_coach") return "coach";
  return isAgeGroupStaffRole(role) ? role : null;
}

export function getStaffRoleLabel(value: string | null | undefined) {
  if (value === "coordinator") return "Coordenador";
  if (value === "staff") return "Equipa técnica";

  const normalized = normalizeAgeGroupStaffRole(value);
  if (normalized) return AGE_GROUP_STAFF_ROLE_LABELS[normalized];

  if (!value) return "Utilizador";
  return value;
}
