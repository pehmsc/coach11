import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { ArrowLeft, Clock3, FileText, MapPin, ShieldCheck } from "lucide-react";
import { RichTextContent } from "@/components/content/RichTextContent";
import { LocationMapPreview } from "@/components/maps/LocationMapPreview";
import { OpenMapsButton } from "@/components/maps/OpenMapsButton";
import { resolveFormattedAddress, resolveLocationLabel } from "@/lib/location";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolvePublicGameId,
  resolvePublicShareRequest,
  sanitizePublicPlayerName,
} from "@/lib/public-share";

export const dynamic = "force-dynamic";

type PublicGameDetailParams = {
  params: Promise<{ token: string; gameId: string }>;
};

function formatGameDate(value: string | null | undefined) {
  if (!value) return "Data por definir";

  try {
    return format(parseISO(value), "EEEE, d MMMM yyyy · HH:mm", { locale: pt });
  } catch {
    return value;
  }
}

function gameStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "live":
      return "Ao vivo";
    case "completed":
      return "Terminado";
    case "cancelled":
      return "Cancelado";
    default:
      return "Agendado";
  }
}

export default async function PublicGameDetailPage({
  params,
}: PublicGameDetailParams) {
  const { token, gameId: publicGameRef } = await params;
  const admin = createAdminClient();

  let share;
  try {
    const resolved = await resolvePublicShareRequest(
      admin,
      token,
      await headers(),
    );
    share = resolved?.share ?? null;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "public_share_rate_limited"
    ) {
      return (
        <main className="min-h-screen bg-slate-50 px-4 py-8">
          <div className="mx-auto max-w-3xl rounded-3xl border border-amber-200 bg-white p-8 text-center">
            <h1 className="text-2xl font-bold text-slate-900">
              Demasiados pedidos
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              Este link público está temporariamente limitado. Tenta novamente
              dentro de instantes.
            </p>
          </div>
        </main>
      );
    }

    notFound();
  }

  if (!share) {
    notFound();
  }

  const { data: allGameRows, error: allGamesError } = await admin
    .from("games")
    .select("id")
    .eq("age_group_id", share.age_group_id)
    .limit(200);

  if (allGamesError) {
    notFound();
  }

  const resolvedGameId = resolvePublicGameId(
    token,
    publicGameRef,
    (allGameRows || []).map((row) => row.id),
  );

  if (!resolvedGameId) {
    notFound();
  }

  const [{ data: game }, { data: ageGroup }] = await Promise.all([
    admin
      .from("games")
      .select(
        "id, game_datetime, opponent_name, opponent_short_name, location, location_address, formatted_address, latitude, longitude, osm_place_id, location_source, notes, is_home, status, score_home, score_away",
      )
      .eq("id", resolvedGameId)
      .eq("age_group_id", share.age_group_id)
      .maybeSingle(),
    admin
      .from("age_groups")
      .select("club_name, name")
      .eq("id", share.age_group_id)
      .maybeSingle(),
  ]);

  if (!game) {
    notFound();
  }

  const gameLocationLabel = resolveLocationLabel(
    game.location,
    game.formatted_address,
    game.location_address,
  );
  const gameAddress = resolveFormattedAddress(
    game.formatted_address,
    game.location_address,
  );

  const { data: convocation } = await admin
    .from("convocations")
    .select("id")
    .eq("game_id", resolvedGameId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let sanitizedPlayers: string[] = [];

  if (convocation?.id) {
    const { data: convocationPlayers } = await admin
      .from("convocation_players")
      .select("player_id")
      .eq("convocation_id", convocation.id);

    const playerIds = Array.from(
      new Set(
        (convocationPlayers || [])
          .map((row) => row.player_id)
          .filter((value): value is string => typeof value === "string"),
      ),
    );

    if (playerIds.length > 0) {
      const { data: players } = await admin
        .from("players")
        .select("first_name, last_name")
        .in("id", playerIds);

      sanitizedPlayers = (players || []).map((player) =>
        sanitizePublicPlayerName(player.first_name, player.last_name),
      );
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link
          href={`/public/${token}`}
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft size={16} />
          Voltar ao calendário
        </Link>

        <section className="rounded-3xl bg-slate-900 px-6 py-8 text-white">
          <p className="text-sm uppercase tracking-[0.2em] text-emerald-300">
            {ageGroup?.club_name || "Coach11"} · {ageGroup?.name || "Escalão"}
          </p>
          <h1 className="mt-3 text-3xl font-black">
            {game.is_home ? "vs" : "@"} {game.opponent_name || "Adversário"}
          </h1>
          <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-300">
            <span className="inline-flex items-center gap-1">
              <Clock3 size={14} />
              {formatGameDate(game.game_datetime)}
            </span>
            {gameLocationLabel && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={14} />
                {gameLocationLabel}
              </span>
            )}
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white">
              {gameStatusLabel(game.status)}
            </span>
          </div>
          <div className="mt-5">
            <OpenMapsButton
              location={game.location}
              locationAddress={game.location_address}
              formattedAddress={game.formatted_address}
              latitude={game.latitude}
              longitude={game.longitude}
              accent="slate"
            />
          </div>
        </section>

        {(game.location ||
          game.location_address ||
          game.formatted_address ||
          (game.latitude != null && game.longitude != null)) && (
          <LocationMapPreview
            location={game.location}
            locationAddress={game.location_address}
            formattedAddress={game.formatted_address}
            latitude={game.latitude}
            longitude={game.longitude}
            accent="slate"
            label="Mapa do jogo"
            resolveFallback
          />
        )}

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Jogo
            </p>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <p>
                <strong>Adversário:</strong>{" "}
                {game.opponent_name || "Adversário"}
              </p>
              <p>
                <strong>Casa/Fora:</strong> {game.is_home ? "Casa" : "Fora"}
              </p>
              <p>
                <strong>Estado:</strong> {gameStatusLabel(game.status)}
              </p>
              {gameAddress && (
                <p>
                  <strong>Morada:</strong> {gameAddress}
                </p>
              )}
              {game.status === "completed" && (
                <p>
                  <strong>Resultado:</strong> {game.score_home ?? "-"} -{" "}
                  {game.score_away ?? "-"}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Convocatória
            </p>
            {sanitizedPlayers.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                Sem convocatória disponível.
              </p>
            ) : (
              <div className="mt-3">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  <ShieldCheck size={14} />
                  {sanitizedPlayers.length} convocado
                  {sanitizedPlayers.length !== 1 ? "s" : ""}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {sanitizedPlayers.map((playerName) => (
                    <div
                      key={playerName}
                      className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                    >
                      {playerName}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {game.notes?.trim() && (
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Notas
            </p>
            <div className="mt-3 flex gap-3 text-sm text-slate-700">
              <FileText size={16} className="mt-0.5 text-slate-400" />
              <RichTextContent
                content={game.notes}
                className="min-w-0 flex-1"
              />
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
