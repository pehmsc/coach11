import { NextResponse } from "next/server";
import { getSuperUserAccess } from "@/lib/auth/super-user.server";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const runtime = "nodejs";

/**
 * Devolve flag `is_super_coordinator` para a sessao autenticada actual.
 * Usado pelo /admin/login para autologin (sem expor a flag a quem nao
 * esta autenticado).
 */
export async function GET() {
  try {
    const access = await getSuperUserAccess();

    if (!access.ok) {
      if (access.status === 401) {
        return NextResponse.json(
          { is_super_coordinator: false, authenticated: false },
          { status: 200 },
        );
      }
      // 403: autenticado mas sem flag.
      return NextResponse.json(
        { is_super_coordinator: false, authenticated: true },
        { status: 200 },
      );
    }

    return NextResponse.json(
      { is_super_coordinator: true, authenticated: true },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return respondInternalError("api.me.super-user.get", error);
  }
}
