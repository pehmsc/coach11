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

export const PERMISSION_TEMPLATES: Record<"principal" | "adjunto" | "estagiario", PermissionTemplate> = {
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

  // 1. Master Admin → always true
  if (userEmail && isMasterAdmin(userEmail)) return true;

  // 2. Coordinator of this age group → always true
  if (await isClubCoordinator(admin, userId, ageGroupId)) return true;

  // 3. Principal Coach → RWED automático em tudo
  if (await isPrincipalCoach(admin, userId, ageGroupId)) return true;

  // 4. Consultar staff_permissions
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
