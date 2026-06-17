import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { parseBody } from "@/lib/http/validate";
import { getPlanEntitlements } from "@/lib/billing/plan-entitlements";
import { normalizeManualShortName } from "@/lib/football/short-name";

export const runtime = "nodejs";

/**
 * Criacao canonica de escalao — fonte unica usada pelo onboarding, /teams,
 * /team/setup e o modal de recuperacao. Garante DOIS invariantes que os
 * inserts dispersos nao garantiam:
 *  1. club_id derivado do dono (club_memberships, role club_coordinator),
 *     nunca de input do cliente — corrige os escaloes orfaos do /team/setup.
 *  2. entitlement do plano (getPlanEntitlements) — o individual fica em 1
 *     escalao; add-ons futuros sobem o limite num so sitio.
 */
const CreateAgeGroupSchema = z
  .object({
    name: z.string().trim().min(1, "Nome do escalão obrigatório."),
    ageLevel: z.string().trim().min(1, "Escalão obrigatório."),
    footballFormat: z.string().trim().min(1, "Formato de jogo obrigatório."),
    season: z.string().trim().optional(),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const parsed = await parseBody(request, CreateAgeGroupSchema);
    if (parsed.error) return parsed.error;
    const { name, ageLevel, footballFormat } = parsed.data;
    const season = parsed.data.season?.trim() || "2025/2026";

    // 1. Derivar o clube do dono (NUNCA do cliente). Aceita os papeis de
    // coordenacao de clube (mesma nocao do resolveUserTeamContext).
    const { data: membership, error: membershipError } = await supabase
      .from("club_memberships")
      .select("club_id")
      .eq("profile_id", user.id)
      .in("role", ["club_coordinator", "owner", "admin"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (membershipError) {
      return respondInternalError("api.age-groups.create.membership", membershipError);
    }
    if (!membership?.club_id) {
      return NextResponse.json(
        { error: "Sem clube associado para criar escalão." },
        { status: 403 },
      );
    }
    const clubId = membership.club_id;

    const { data: club, error: clubError } = await supabase
      .from("clubs")
      .select("name, short_name, plan_type")
      .eq("id", clubId)
      .maybeSingle();

    if (clubError) {
      return respondInternalError("api.age-groups.create.club", clubError);
    }
    if (!club) {
      return NextResponse.json({ error: "Clube não encontrado." }, { status: 404 });
    }

    // 2. Entitlement do plano: bloquear se ja atingiu o maximo de escaloes.
    // Conta por coordinator_id (boundary funcional club-first; o dono individual
    // coordena todos os seus escaloes), nao por club_id.
    const entitlements = getPlanEntitlements(club.plan_type);
    const { count, error: countError } = await supabase
      .from("age_groups")
      .select("id", { count: "exact", head: true })
      .eq("coordinator_id", user.id);

    if (countError) {
      return respondInternalError("api.age-groups.create.count", countError);
    }
    if ((count ?? 0) >= entitlements.maxAgeGroups) {
      return NextResponse.json(
        {
          error:
            "O teu plano inclui 1 equipa. Equipa adicional como add-on em breve.",
          code: "age_group_limit_reached",
        },
        { status: 403 },
      );
    }

    const clubShortName =
      typeof club.short_name === "string" && club.short_name.trim()
        ? normalizeManualShortName(club.short_name, 5) || null
        : null;

    const { data: ageGroup, error: agError } = await supabase
      .from("age_groups")
      .insert({
        coordinator_id: user.id,
        club_id: clubId,
        club_name: club.name,
        club_short_name: clubShortName,
        name,
        age_level: ageLevel,
        football_format: footballFormat,
        season,
      })
      .select()
      .single();

    if (agError || !ageGroup) {
      return respondInternalError("api.age-groups.create.insert", agError);
    }

    // Equipa padrao associada (necessaria para convocatorias/jogos/treinos).
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .insert({
        age_group_id: ageGroup.id,
        name: `${club.name} ${name}`,
        is_competitive: true,
      })
      .select("id")
      .single();

    if (teamError) {
      return respondInternalError("api.age-groups.create.team", teamError);
    }

    return NextResponse.json({
      success: true,
      ageGroup,
      teamId: team?.id ?? null,
    });
  } catch (error) {
    return respondInternalError("api.age-groups.create", error);
  }
}
