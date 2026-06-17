import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { parseBody } from "@/lib/http/validate";
import {
  deleteUserAvatarStorage,
  listManagedAgeGroups,
  optionalDeleteByEq,
  optionalDeleteByIn,
  optionalUpdateByEq,
} from "@/lib/team/delete-age-group";
import { listClubAgeGroupIds, purgeClubData } from "@/lib/club/purge-club-data";
import { getStripeClient } from "@/lib/stripe/client";

// Stripe SDK exige runtime Node (nao Edge).
export const runtime = "nodejs";

const DeleteAccountSchema = z.object({
  confirmation: z.literal("DELETE_ACCOUNT", "Confirmação inválida para apagar conta."),
});

/**
 * Cancela a subscricao Stripe (imediata) do clube individual. Tolerante: sem
 * sub, sub ja cancelada (resource_missing) ou Stripe indisponivel nao bloqueiam
 * a eliminacao da conta — corre primeiro para a faturacao parar mesmo que um
 * passo seguinte falhe.
 */
async function cancelStripeSubscriptionSafe(subscriptionId: string | null): Promise<void> {
  if (!subscriptionId) return;
  try {
    const stripe = getStripeClient();
    await stripe.subscriptions.cancel(subscriptionId);
  } catch (error) {
    console.warn(
      `[account.delete] cancelamento Stripe falhou (continua): ${
        error instanceof Error ? error.message : "desconhecido"
      }`,
    );
  }
}

/**
 * Limpa apenas os vinculos pessoais de um utilizador que NAO e dono de clube
 * (staff). Nunca toca em dados de escaloes/clube nem em contas de terceiros.
 */
async function deletePersonalLinks(admin: SupabaseClient, userId: string): Promise<void> {
  // Limpar staff_permissions antes de age_group_staff (FK: staff_permissions.staff_id → age_group_staff.id)
  const { data: staffEntries } = await admin
    .from("age_group_staff")
    .select("id")
    .eq("profile_id", userId);
  const staffIds = (staffEntries ?? []).map((s) => s.id);
  if (staffIds.length > 0) {
    await optionalDeleteByIn(admin, "staff_permissions", "staff_id", staffIds);
  }
  await optionalDeleteByEq(admin, "age_group_staff", "profile_id", userId);
  await optionalDeleteByEq(admin, "club_memberships", "profile_id", userId);
  await optionalDeleteByEq(admin, "staff_invites", "profile_id", userId);
  await optionalDeleteByEq(admin, "staff_invites", "invited_by", userId);
  await optionalDeleteByEq(admin, "staff_invites", "accepted_by", userId);
  await optionalDeleteByEq(admin, "beta_invites", "created_by_profile_id", userId);
  await optionalDeleteByEq(admin, "public_share_tokens", "created_by", userId);

  await optionalUpdateByEq(admin, "players", "profile_id", userId, { profile_id: null });
  await optionalUpdateByEq(admin, "training_attendance", "marked_by", userId, {
    marked_by: null,
  });
  await optionalUpdateByEq(admin, "grounds", "created_by", userId, { created_by: null });
  await optionalUpdateByEq(admin, "game_live_checkpoints", "updated_by", userId, {
    updated_by: null,
  });

  await deleteUserAvatarStorage(admin, userId);
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const parsed = await parseBody(request, DeleteAccountSchema);
    if (parsed.error) return parsed.error;

    const admin = createAdminClient();

    // Resolver o clube proprio (owner) a partir de auth.uid() — NUNCA do body.
    const { data: ownerMembership } = await admin
      .from("club_memberships")
      .select("club_id")
      .eq("profile_id", user.id)
      .eq("role", "club_coordinator")
      .limit(1)
      .maybeSingle();

    const ownedClubId = ownerMembership?.club_id ?? null;

    let planType: string | null = null;
    let stripeSubscriptionId: string | null = null;
    if (ownedClubId) {
      const { data: club } = await admin
        .from("clubs")
        .select("plan_type, stripe_subscription_id")
        .eq("id", ownedClubId)
        .maybeSingle();
      planType = typeof club?.plan_type === "string" ? club.plan_type : null;
      stripeSubscriptionId =
        typeof club?.stripe_subscription_id === "string" ? club.stripe_subscription_id : null;
    }

    // --- Tier individual: cascata total. Ordem cross-system pensada para falha
    // recuperavel (nao ha transacao unica): Stripe → Storage/dados → linha de
    // clubs (RPC) → conta auth. Cada passo o mais idempotente possivel. ---
    if (ownedClubId && planType === "individual") {
      // 1. Stripe primeiro (parar faturacao mesmo que algo a seguir falhe).
      await cancelStripeSubscriptionSafe(stripeSubscriptionId);

      // 2+3. Storage + dados via purga RGPD reutilizada. skipClubMembershipsDelete:
      // mantem a membership do owner viva para a RPC derivar o clube de auth.uid();
      // depois cai por cascata ao apagar a linha de clubs.
      const ageGroupIds = await listClubAgeGroupIds(admin, ownedClubId);
      await purgeClubData(admin, ownedClubId, ageGroupIds, {
        skipClubMembershipsDelete: true,
      });
      await deleteUserAvatarStorage(admin, user.id);

      // 4. RPC SECURITY DEFINER: apaga invoices + linha de clubs. Corre com o
      // client de sessao para que auth.uid() exista dentro da funcao.
      const { error: rpcError } = await supabase.rpc("rpc_delete_individual_account");
      if (rpcError) {
        return respondInternalError("api.me.account.delete.rpc", rpcError);
      }

      // 5. Conta auth por ultimo (depois disto a sessao morre; o perfil cai por
      // cascata profiles.id → auth.users).
      const { error: deleteAuthUserError } = await admin.auth.admin.deleteUser(user.id);
      if (deleteAuthUserError) {
        return respondInternalError("api.me.account.delete.auth-user", deleteAuthUserError);
      }

      return NextResponse.json({ success: true });
    }

    // --- Tier clube: auto-eliminacao continua bloqueada (gerida por backoffice). ---
    if (ownedClubId && planType === "club") {
      return NextResponse.json(
        {
          error:
            "As contas de clube são geridas pela equipa Coach11. Contacta o suporte para apagar a conta e os dados do clube.",
        },
        { status: 409 },
      );
    }

    // --- Sem clube proprio: proteger escaloes coordenados (impede apagar a
    // conta e orfanar/cascatear dados de um clube) e, se nao houver, limpar
    // apenas os vinculos pessoais + perfil + conta auth. ---
    const managedAgeGroups = await listManagedAgeGroups(admin, user.id);

    if (managedAgeGroups.length > 0) {
      return NextResponse.json(
        {
          error:
            "Não podes apagar a conta enquanto fores coordenador de um escalão. Apaga primeiro o escalão na área Equipa.",
          managedAgeGroups,
        },
        { status: 409 },
      );
    }

    await deletePersonalLinks(admin, user.id);

    const { error: deleteProfileError } = await admin
      .from("profiles")
      .delete()
      .eq("id", user.id);

    if (deleteProfileError) {
      return respondInternalError("api.me.account.delete.profile", deleteProfileError);
    }

    const { error: deleteAuthUserError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteAuthUserError) {
      return respondInternalError("api.me.account.delete.auth-user", deleteAuthUserError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return respondInternalError("api.me.account.delete", error);
  }
}
