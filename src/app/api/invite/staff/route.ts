import { createClient } from "@/lib/supabase/server";
import { Resend } from "resend";
import { NextResponse } from "next/server";
import { z } from "zod";
import { checkInviteSendLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

function generateCode(length = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => chars[b % chars.length]).join("");
}

const StaffInviteSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().max(254),
  phone: z.string().max(20).nullable().optional(),
  role: z.enum(["coach", "assistant_coach", "coordinator"]),
});

const roleLabel: Record<string, string> = {
  coach: "Treinador Principal",
  assistant_coach: "Treinador Adjunto",
  coordinator: "Coordenador",
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // 🔐 Autenticação
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    // 🚦 Rate limiting: máx 5 convites por utilizador em 15 minutos
    const rateLimitExceeded = await checkInviteSendLimit(supabase, user.id);
    if (rateLimitExceeded) {
      return NextResponse.json(
        { error: "Demasiados pedidos. Tenta mais tarde." },
        { status: 429 },
      );
    }

    // 🏟 Buscar escalão do coordinator
    const { data: ageGroup, error: ageGroupError } = await supabase
      .from("age_groups")
      .select("id, name, club_name")
      .eq("coordinator_id", user.id)
      .single();

    if (ageGroupError || !ageGroup) {
      return NextResponse.json(
        { error: "Escalão não encontrado" },
        { status: 404 },
      );
    }

    // 📩 Validar dados do convite
    const body = await request.json().catch(() => null);
    const parsed = StaffInviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos.", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { firstName, lastName, email, phone, role } = parsed.data;

    // 🔑 Gerar código único
    let inviteCode = generateCode();
    let attempts = 0;

    while (attempts < 5) {
      const { data: existing } = await supabase
        .from("staff_invites")
        .select("id")
        .eq("invite_code", inviteCode)
        .maybeSingle();

      if (!existing) break;

      inviteCode = generateCode();
      attempts++;
    }

    // 💾 Guardar convite na DB
    const { error: dbError } = await supabase.from("staff_invites").insert({
      age_group_id: ageGroup.id,
      invited_by: user.id,
      first_name: firstName,
      last_name: lastName,
      email,
      phone: phone || null,
      role,
      invite_code: inviteCode,
    });

    if (dbError) {
      console.error("Erro ao criar convite:", dbError);
      return NextResponse.json(
        { error: "Erro ao criar convite" },
        { status: 500 },
      );
    }

    // 👤 Nome do coordenador
    let coordinatorName = "O coordenador";

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.full_name) {
      coordinatorName = profile.full_name;
    } else if (user.user_metadata?.full_name) {
      coordinatorName = user.user_metadata.full_name;
    }

    // 🔗 URL registo
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    const host =
      request.headers.get("x-forwarded-host") ?? request.headers.get("host");

    const appUrl = host
      ? `${proto}://${host}`
      : process.env.NEXT_PUBLIC_APP_URL || "https://coach11.vercel.app";

    const inviteUrl = `${appUrl}/invite?code=${inviteCode}&email=${encodeURIComponent(email)}`;

    // 📧 Configuração Resend
    if (!process.env.RESEND_API_KEY) {
      console.error("RESEND_API_KEY não definida.");
      return NextResponse.json({
        success: true,
        inviteCode,
        emailSent: false,
        warning: "Convite criado mas email não enviado (API key em falta).",
      });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    const fromEmail =
      process.env.RESEND_FROM_EMAIL || "Coach11 <noreply@befirstrs.com>";

    // ✉️ Enviar email
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: fromEmail,
      to: [email],
      subject: `Convite para juntar ao ${ageGroup.club_name} — ${ageGroup.name}`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;padding:20px;">
          <div style="max-width:480px;margin:auto;background:#ffffff;border-radius:16px;overflow:hidden;">
            <div style="background:#0f172a;padding:28px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:800;">
                COACH<span style="color:#34d399;">11</span>
              </h1>
            </div>
            <div style="padding:32px;">
              <p>Olá, <strong>${firstName}</strong>!</p>
              <p><strong>${coordinatorName}</strong> convidou-te para:</p>
              <p style="font-weight:600;">${ageGroup.club_name} · ${ageGroup.name}</p>
              <p>Função: ${roleLabel[role] || role}</p>
              <div style="margin:20px 0;padding:16px;border:2px dashed #cbd5e1;border-radius:12px;text-align:center;">
                <span style="font-size:24px;font-weight:800;letter-spacing:6px;">
                  ${inviteCode}
                </span>
              </div>
              <a href="${inviteUrl}"
                style="display:block;background:#059669;color:white;text-decoration:none;text-align:center;padding:12px;border-radius:10px;">
                Criar conta e aceitar convite →
              </a>
            </div>
          </div>
        </div>
      `,
    });

    if (emailError) {
      console.error("Resend error:", emailError);
      return NextResponse.json({
        success: true,
        inviteCode,
        emailSent: false,
        warning: "Convite criado mas email não enviado.",
      });
    }

    console.log("Email enviado:", emailData?.id);

    return NextResponse.json({
      success: true,
      inviteCode,
      emailSent: true,
    });
  } catch (err) {
    console.error("Erro em invite/staff POST:", err);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 },
    );
  }
}
