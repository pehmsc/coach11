import { NextResponse } from "next/server";
import { z } from "zod";
import { getSuperUserAccess } from "@/lib/auth/super-user.server";
import { parseBody } from "@/lib/http/validate";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const runtime = "nodejs";

const TierEnum = z.enum(["standard", "pro"]);

const CreateClubSchema = z
  .object({
    tier: TierEnum,

    // Dados do clube
    name: z.string().trim().min(2, "Nome demasiado curto.").max(150),
    slug: z
      .string()
      .trim()
      .min(2, "Slug demasiado curto.")
      .max(80)
      .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u, "Slug invalido. Usar minusculas, digitos e hifens."),
    legal_name: z.string().trim().min(2).max(200).nullable().optional(),
    nif: z.string().trim().min(3).max(30),
    billing_address: z.string().trim().min(3).max(500),
    billing_email: z.string().email().max(254).nullable().optional(),
    country: z.string().trim().length(2).default("PT"),
    logo_url: z.string().url().max(500).nullable().optional(),

    // Coordenador / responsavel
    coordinator_name: z.string().trim().min(2).max(150),
    coordinator_email: z.string().email().max(254),
    coordinator_phone: z.string().trim().min(3).max(40),

    // Estimativas (opcionais)
    expected_age_groups_count: z
      .number()
      .int()
      .min(1)
      .max(100)
      .nullable()
      .optional(),
    expected_players_count: z
      .number()
      .int()
      .min(1)
      .max(10000)
      .nullable()
      .optional(),
    expected_users_count: z
      .number()
      .int()
      .min(1)
      .max(10000)
      .nullable()
      .optional(),

    // Notas opcionais do operador
    operator_notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const access = await getSuperUserAccess();
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const parsed = await parseBody(request, CreateClubSchema);
    if (parsed.error) {
      return parsed.error;
    }
    const data = parsed.data;

    // --- Conflito de slug? ---
    const { data: slugConflict } = await access.admin
      .from("clubs")
      .select("id, slug")
      .eq("slug", data.slug)
      .maybeSingle();

    if (slugConflict) {
      return NextResponse.json(
        { error: `Slug ja em uso: ${data.slug}.` },
        { status: 409 },
      );
    }

    // Compose notes block com info do coordenador + notas livres.
    const noteLines: string[] = [];
    noteLines.push("=== Coordenador / responsavel (recolhido no wizard) ===");
    noteLines.push(`Nome: ${data.coordinator_name}`);
    noteLines.push(`Email: ${data.coordinator_email}`);
    noteLines.push(`Telefone: ${data.coordinator_phone}`);
    if (data.operator_notes) {
      noteLines.push("");
      noteLines.push("=== Notas adicionais ===");
      noteLines.push(data.operator_notes);
    }
    const composedNotes = noteLines.join("\n");

    // --- Insert clube ---
    const insertPayload = {
      name: data.name,
      slug: data.slug,
      tier: data.tier,
      // plan_type continua a existir por compatibilidade — qualquer tier
      // != 'individual' mapeia para 'club'.
      plan_type: "club" as const,
      legal_name: data.legal_name ?? null,
      nif: data.nif,
      billing_address: data.billing_address,
      billing_email: data.billing_email ?? null,
      country: data.country,
      logo_url: data.logo_url ?? null,
      expected_age_groups_count: data.expected_age_groups_count ?? null,
      expected_players_count: data.expected_players_count ?? null,
      expected_users_count: data.expected_users_count ?? null,
      notes: composedNotes,
    };

    const { data: created, error: insertError } = await access.admin
      .from("clubs")
      .insert(insertPayload)
      .select("id, slug, name, tier")
      .single();

    if (insertError || !created) {
      return NextResponse.json(
        { error: `Erro a criar clube: ${insertError?.message || "desconhecido"}.` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      club: { id: created.id, slug: created.slug, name: created.name, tier: created.tier },
    });
  } catch (error) {
    return respondInternalError("api.admin.clubs.create.post", error);
  }
}
