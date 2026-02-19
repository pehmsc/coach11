import { createClient } from "@/lib/supabase/server";
import { Resend } from "resend";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function generateCode(length = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(
    { length },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
}

const roleLabel: Record<string, string> = {
  coach: "Treinador Principal",
  assistant_coach: "Treinador Adjunto",
  coordinator: "Coordenador",
};

export async function POST(request: Request) {
  const supabase = await createClient();

  // 1) Auth
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    console.error("Supabase auth error:", authError);
  }
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  // 2) Buscar escalão do coordinator
  const { data: ageGroup, error: ageGroupError } = await supabase
    .from("age_groups")
    .select("id, name, club_name")
    .eq("coordinator_id", user.id)
    .single();

  if (ageGroupError) {
    console.error("Erro ao buscar ageGroup:", ageGroupError);
  }

  if (!ageGroup) {
    return NextResponse.json(
      { error: "Escalão não encontrado" },
      { status: 404 },
    );
  }

  // 3) Dados do convite
  let payload: any;
  try {
    payload = await request.json();
  } catch (e) {
    return NextResponse.json(
      { error: "JSON inválido no body" },
      { status: 400 },
    );
  }

  const { firstName, lastName, email, phone, role } = payload ?? {};

  if (!firstName || !lastName || !email || !role) {
    return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
  }

  // 4) Gerar código único
  let inviteCode = generateCode();
  let attempts = 0;

  while (attempts < 5) {
    const { data: existing, error: existsError } = await supabase
      .from("staff_invites")
      .select("id")
      .eq("invite_code", inviteCode)
      .maybeSingle();

    if (existsError) {
      console.error("Erro a verificar código existente:", existsError);
      // Se falhar a verificação, não vamos bloquear a criação — mas regista.
      break;
    }

    if (!existing) break;

    inviteCode = generateCode();
    attempts++;
  }

  // 5) Guardar convite na DB
  const { data: invite, error: dbError } = await supabase
    .from("staff_invites")
    .insert({
      age_group_id: ageGroup.id,
      invited_by: user.id,
      first_name: firstName,
      last_name: lastName,
      email,
      phone: phone || null,
      role,
      invite_code: inviteCode,
    })
    .select()
    .single();

  if (dbError) {
    console.error("Erro ao criar convite:", dbError);
    return NextResponse.json(
      { error: "Erro ao criar convite" },
      { status: 500 },
    );
  }

  // 6) Nome do coordinator
  let coordinatorName = "O coordenador";

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("Erro ao buscar profile:", profileError);
  }

  if (profile?.full_name) {
    coordinatorName = profile.full_name;
  } else if (user.user_metadata?.full_name) {
    coordinatorName = user.user_metadata.full_name;
  }

  // 7) URLs
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://coach11.vercel.app";
  const registerUrl = `${appUrl}/signup?code=${inviteCode}&email=${encodeURIComponent(email)}`;

  // 8) Resend config
  const apiKeyExists = !!process.env.RESEND_API_KEY;
  const configuredFrom = process.env.RESEND_FROM_EMAIL;

  // LOGS úteis (não expõe a key)
  console.log("RESEND_API_KEY exists?", apiKeyExists);
  console.log("RESEND_FROM_EMAIL:", configuredFrom || "(not set)");
  console.log("Inviting:", email);

  if (!apiKeyExists) {
    console.error("RESEND_API_KEY não definida no ambiente (Vercel env vars).");
    return NextResponse.json({
      success: true,
      inviteCode,
      emailSent: false,
      warning:
        "Convite criado mas email não enviado (RESEND_API_KEY em falta). Partilha o código manualmente.",
    });
  }

  // Para reduzir falhas enquanto validas domínio:
  // - Se RESEND_FROM_EMAIL existir, usa
  // - Senão, usa onboarding@resend.dev (modo teste, super fiável)
  const fromEmail = configuredFrom || "Coach11 <onboarding@resend.dev>";

  const resend = new Resend(process.env.RESEND_API_KEY);

  // 9) Enviar email
  try {
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: fromEmail,
      to: [email],
      subject: `Convite para juntar ao ${ageGroup.club_name} — ${ageGroup.name}`,
      html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;margin:0;padding:20px;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:#0f172a;padding:28px 32px;text-align:center;">
      <h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:800;letter-spacing:-0.5px;">
        COACH<span style="color:#34d399;">11</span>
      </h1>
    </div>

    <div style="padding:32px;">
      <p style="color:#64748b;font-size:14px;margin:0 0 8px;">Olá, ${firstName}!</p>
      <h2 style="color:#0f172a;font-size:20px;font-weight:700;margin:0 0 16px;">
        Foste convidado para a equipa técnica
      </h2>

      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;margin-bottom:24px;">
        <p style="color:#166534;font-size:14px;margin:0 0 4px;">
          <strong>${coordinatorName}</strong> convidou-te para:
        </p>
        <p style="color:#15803d;font-size:16px;font-weight:600;margin:0;">
          ${ageGroup.club_name} · ${ageGroup.name}
        </p>
        <p style="color:#166534;font-size:13px;margin:4px 0 0;">
          Função: ${roleLabel[role] || role}
        </p>
      </div>

      <div style="text-align:center;margin-bottom:24px;">
        <p style="color:#64748b;font-size:13px;margin:0 0 8px;">O teu código de convite:</p>
        <div style="background:#f8fafc;border:2px dashed #cbd5e1;border-radius:12px;padding:16px;display:inline-block;">
          <span style="font-family:'Courier New',monospace;font-size:28px;font-weight:800;color:#0f172a;letter-spacing:6px;">
            ${inviteCode}
          </span>
        </div>
      </div>

      <a href="${registerUrl}"
         style="display:block;background:#059669;color:#ffffff;text-decoration:none;text-align:center;padding:14px 24px;border-radius:12px;font-weight:600;font-size:16px;margin-bottom:16px;">
        Criar conta e aceitar convite →
      </a>

      <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0;">
        Ou usa o código manualmente ao registares-te.
      </p>
    </div>

    <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
      <p style="color:#94a3b8;font-size:11px;text-align:center;margin:0;">
        Este convite foi enviado por ${coordinatorName} através da plataforma Coach11.
        Se não esperavas este email, podes ignorá-lo.
      </p>
    </div>
  </div>
</body>
</html>`,
    });

    if (emailError) {
      console.error("Resend error full:", JSON.stringify(emailError, null, 2));
      return NextResponse.json({
        success: true,
        inviteCode,
        emailSent: false,
        warning:
          "Convite criado mas email não enviado. Partilha o código manualmente.",
      });
    }

    console.log("Resend sent:", emailData?.id);

    return NextResponse.json({
      success: true,
      inviteCode,
      emailSent: true,
      emailId: emailData?.id,
    });
  } catch (err) {
    console.error("Email send exception:", err);
    return NextResponse.json({
      success: true,
      inviteCode,
      emailSent: false,
      warning:
        "Convite criado mas email não enviado. Partilha o código manualmente.",
    });
  }
}
