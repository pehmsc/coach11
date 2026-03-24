import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { checkRedeemLimit } from "@/lib/rate-limit";
import { TECHNICAL_STAFF_LIMIT_ERROR_MESSAGE } from "@/lib/team/technical-staff-limit";

type RedeemRpcResult = {
  ok?: boolean;
  error_code?: string;
  already_linked?: boolean;
  role?: string | null;
  age_group_name?: string | null;
  age_group_club_name?: string | null;
};

function mapRedeemError(errorCode: string | undefined) {
  switch (errorCode) {
    case "invite_not_found":
      return {
        body: { error: "Código inválido ou já utilizado" },
        status: 404,
      };
    case "email_mismatch":
      return {
        body: { error: "Este convite foi enviado para outro email." },
        status: 403,
      };
    case "invite_used_by_other":
      return {
        body: { error: "Este código já foi utilizado por outro utilizador." },
        status: 409,
      };
    case "cross_club_forbidden":
    case "cross_age_group_forbidden":
      return {
        body: { error: "Esta conta já está associada a outro escalão." },
        status: 403,
      };
    case "age_group_not_found":
      return {
        body: { error: "Escalão não encontrado. Contacta o coordenador." },
        status: 422,
      };
    case "technical_staff_limit_reached":
      return {
        body: {
          error: `${TECHNICAL_STAFF_LIMIT_ERROR_MESSAGE} O coordenador precisa de libertar a vaga antes de aceitares este convite.`,
        },
        status: 409,
      };
    case "team_create_failed":
      return {
        body: { error: "Erro ao processar convite. Tenta novamente." },
        status: 500,
      };
    case "team_staff_insert_failed":
      return {
        body: { error: "Erro ao aceitar convite. Contacta o coordenador." },
        status: 500,
      };
    case "invite_lookup_failed":
      return {
        body: { error: "Erro ao validar o código de convite." },
        status: 500,
      };
    default:
      return {
        body: { error: "Erro interno ao aceitar o convite." },
        status: 500,
      };
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    if (checkRedeemLimit(user.id)) {
      return NextResponse.json(
        { error: "Demasiados pedidos. Tenta mais tarde." },
        { status: 429 },
      );
    }

    let inviteCode: string | undefined;
    try {
      const body = await request.json();
      inviteCode = body?.inviteCode;
    } catch {
      return NextResponse.json(
        { error: "Payload inválido no pedido." },
        { status: 400 },
      );
    }

    if (!inviteCode || typeof inviteCode !== "string") {
      return NextResponse.json(
        { error: "Código de convite em falta" },
        { status: 400 },
      );
    }

    const code = inviteCode.trim().toUpperCase();

    // Verificar o role do convite para usar o RPC correcto
    const { data: inviteRow } = await supabase
      .from("staff_invites")
      .select("role, age_group_ids")
      .eq("invite_code", code)
      .limit(1)
      .maybeSingle();

    const rpcName =
      inviteRow?.role === "club_coordinator"
        ? "rpc_redeem_club_coordinator_invite"
        : inviteRow?.role === "age_group_coordinator"
          ? "rpc_redeem_age_coordinator_invite"
          : "rpc_redeem_staff_invite_auth";
    const rpcResult = await supabase.rpc(rpcName, {
      p_invite_code: code,
      p_user_email: user.email ?? null,
    });

    if (rpcResult.error) {
      console.error("Erro ao executar rpc_redeem_staff_invite_auth:", rpcResult.error.message);
      return NextResponse.json(
        { error: "Erro interno ao aceitar o convite." },
        { status: 500 },
      );
    }

    const result =
      rpcResult.data && typeof rpcResult.data === "object"
        ? (rpcResult.data as RedeemRpcResult)
        : null;

    if (!result?.ok) {
      const mapped = mapRedeemError(result?.error_code);
      return NextResponse.json(mapped.body, { status: mapped.status });
    }

    const ageGroup =
      result.age_group_name && result.age_group_club_name
        ? { name: result.age_group_name, clubName: result.age_group_club_name }
        : null;

    const role = result.role ?? null;

    if (result.already_linked) {
      return NextResponse.json({
        success: true,
        alreadyLinked: true,
        ageGroup,
        role,
      });
    }

    // Criar entradas adicionais em age_group_staff para multi-escalão
    // O RPC já criou a entrada para age_group_ids[0]; criar as restantes.
    const extraAgeGroupIds = Array.isArray(inviteRow?.age_group_ids)
      ? (inviteRow.age_group_ids as string[]).slice(1)
      : [];

    if (extraAgeGroupIds.length > 0 && result.role && result.role !== "club_coordinator") {
      try {
        const admin = createAdminClient();
        const inserts = extraAgeGroupIds.map((ageGroupId) => ({
          age_group_id: ageGroupId,
          profile_id: user.id,
          role: result.role as string,
        }));
        await admin.from("age_group_staff").insert(inserts);
      } catch {
        // Falha silenciosa — a entrada primária já foi criada pelo RPC
        console.warn("Falha ao criar entradas age_group_staff adicionais para multi-escalão.");
      }
    }

    return NextResponse.json({
      success: true,
      ageGroup,
      role,
    });
  } catch (error) {
    console.error("Erro inesperado em invite/redeem:", error);
    return NextResponse.json(
      { error: "Erro interno ao aceitar o convite." },
      { status: 500 },
    );
  }
}
