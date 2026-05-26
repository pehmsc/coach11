import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z
  .object({
    email: z.string().email("Email inválido"),
    persona: z.enum(["individual", "club"]).optional(),
    full_name: z.string().trim().min(1).max(120).optional(),
    phone: z.string().trim().min(3).max(40).optional(),
    club_name: z.string().trim().min(1).max(120).optional(),
    message: z.string().trim().min(1).max(2000).optional(),
    source: z.string().trim().min(1).max(60).optional(),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as unknown;
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }

    const supabase = await createClient();
    const { email, persona, full_name, phone, club_name, message, source } =
      parsed.data;

    const { error } = await supabase.from("waitlist").insert({
      email,
      persona: persona ?? null,
      full_name: full_name ?? null,
      phone: phone ?? null,
      club_name: club_name ?? null,
      message: message ?? null,
      source: source ?? "landing_page",
    });

    if (error && error.code !== "23505") {
      // 23505 = unique_violation — tratar como sucesso para não revelar se email já existe
      return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
