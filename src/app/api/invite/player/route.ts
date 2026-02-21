import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveUserTeamContext } from "@/lib/auth/team-context";
import { Resend } from "resend";
import { NextResponse } from "next/server";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { playerId } = await request.json();

  if (!playerId) {
    return NextResponse.json(
      { error: "playerId obrigatório" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const context = await resolveUserTeamContext(admin, user.id);

  // Buscar dados do jogador
  const { data: player } = await admin
    .from("players")
    .select("*")
    .eq("id", playerId)
    .single();

  if (!player) {
    return NextResponse.json(
      { error: "Atleta não encontrado" },
      { status: 404 },
    );
  }

  if (!context.accessibleAgeGroupIds.includes(player.age_group_id)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { data: ageGroup } = await admin
    .from("age_groups")
    .select("id, name, club_name")
    .eq("id", player.age_group_id)
    .maybeSingle();

  if (!player.email) {
    return NextResponse.json({ error: "Atleta sem email" }, { status: 400 });
  }

  // Gerar código de convite
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const inviteCode = Array.from(
    { length: 8 },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");

  // Guardar código na DB
  await admin
    .from("players")
    .update({
      invite_code: inviteCode,
      invite_method: "email",
      invite_sent_at: new Date().toISOString(),
    })
    .eq("id", playerId);

  // Buscar nome do coordinator
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const coordinatorName = profile?.full_name || "O teu treinador";
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://coach11.vercel.app";
  const registerUrl = `${appUrl}/register?code=${inviteCode}&email=${encodeURIComponent(player.email)}&type=player`;

  const { error: emailError } = await resend.emails.send({
    from: "Coach11 <noreply@coach11.app>",
    to: [player.email],
    subject: `${coordinatorName} convidou-te para o Coach11`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; margin: 0; padding: 20px;">
        <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
          <div style="background: #0f172a; padding: 28px 32px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 800;">
              COACH<span style="color: #34d399;">11</span>
            </h1>
          </div>

          <div style="padding: 32px;">
            <p style="color: #64748b; font-size: 14px; margin: 0 0 8px;">Olá, ${player.first_name}!</p>
            <h2 style="color: #0f172a; font-size: 20px; font-weight: 700; margin: 0 0 16px;">
              O teu treinador adicionou-te à equipa
            </h2>

            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
              <p style="color: #166534; font-size: 14px; margin: 0 0 4px;">
                <strong>${coordinatorName}</strong> adicionou-te a:
              </p>
              <p style="color: #15803d; font-size: 16px; font-weight: 600; margin: 0;">
                ${ageGroup?.club_name || ""} · ${ageGroup?.name || ""}
              </p>
              <p style="color: #166534; font-size: 13px; margin: 4px 0 0;">
                Cria a tua conta para ver convocatórias, presenças e estatísticas.
              </p>
            </div>

            <div style="text-align: center; margin-bottom: 24px;">
              <p style="color: #64748b; font-size: 13px; margin: 0 0 8px;">O teu código de acesso:</p>
              <div style="background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 16px; display: inline-block;">
                <span style="font-family: 'Courier New', monospace; font-size: 28px; font-weight: 800; color: #0f172a; letter-spacing: 6px;">
                  ${inviteCode}
                </span>
              </div>
            </div>

            <a href="${registerUrl}"
              style="display: block; background: #059669; color: white; text-decoration: none; text-align: center; padding: 14px 24px; border-radius: 12px; font-weight: 600; font-size: 16px; margin-bottom: 16px;">
              Criar conta →
            </a>

            <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 0;">
              Ou usa o código ao registares-te em coach11.app
            </p>
          </div>

          <div style="padding: 16px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0;">
            <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">
              Enviado por ${coordinatorName} através da plataforma Coach11.
            </p>
          </div>
        </div>
      </body>
      </html>
    `,
  });

  if (emailError) {
    console.error("Erro ao enviar email atleta:", emailError);
    return NextResponse.json({
      success: true,
      inviteCode,
      emailSent: false,
      warning: "Código gerado mas email não enviado.",
    });
  }

  return NextResponse.json({ success: true, inviteCode, emailSent: true });
}
