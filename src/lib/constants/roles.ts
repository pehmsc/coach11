/**
 * Canonical role label maps for the coach11 platform.
 *
 * club_memberships.role: 'owner' | 'admin' | 'club_coordinator' | 'staff'
 * age_group_staff.role / team_staff.role:
 *   'head_coach' | 'assistant_coach' | 'intern_coach' | 'goalkeeper_coach' |
 *   'fitness_coach' | 'physiotherapist' | 'doctor' | 'analyst' |
 *   'team_manager' | 'age_group_coordinator'
 */

export const CLUB_ROLE_LABELS: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  club_coordinator: "Coordenador de Clube",
  staff: "Staff",
};

export const STAFF_ROLE_LABELS: Record<string, string> = {
  head_coach: "Treinador Principal",
  assistant_coach: "Treinador Adjunto",
  intern_coach: "Treinador Estagiário",
  goalkeeper_coach: "Treinador de Guarda-Redes",
  fitness_coach: "Preparador Físico",
  physiotherapist: "Fisioterapeuta",
  doctor: "Médico",
  analyst: "Analista / Observador",
  team_manager: "Team Manager",
  age_group_coordinator: "Coordenador de Escalão",
};

export const ALL_ROLE_LABELS: Record<string, string> = {
  ...CLUB_ROLE_LABELS,
  ...STAFF_ROLE_LABELS,
};

export function getRoleLabel(role: string): string {
  return ALL_ROLE_LABELS[role] ?? role;
}
