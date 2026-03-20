import "server-only";

/**
 * Camada TypeScript de permissões granulares.
 *
 * Mirrors the DB-level RLS helpers defined in migrations:
 *   - public.user_can_read_club_scope(club_id)       → coordinator or staff of club
 *   - public.user_can_write_age_group_scope(age_group_id, club_id) → coordinator or staff of age_group
 *
 * As funções SQL usam security definer + auth.uid() e aplicam-se ao cliente
 * anónimo/autenticado via RLS. Este ficheiro usa o admin client (service role)
 * para verificações antecipadas em API routes — sem necessidade de RPC.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isSuperCoordinatorEmail } from "@/lib/auth/beta-access";

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

export type PermissionOperation = "read" | "write" | "edit" | "delete";

export type AreaPermissions = {
  can_read: boolean;
  can_write: boolean;
  can_edit: boolean;
  can_delete: boolean;
};

export type PermissionTemplate = Record<PermissionArea, AreaPermissions>;

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

const RWED: AreaPermissions = { can_read: true, can_write: true, can_edit: true, can_delete: true };
const RWE: AreaPermissions = { can_read: true, can_write: true, can_edit: true, can_delete: false };
const RW: AreaPermissions = { can_read: true, can_write: true, can_edit: false, can_delete: false };
const R: AreaPermissions = { can_read: true, can_write: false, can_edit: false, can_delete: false };

const RWED_NO_DEL: AreaPermissions = { can_read: true, can_write: true, can_edit: true, can_delete: false };

export const PERMISSION_TEMPLATES: Record<PermissionTemplateKey, PermissionTemplate> = {
  principal: {
    players: RWED_NO_DEL,
    trainings: RWED,
    attendance: RWED,
    games: RWED,
    convocations: RWED,
    live_events: RWED,
    statistics: R,
    exercises: RWED,
    documents: RWED_NO_DEL,
    registrations: R,
  },
  adjunto: {
    players: R,
    trainings: RWE,
    attendance: RWE,
    games: RW,
    convocations: R,
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

export type PermissionTemplateKey = "principal" | "adjunto" | "estagiario";

export const TEMPLATE_LABELS: Record<PermissionTemplateKey, string> = {
  principal: "Treinador Principal",
  adjunto: "Treinador Adjunto",
  estagiario: "Estagiário",
};

export function isMasterAdmin(email: string): boolean {
  return isSuperCoordinatorEmail(email);
}

export async function isClubCoordinator(
  admin: SupabaseClient,
  userId: string,
  ageGroupId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("age_groups")
    .select("id")
    .eq("id", ageGroupId)
    .eq("coordinator_id", userId)
    .maybeSingle();
  return !!data;
}

export async function isPrincipalCoach(
  admin: SupabaseClient,
  userId: string,
  ageGroupId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("age_group_staff")
    .select("id")
    .eq("age_group_id", ageGroupId)
    .eq("profile_id", userId)
    .eq("role", "coach")
    .maybeSingle();
  return !!data;
}

export async function hasPermission(
  admin: SupabaseClient,
  params: {
    userId: string;
    userEmail: string | null | undefined;
    ageGroupId: string;
    area: PermissionArea;
    operation: PermissionOperation;
  },
): Promise<boolean> {
  const { userId, userEmail, ageGroupId, area, operation } = params;

  // 1. Read = sempre true para qualquer staff autenticado do clube
  if (operation === "read") return true;

  // 2. Master Admin → tudo
  if (userEmail && isMasterAdmin(userEmail)) return true;

  // 3. Coordenador de clube (club_memberships) → tudo no clube
  const { data: clubCoord } = await admin
    .from("club_memberships")
    .select("club_id")
    .eq("profile_id", userId)
    .in("role", ["club_coordinator", "coordinator", "owner", "admin"])
    .limit(1)
    .maybeSingle();
  if (clubCoord) return true;

  // 4. Coordenador do escalão → tudo no escalão
  if (await isClubCoordinator(admin, userId, ageGroupId)) return true;

  // 5. Todos os outros (incluindo Principal e Adjuntos) → consultar staff_permissions
  const { data: staffLink } = await admin
    .from("age_group_staff")
    .select("id")
    .eq("age_group_id", ageGroupId)
    .eq("profile_id", userId)
    .maybeSingle();

  if (!staffLink) return false;

  const { data: perm } = await admin
    .from("staff_permissions")
    .select("can_read, can_write, can_edit, can_delete")
    .eq("staff_id", staffLink.id)
    .eq("area", area)
    .maybeSingle();

  if (!perm) return false;

  const colMap: Record<PermissionOperation, string> = {
    read: "can_read",
    write: "can_write",
    edit: "can_edit",
    delete: "can_delete",
  };

  return (perm as Record<string, unknown>)[colMap[operation]] === true;
}

export async function createPermissionsFromTemplate(
  admin: SupabaseClient,
  staffId: string,
  templateKey: PermissionTemplateKey,
): Promise<void> {
  const template = PERMISSION_TEMPLATES[templateKey];
  const rows = ALL_PERMISSION_AREAS.map((area) => ({
    staff_id: staffId,
    area,
    ...template[area],
  }));

  const { error } = await admin
    .from("staff_permissions")
    .upsert(rows, { onConflict: "staff_id,area" });

  if (error) {
    throw new Error(`permissions_template_create_failed:${error.message}`);
  }
}
