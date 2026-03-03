import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isBetaAllowed } from "@/lib/auth/beta-access.server";
import {
  isSuperCoordinatorEmail,
  normalizeEmail,
} from "@/lib/auth/beta-access";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const runtime = "nodejs";

const RegisterSchema = z.object({
  fullName: z.string().min(1).max(120),
  email: z.string().email().max(254),
  password: z.string().min(6).max(200),
});

function mapRegisterError(message: string) {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("already registered") ||
    normalized.includes("already been registered") ||
    normalized.includes("user already registered")
  ) {
    return {
      status: 409,
      error: "Já existe uma conta com este email. Entra com a password ou recupera o acesso.",
    };
  }

  if (normalized.includes("password")) {
    return {
      status: 400,
      error: "A password indicada não cumpre os requisitos mínimos.",
    };
  }

  return {
    status: 500,
    error: "Não foi possível criar a conta agora.",
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = RegisterSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos.", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const fullName = parsed.data.fullName.trim();
    const email = normalizeEmail(parsed.data.email);
    const betaAccess = await isBetaAllowed({ email }, admin);

    if (!betaAccess.allowed) {
      return NextResponse.json(
        { error: betaAccess.reason === "no_invite" ? "no_invite" : "beta_access_denied" },
        { status: 403 },
      );
    }

    const resolvedRole =
      betaAccess.invite?.invite_type === "beta_coordinator" ||
      isSuperCoordinatorEmail(email)
        ? "coordinator"
        : "coach";

    const { error } = await admin.auth.admin.createUser({
      email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: resolvedRole,
      },
    });

    if (error) {
      const mapped = mapRegisterError(error.message || "");
      return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    }

    return NextResponse.json({
      success: true,
      email,
      role: resolvedRole,
    });
  } catch (error) {
    return respondInternalError("api.auth.register.post", error);
  }
}
