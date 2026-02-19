import { createClient } from "@/lib/supabase/server";
import { Resend } from "resend";
import { NextResponse } from "next/server";

const resend = new Resend(process.env.RESEND_API_KEY);

function generateCode(length = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(
    { length },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
}

export async function POST(request: Request) {
  const supabase = await createClient();

  // Verificar autenticação
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  // Buscar escalão do coordinator
  const { data: ageGroup } = await supabase
    .from("age_groups")
    .select("id, name, club_name")
    .eq("coordinator_id", user.id)
    .single();

  if (!ageGroup) {
    return NextResponse.json(
      { error: "Escalão não encontrado" },
      { status: 404 },
    );
  }

  // Dados do convite
  const { firstName, lastName, email, phone, role } = await request.json();

  if (!firstName || !lastName || !email || !role) {
    return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
  }

  // Gerar código único
  let inviteCode = generateCode();
  let attempts = 0;
  while (attempts < 5) {
    const { data: existing } = await supabase
      .from("staff_invites")
      .select("id")
      .eq("invite_code", inviteCode)
      .single();
    if (!existing) break;
    inviteCode = generateCode();
    attempts++;
  }

  // Guardar convite na DB
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

  // Buscar nome do coordinator
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const coordinatorName = profile?.full_name || "O coordenador";
  const roleLabel: Record<string, string> = {
    coach: "Treinador Principal",
    assistant_coach: "Treinador Adjunto",
    coordinator: "Coordenador",
  };
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://coach11.vercel.app";
  const registerUrl = `${appUrl}/register?code=${inviteCode}&email=${encodeURIComponent(email)}`;

  // Enviar email via Resend
  const { error: emailError } = await resend.emails.send({
    from: "Coach11 <noreply@coach11.app>",
    to: [email],
    subject: `Convite para juntar ao ${ageGroup.club_name} — ${ageGroup.name}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; margin: 0; padding: 20px;">
        <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
          <!-- Header -->
          <div style="background: #0f172a; padding: 28px 32px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">
              COACH<span style="color: #34d399;">11</span>
            </h1>
          </div>

          <!-- Conteúdo -->
          <div style="padding: 32px;">
            <p style="color: #64748b; font-size: 14px; margin: 0 0 8px;">Olá, ${firstName}!</p>
            <h2 style="color: #0f172a; font-size: 20px; font-weight: 700; margin: 0 0 16px;">
              Foste convidado para a equipa técnica
            </h2>

            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
              <p style="color: #166534; font-size: 14px; margin: 0 0 4px;">
                <strong>${coordinatorName}</strong> convidou-te para:
              </p>
              <p style="color: #15803d; font-size: 16px; font-weight: 600; margin: 0;">
                ${ageGroup.club_name} · ${ageGroup.name}
              </p>
              <p style="color: #166534; font-size: 13px; margin: 4px 0 0;">
                Função: ${roleLabel[role] || role}
              </p>
            </div>

            <!-- Código de convite -->
            <div style="text-align: center; margin-bottom: 24px;">
              <p style="color: #64748b; font-size: 13px; margin: 0 0 8px;">O teu código de convite:</p>
              <div style="background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 16px; display: inline-block;">
                <span style="font-family: 'Courier New', monospace; font-size: 28px; font-weight: 800; color: #0f172a; letter-spacing: 6px;">
                  ${inviteCode}
                </span>
              </div>
            </div>

            <!-- CTA -->
            <a href="${registerUrl}"
              style="display: block; background: #059669; color: white; text-decoration: none; text-align: center; padding: 14px 24px; border-radius: 12px; font-weight: 600; font-size: 16px; margin-bottom: 16px;">
              Criar conta e aceitar convite →
            </a>

            <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 0;">
              Ou usa o código manualmente ao registares-te em coach11.app
            </p>
          </div>

          <!-- Footer -->
          <div style="padding: 16px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0;">
            <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">
              Este convite foi enviado por ${coordinatorName} através da plataforma Coach11.
              Se não esperavas este email, podes ignorá-lo.
            </p>
          </div>
        </div>
      </body>
      </html>
    `,
  });

  if (emailError) {
    console.error("Erro ao enviar email:", emailError);
    // Não falhar — o convite já foi criado, o código pode ser partilhado manualmente
    return NextResponse.json({
      success: true,
      inviteCode,
      emailSent: false,
      warning:
        "Convite criado mas email não enviado. Partilha o código manualmente.",
    });
  }

  return NextResponse.json({ success: true, inviteCode, emailSent: true });
}
