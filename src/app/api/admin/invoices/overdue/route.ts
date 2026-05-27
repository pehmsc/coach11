import { NextResponse } from "next/server";
import { getSuperUserAccess } from "@/lib/auth/super-user.server";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const runtime = "nodejs";

export interface OverdueInvoiceRow {
  id: string;
  club_id: string;
  club_name: string;
  club_slug: string;
  club_tier: "individual" | "standard" | "pro";
  invoice_number: string;
  amount_cents: number;
  currency: string;
  issued_at: string;
  due_date: string;
  days_overdue: number;
  notes: string | null;
}

export async function GET() {
  try {
    const access = await getSuperUserAccess();
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const today = new Date().toISOString().slice(0, 10);

    const { data, error } = await access.admin
      .from("invoices")
      .select(
        "id, club_id, invoice_number, amount_cents, currency, issued_at, due_date, notes, clubs!inner(name, slug, tier)",
      )
      .eq("status", "issued")
      .lt("due_date", today)
      .order("due_date", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: `Erro ao carregar atrasos: ${error.message}` },
        { status: 500 },
      );
    }

    const todayDate = new Date(`${today}T00:00:00.000Z`);
    const rows: OverdueInvoiceRow[] = (data ?? []).map((row) => {
      const club = row.clubs as unknown as {
        name: string;
        slug: string;
        tier: "individual" | "standard" | "pro";
      };
      const due = new Date(`${row.due_date}T00:00:00.000Z`);
      const daysOverdue = Math.floor(
        (todayDate.getTime() - due.getTime()) / 86_400_000,
      );
      return {
        id: row.id,
        club_id: row.club_id,
        club_name: club.name,
        club_slug: club.slug,
        club_tier: club.tier,
        invoice_number: row.invoice_number,
        amount_cents: row.amount_cents,
        currency: row.currency,
        issued_at: row.issued_at,
        due_date: row.due_date,
        days_overdue: daysOverdue,
        notes: row.notes,
      };
    });

    // Agregados para summary
    const totalCents = rows.reduce((s, r) => s + r.amount_cents, 0);
    const clubsAffected = new Set(rows.map((r) => r.club_id)).size;
    const buckets = {
      "0-7": rows.filter((r) => r.days_overdue <= 7).length,
      "8-15": rows.filter((r) => r.days_overdue > 7 && r.days_overdue <= 15)
        .length,
      "16-30": rows.filter((r) => r.days_overdue > 15 && r.days_overdue <= 30)
        .length,
      "30+": rows.filter((r) => r.days_overdue > 30).length,
    };

    return NextResponse.json({
      success: true,
      rows,
      summary: {
        total_count: rows.length,
        total_amount_cents: totalCents,
        clubs_affected: clubsAffected,
        buckets,
      },
    });
  } catch (error) {
    return respondInternalError("api.admin.invoices.overdue.get", error);
  }
}
