import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Lê o cookie de convite pendente, tenta fazer redeem via RPC,
 * limpa os cookies, e retorna o resultado.
 *
 * Chamado pelo callback client após OAuth quando o invite_code
 * não está disponível nos searchParams.
 */
export async function POST() {
  const cookieStore = await cookies();
  const inviteCode = cookieStore.get("pending_invite_code")?.value ?? null;
  const inviteEmail = cookieStore.get("pending_invite_email")?.value ?? null;

  // Limpar cookies imediatamente (independentemente do resultado)
  const response = (result: Record<string, unknown>, status = 200) => {
    const res = NextResponse.json(result, { status });
    res.cookies.delete("pending_invite_code");
    res.cookies.delete("pending_invite_email");
    return res;
  };

  if (!inviteCode) {
    return response({ linked: false, source: "no_cookie" });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return response({ linked: false, source: "not_authenticated" }, 401);
  }

  // Tentar resgatar o convite via RPC
  const rpcResult = await supabase.rpc("rpc_redeem_staff_invite_auth", {
    p_invite_code: inviteCode.trim().toUpperCase(),
    p_user_email: inviteEmail || user.email || null,
  });

  if (rpcResult.error) {
    console.error("[consume-pending-cookie] RPC error:", rpcResult.error.message);
    return response({ linked: false, source: "rpc_error", error: rpcResult.error.message });
  }

  const result =
    rpcResult.data && typeof rpcResult.data === "object"
      ? (rpcResult.data as { ok?: boolean; error_code?: string; already_linked?: boolean })
      : null;

  if (!result?.ok) {
    // Convite inválido ou já usado — não bloquear, apenas reportar
    return response({
      linked: false,
      source: "rpc_failed",
      errorCode: result?.error_code ?? "unknown",
    });
  }

  return response({
    linked: true,
    alreadyLinked: result.already_linked ?? false,
    source: "cookie_redeem",
  });
}
