import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import type { Invoice } from "@/types/database";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
    }

    // RLS filtra automaticamente — user so ve facturas dos clubes que gere
    // (policy invoices_club_manager_select via user_can_manage_club).
    const { data, error } = await supabase
      .from("invoices")
      .select(
        "id, club_id, invoice_number, period_start, period_end, issued_at, due_date, amount_cents, currency, status, paid_at, pdf_path, notes, created_at, created_by, updated_at",
      )
      .order("issued_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: `Erro ao carregar facturas: ${error.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      invoices: (data ?? []) as Invoice[],
    });
  } catch (error) {
    return respondInternalError("api.club.invoices.get", error);
  }
}
