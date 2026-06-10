import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteAgeGroupCascade } from "@/lib/team/delete-age-group";

export interface DeleteClubDataResult {
  deletedAgeGroupCount: number;
}

/**
 * Elimina todos os dados operacionais de um clube: todos os escaloes em
 * cascata (treinos, jogos, competicoes, atletas e storage associado) e as
 * club_memberships do clube.
 *
 * Extraida 1:1 do DELETE /api/club (danger zone) para ser partilhada com o
 * cron de purga RGPD. Garantias herdadas:
 * - NUNCA apaga a linha de clubs (invoices.club_id e RESTRICT — retencao
 *   legal de faturacao) nem dados Stripe.
 * - NUNCA apaga profiles nem contas auth; memberships residuais noutros
 *   clubes sao protegidas dentro de deleteAgeGroupCascade.
 */
export async function deleteClubDataCascade(
  admin: SupabaseClient,
  clubId: string,
): Promise<DeleteClubDataResult> {
  const { data: ageGroups, error } = await admin
    .from("age_groups")
    .select("id")
    .eq("club_id", clubId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(
      `Erro ao carregar escaloes do clube para apagar: ${error.message || "falha desconhecida"}`,
    );
  }

  const groups = ageGroups || [];

  for (const group of groups) {
    if (typeof group.id === "string") {
      await deleteAgeGroupCascade(admin, group.id, {
        retainClubMembershipProfileIds: [],
      });
    }
  }

  await admin.from("club_memberships").delete().eq("club_id", clubId);

  return { deletedAgeGroupCount: groups.length };
}
