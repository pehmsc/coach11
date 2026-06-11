import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isBetaAllowed } from "@/lib/auth/beta-access.server";
import {
  isSuperCoordinatorEmail,
  normalizeEmail,
} from "@/lib/auth/beta-access";
import { upsertInviteAuthCredentials } from "@/lib/auth/invite-auth-user";
import { passwordSchema } from "@/lib/auth/password-schema";
import { sendWelcomeEmail } from "@/lib/email/send-welcome-email";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const runtime = "nodejs";

const RegisterSchema = z.object({
  fullName: z.string().min(1).max(120),
  email: z.string().email().max(254),
  password: passwordSchema,
});

function mapRegisterError(message: string) {
  const normalized = message.toLowerCase();

  // Nota de segurança (SEC-06): não confirmar explicitamente que o email existe.
  // Usar mensagem genérica para prevenir enumeração de contas via timing ou conteúdo.
  if (
    normalized.includes("already registered") ||
    normalized.includes("already been registered") ||
    normalized.includes("user already registered")
  ) {
    return {
      status: 409,
      error: "Não foi possível criar a conta. Verifica os dados ou tenta iniciar sessão.",
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

    try {
      await upsertInviteAuthCredentials(admin, {
        email,
        password: parsed.data.password,
        fullName,
        role: resolvedRole,
      });
    } catch (error) {
      const mapped = mapRegisterError(
        error instanceof Error ? error.message : String(error),
      );
      return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    }

    // Email de boas-vindas (soft-fail — nao bloqueia o registo se Resend falhar)
    await sendWelcomeEmail(email, fullName).catch(() => null);

    return NextResponse.json({
      success: true,
      email,
      role: resolvedRole,
    });
  } catch (error) {
    return respondInternalError("api.auth.register.post", error);
  }
}
