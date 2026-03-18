import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";

const schema = z.object({
  email: z.string().email("Email inválido"),
});

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as unknown;
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Email inválido" }, { status: 400 });
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("waitlist")
      .insert({ email: parsed.data.email });

    if (error && error.code !== "23505") {
      // 23505 = unique_violation — tratar como sucesso para não revelar se email já existe
      return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return respondInternalError("api.waitlist.post", error, { request });
  }
}
