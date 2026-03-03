import Link from "next/link";
import Image from "next/image";
import { unstable_cache } from "next/cache";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { ArrowLeft, Clock3, FileText, MapPin, ShieldCheck } from "lucide-react";
import { RichTextContent } from "@/components/content/RichTextContent";
import { LocationMapPreview } from "@/components/maps/LocationMapPreview";
import { PublicRateLimitedState } from "@/components/public/PublicRateLimitedState";
import {
  addMinutesToTime,
  extractTimeFromDateTime,
  formatTimeRange,
} from "@/lib/events/time";
import { resolveFormattedAddress, resolveLocationLabel } from "@/lib/location";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isPublicShareRateLimitedError,
  resolvePublicGameId,
  resolvePublicAccessRequest,
  sanitizePublicPlayerName,
} from "@/lib/public-share";

export const dynamic = "force-dynamic";
export const revalidate = 30;

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

const getPublicGameDetailPayload = unstable_cache(
  async (ageGroupId: string, accessIdentifier: string, publicGameRef: string) => {
    const admin = createAdminClient();

    const { data: allGameRows, error: allGamesError } = await admin
      .from("games")
      .select("id")
      .eq("age_group_id", ageGroupId)
      .limit(200);

    if (allGamesError) {
      return { game: null, ageGroup: null };
    }

    const resolvedGameId = resolvePublicGameId(
      accessIdentifier,
      publicGameRef,
      (allGameRows || []).map((row) => row.id),
    );

    if (!resolvedGameId) {
      return { game: null, ageGroup: null };
    }

    const [{ data: game }, { data: ageGroup }] = await Promise.all([
      admin
        .from("games")
        .select(
          "id, game_datetime, end_time, opponent_name, opponent_short_name, location, location_address, formatted_address, latitude, longitude, osm_place_id, location_source, notes, is_home, status, score_home, score_away, image_url, title",
        )
        .eq("id", resolvedGameId)
        .eq("age_group_id", ageGroupId)
        .maybeSingle(),
      admin
        .from("age_groups")
        .select("club_name, name")
        .eq("id", ageGroupId)
        .maybeSingle(),
    ]);

    return {
      game,
      ageGroup,
    };
  },
  ["public-game-detail-v1"],
  { revalidate: 30 },
);

export default async function PublicGameDetailPage({
  params,
}: PublicGameDetailParams) {
  const { token: publicIdentifier, gameId: publicGameRef } = await params;
  const admin = createAdminClient();

  let access;
  try {
    const resolved = await resolvePublicAccessRequest(
      admin,
      publicIdentifier,
      await headers(),
    );
    access = resolved ?? null;
  } catch (error) {
    if (isPublicShareRateLimitedError(error)) {
      return <PublicRateLimitedState />;
    }

    notFound();
  }

  if (!access) {
    notFound();
  }
  const { game, ageGroup } = await getPublicGameDetailPayload(
    access.ageGroupId,
    access.identifier,
    publicGameRef,
  );

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
  const concentrationTime = extractTimeFromDateTime(game.game_datetime);
  const gameTime = addMinutesToTime(concentrationTime, 60);

  const { data: convocation } = await admin
    .from("convocations")
    .select("id")
    .eq("game_id", game.id)
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
          href={`/public/${access.identifier}`}
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
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-white/10 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200">
                Concentração
              </p>
              <p className="mt-1 text-2xl font-black text-white">
                {concentrationTime || "--:--"}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200">
                Jogo
              </p>
              <p className="mt-1 text-2xl font-black text-white">
                {gameTime || "--:--"}
              </p>
            </div>
          </div>
        </section>

        {game.image_url && (
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
            <div className="relative h-56 w-full sm:h-72">
              <Image
                src={game.image_url}
                alt={game.title?.trim() || game.opponent_name || "Imagem do jogo"}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 768px"
              />
            </div>
          </section>
        )}

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Informação
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
              <p>
                <strong>Horário:</strong>{" "}
                {formatTimeRange(concentrationTime, game.end_time)}
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
              Notas
            </p>
            {game.notes?.trim() ? (
              <div className="mt-3 flex gap-3 text-sm text-slate-700">
                <FileText size={16} className="mt-0.5 text-slate-400" />
                <RichTextContent
                  content={game.notes}
                  className="min-w-0 flex-1"
                />
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                Sem notas adicionais para este jogo.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
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
      </div>
    </main>
  );
}
