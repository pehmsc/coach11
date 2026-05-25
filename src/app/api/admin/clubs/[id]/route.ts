import { NextResponse } from "next/server";
import { z } from "zod";
import { getSuperUserAccess } from "@/lib/auth/super-user.server";
import { parseBody } from "@/lib/http/validate";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const runtime = "nodejs";

export type AdminClubFull = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  tier: "individual" | "standard" | "pro";
  plan_type: "individual" | "club";
  legal_name: string | null;
  nif: string | null;
  billing_address: string | null;
  billing_email: string | null;
  country: string;
  expected_age_groups_count: number | null;
  expected_players_count: number | null;
  expected_users_count: number | null;
  pending_coordinator_name: string | null;
  pending_coordinator_email: string | null;
  pending_coordinator_phone: string | null;
  pending_coordinator_invite_sent_at: string | null;
  notes: string | null;
  created_at: string;
};

const TierEnum = z.enum(["individual", "standard", "pro"]);

const UpdateClubSchema = z
  .object({
    // Dados do clube
    name: z.string().trim().min(2, "Nome demasiado curto.").max(150).optional(),
    slug: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u, "Slug invalido.")
      .optional(),
    tier: TierEnum.optional(),
    legal_name: z.string().trim().min(2).max(200).nullable().optional(),
    nif: z.string().trim().min(3).max(30).nullable().optional(),
    billing_address: z.string().trim().min(3).max(500).nullable().optional(),
    billing_email: z.string().email().max(254).nullable().optional(),
    country: z.string().trim().length(2).optional(),
    logo_url: z.string().url().max(500).nullable().optional(),

    // Coordenador pendente
    pending_coordinator_name: z.string().trim().min(2).max(150).nullable().optional(),
    pending_coordinator_email: z.string().email().max(254).nullable().optional(),
    pending_coordinator_phone: z.string().trim().min(3).max(40).nullable().optional(),

    // Estimativas
    expected_age_groups_count: z.number().int().min(1).max(100).nullable().optional(),
    expected_players_count: z.number().int().min(1).max(10000).nullable().optional(),
    expected_users_count: z.number().int().min(1).max(10000).nullable().optional(),

    // Notas
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const access = await getSuperUserAccess();
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const { id } = await context.params;

    const { data, error } = await access.admin
      .from("clubs")
      .select(
        "id, name, slug, logo_url, tier, plan_type, legal_name, nif, billing_address, billing_email, country, expected_age_groups_count, expected_players_count, expected_users_count, pending_coordinator_name, pending_coordinator_email, pending_coordinator_phone, pending_coordinator_invite_sent_at, notes, created_at",
      )
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "Erro ao carregar clube." },
        { status: 500 },
      );
    }
    if (!data) {
      return NextResponse.json({ error: "Clube nao encontrado." }, { status: 404 });
    }

    const tier =
      data.tier === "individual" || data.tier === "pro"
        ? data.tier
        : "standard";
    const planType: "individual" | "club" =
      data.plan_type === "individual" ? "individual" : "club";

    const club: AdminClubFull = {
      ...data,
      tier,
      plan_type: planType,
    } as AdminClubFull;

    return NextResponse.json({ success: true, club });
  } catch (error) {
    return respondInternalError("api.admin.clubs.[id].get", error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const access = await getSuperUserAccess();
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const { id } = await context.params;

    // Confirma que o clube existe
    const { data: existing, error: existingError } = await access.admin
      .from("clubs")
      .select("id, slug")
      .eq("id", id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        { error: "Erro ao validar clube." },
        { status: 500 },
      );
    }
    if (!existing) {
      return NextResponse.json({ error: "Clube nao encontrado." }, { status: 404 });
    }

    const parsed = await parseBody(request, UpdateClubSchema);
    if (parsed.error) return parsed.error;
    const data = parsed.data;

    // Conflito de slug (se mudar)
    if (data.slug && data.slug !== existing.slug) {
      const { data: slugConflict } = await access.admin
        .from("clubs")
        .select("id")
        .eq("slug", data.slug)
        .neq("id", id)
        .maybeSingle();
      if (slugConflict) {
        return NextResponse.json(
          { error: `Slug ja em uso: ${data.slug}.` },
          { status: 409 },
        );
      }
    }

    // plan_type sincroniza com tier (Standard/Pro -> 'club'; Individual -> 'individual')
    const updatePayload: Record<string, unknown> = { ...data };
    if (data.tier) {
      updatePayload.plan_type = data.tier === "individual" ? "individual" : "club";
    }
    // Normalizar emails para lowercase
    if (typeof data.billing_email === "string") {
      updatePayload.billing_email = data.billing_email.toLowerCase();
    }
    if (typeof data.pending_coordinator_email === "string") {
      updatePayload.pending_coordinator_email =
        data.pending_coordinator_email.toLowerCase();
    }

    const { error: updateError } = await access.admin
      .from("clubs")
      .update(updatePayload)
      .eq("id", id);

    if (updateError) {
      return NextResponse.json(
        { error: `Erro a actualizar: ${updateError.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return respondInternalError("api.admin.clubs.[id].patch", error);
  }
}
