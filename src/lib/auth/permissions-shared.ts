/**
 * Constantes de permissões partilhadas entre cliente e servidor.
 * Sem "server-only" — seguro para usar em Client Components.
 */

export type PermissionArea =
  | "players"
  | "trainings"
  | "attendance"
  | "games"
  | "convocations"
  | "live_events"
  | "statistics"
  | "exercises"
  | "documents"
  | "registrations";

export type AreaPermissions = {
  can_read: boolean;
  can_write: boolean;
  can_edit: boolean;
  can_delete: boolean;
};

export type PermissionTemplate = Record<PermissionArea, AreaPermissions>;
export type PermissionTemplateKey = "principal" | "adjunto" | "estagiario";

export const ALL_PERMISSION_AREAS: PermissionArea[] = [
  "players",
  "trainings",
  "attendance",
  "games",
  "convocations",
  "live_events",
  "statistics",
  "exercises",
  "documents",
  "registrations",
];

export const AREA_LABELS: Record<PermissionArea, string> = {
  players: "Plantel",
  trainings: "Treinos",
  attendance: "Presenças",
  games: "Jogos",
  convocations: "Convocatórias",
  live_events: "Ao vivo",
  statistics: "Estatísticas",
  exercises: "Exercícios",
  documents: "Documentos",
  registrations: "Inscrições",
};

export const TEMPLATE_LABELS: Record<PermissionTemplateKey, string> = {
  principal: "Principal",
  adjunto: "Adjunto",
  estagiario: "Estagiário",
};

const RWED: AreaPermissions = { can_read: true, can_write: true, can_edit: true, can_delete: true };
const RWE: AreaPermissions = { can_read: true, can_write: true, can_edit: true, can_delete: false };
const RW: AreaPermissions = { can_read: true, can_write: true, can_edit: false, can_delete: false };
const R: AreaPermissions = { can_read: true, can_write: false, can_edit: false, can_delete: false };

export const PERMISSION_TEMPLATES: Record<PermissionTemplateKey, PermissionTemplate> = {
  principal: Object.fromEntries(ALL_PERMISSION_AREAS.map((a) => [a, RWED])) as PermissionTemplate,
  adjunto: {
    players: R,
    trainings: RWE,
    attendance: RWE,
    games: RW,
    convocations: RW,
    live_events: RW,
    statistics: R,
    exercises: RW,
    documents: R,
    registrations: R,
  },
  estagiario: {
    players: R,
    trainings: R,
    attendance: RW,
    games: R,
    convocations: R,
    live_events: R,
    statistics: R,
    exercises: R,
    documents: R,
    registrations: R,
  },
};
