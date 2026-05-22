import { Resend } from "resend";
import { getCanonicalAppUrl } from "@/lib/config/canonical-app-url";

const ROLE_LABEL: Record<string, string> = {
  club_coordinator: "Coordenador de Clube",
  age_group_coordinator: "Coordenador de Escalão",
  head_coach: "Treinador Principal",
  assistant_coach: "Treinador Adjunto",
  intern_coach: "Treinador Estagiário",
  goalkeeper_coach: "Treinador de Guarda-Redes",
  fitness_coach: "Preparador Físico",
  physiotherapist: "Fisioterapeuta",
  doctor: "Médico",
  analyst: "Analista / Observador",
  team_manager: "Team Manager",
};

export type SendStaffInviteEmailParams = {
  to: string;
  firstName: string;
  inviteCode: string;
  role: string;
  clubName: string;
  ageGroupName: string | null;
  coordinatorName: string;
};

export type SendStaffInviteEmailResult =
  | { sent: true }
  | { sent: false; reason: "missing_api_key" | "send_error"; error?: string };

export async function sendStaffInviteEmail(
  params: SendStaffInviteEmailParams,
): Promise<SendStaffInviteEmailResult> {
  if (!process.env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY não definida.");
    return { sent: false, reason: "missing_api_key" };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromEmail =
    process.env.RESEND_FROM_EMAIL || "Coach11 <noreply@coach11.app>";

  const appUrl = getCanonicalAppUrl();
  const inviteUrl = `${appUrl}/invite?code=${params.inviteCode}&email=${encodeURIComponent(params.to)}`;

  const subject = params.ageGroupName
    ? `Convite para juntar ao ${params.clubName} — ${params.ageGroupName}`
    : `Convite para juntar ao ${params.clubName}`;

  const scopeLine = params.ageGroupName
    ? `${params.clubName} · ${params.ageGroupName}`
    : params.clubName;

  const { error } = await resend.emails.send({
    from: fromEmail,
    to: [params.to],
    subject,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;padding:20px;">
        <div style="max-width:480px;margin:auto;background:#ffffff;border-radius:16px;overflow:hidden;">
          <div style="background:#0f172a;padding:28px;text-align:center;">
            <h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:800;">
              COACH<span style="color:#34d399;">11</span>
            </h1>
          </div>
          <div style="padding:32px;">
            <p>Olá, <strong>${params.firstName}</strong>!</p>
            <p><strong>${params.coordinatorName}</strong> convidou-te para:</p>
            <p style="font-weight:600;">${scopeLine}</p>
            <p>Função: ${ROLE_LABEL[params.role] || params.role}</p>
            <div style="margin:20px 0;padding:16px;border:2px dashed #cbd5e1;border-radius:12px;text-align:center;">
              <span style="font-size:24px;font-weight:800;letter-spacing:6px;">
                ${params.inviteCode}
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

  if (error) {
    console.error("Resend error:", error);
    return { sent: false, reason: "send_error", error: error.message };
  }

  return { sent: true };
}
