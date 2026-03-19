import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Define cookies HTTP-only com o código de convite pendente.
 * Chamado antes do OAuth redirect para preservar o invite_code
 * através de redirects que não preservam query params.
 */
export async function POST(request: NextRequest) {
  let body: { code?: string; email?: string } | null = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";

  if (!code || code.length < 4 || code.length > 20) {
    return NextResponse.json({ error: "Código inválido" }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });

  response.cookies.set("pending_invite_code", code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60, // 1 hora
    path: "/",
  });

  if (email) {
    response.cookies.set("pending_invite_email", email, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60,
      path: "/",
    });
  }

  return response;
}
