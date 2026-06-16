import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { sendSurveyNotification } from "@/lib/email/send-survey-notification";

// Limite defensivo de tamanho do corpo (~32 KB) — o questionario tem ~25
// perguntas curtas; qualquer coisa muito acima e abuso.
const MAX_BODY_BYTES = 32 * 1024;

const schema = z
  .object({
    payload: z.record(z.string(), z.unknown()),
    email: z.string().trim().max(320).nullable().optional(),
    ua: z.string().max(1000).nullable().optional(),
    // Honeypot: campo que so um bot preenche. Presente e nao-vazio => descarta.
    hp: z.string().max(200).nullable().optional(),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json(
        { ok: false, error: "Corpo demasiado grande" },
        { status: 413 },
      );
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { ok: false, error: "JSON inválido" },
        { status: 400 },
      );
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Dados inválidos" },
        { status: 400 },
      );
    }

    const { payload, email, ua, hp } = parsed.data;

    // Honeypot acionado: finge sucesso sem gravar (nao dar pistas ao bot).
    if (hp && hp.trim().length > 0) {
      return NextResponse.json({ ok: true });
    }

    // payload tem de ser um objeto com pelo menos uma resposta.
    if (Object.keys(payload).length === 0) {
      return NextResponse.json(
        { ok: false, error: "Resposta vazia" },
        { status: 400 },
      );
    }

    // createServerClient (cookies). Sem sessao corre como `anon`; a policy de
    // INSERT anonima (migration 20260616120000) permite. NUNCA createAdminClient.
    const supabase = await createClient();
    const { error } = await supabase.from("survey_responses").insert({
      payload,
      email: email?.trim() || null,
      user_agent: ua ?? null,
    });

    if (error) {
      return NextResponse.json(
        { ok: false, error: "Erro ao guardar" },
        { status: 500 },
      );
    }

    // Notificacao Resend — soft-fail: nunca bloqueia a resposta. Se falhar,
    // o insert ja garantiu o que importa; apenas registamos o aviso.
    try {
      const result = await sendSurveyNotification({ payload, email });
      if (!result.sent && result.warning) {
        console.warn("[survey] notificacao nao enviada:", result.warning);
      }
    } catch (err) {
      console.warn("[survey] notificacao falhou:", err);
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Erro interno" },
      { status: 500 },
    );
  }
}
