// Modelo unificado de convocatórias (Sprint 3, pós-migração):
// - games.convocation_status === "published" indica que a convocatória foi confirmada
// - game_squads é a fonte de verdade da lista (internos + externos)
// - convocations table fica apenas para notas legacy (campo `notes`)
// Este componente NUNCA usa `convocations` como gate para mostrar o squad.
import { unstable_cache } from "next/cache";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { Clock3, FileText, MapPin, ShieldCheck } from "lucide-react";
import { RichTextContent } from "@/components/content/RichTextContent";
import { LocationMapPreview } from "@/components/maps/LocationMapPreview";
import { StickyBackLink } from "@/components/navigation/StickyBackLink";
import { Breadcrumb } from "@/components/navigation/Breadcrumb";
import { PublicGameLivePanel } from "@/components/public/PublicGameLivePanel";
import { PublicRateLimitedState } from "@/components/public/PublicRateLimitedState";
import {
  extractTimeFromDateTime,
  formatTimeRange,
} from "@/lib/events/time";
import { resolveFormattedAddress, resolveLocationLabel } from "@/lib/location";
import {
  buildPublicConvocationEntries,
  hasPublicConvocationContent,
  isConvocationPublic,
  type PublicConvocationEntry,
  resolvePublicConvocationNotes,
} from "@/lib/games/public-convocation";
import { getStarterPlayerIdsFromLiveStats } from "@/lib/games/lineup";
import { getPublicGameLiveSnapshot } from "@/lib/games/public-live";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolvePublicGameId,
  resolvePublicAccessGate,
} from "@/lib/public-share";

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

function gameStatusBadgeClassName(status: string | null | undefined) {
  if (status === "live") {
    return "bg-red-500/15 text-red-50 ring-1 ring-red-300/40";
  }

  return "bg-white/10 text-white";
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
          "id, game_datetime, end_time, concentration_time, opponent_name, opponent_short_name, location, formatted_address, latitude, longitude, osm_place_id, location_source, notes, is_home, status, score_home, score_away, image_url, title, convocation_status",
        )
        .eq("id", resolvedGameId)
        .eq("age_group_id", ageGroupId)
        .maybeSingle(),
      admin
        .from("age_groups")
        .select("club_name, club_short_name, name")
        .eq("id", ageGroupId)
        .maybeSingle(),
    ]);

    return {
      game,
      ageGroup,
    };
  },
  ["public-game-detail-v3"],
  { revalidate: 30 },
);

export default async function PublicGameDetailPage({
  params,
}: PublicGameDetailParams) {
  const { token: publicIdentifier, gameId: publicGameRef } = await params;
  const admin = createAdminClient();
  const gate = await resolvePublicAccessGate(admin, publicIdentifier, await headers());

  if (gate.status === 404) {
    notFound();
  }

  if (gate.status === 429) {
    return <PublicRateLimitedState />;
  }

  const access = gate.access;
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
  );
  const gameAddress = resolveFormattedAddress(
    game.formatted_address,
  );
  // game.game_datetime guarda a hora real do jogo. concentration_time
  // (opcional, HH:MM ou HH:MM:SS) e a hora de concentracao definida pelo
  // coach no form. Quando vazia, mostramos apenas o cartao "Jogo".
  const gameTime = extractTimeFromDateTime(game.game_datetime);
  const concentrationTime = game.concentration_time?.slice(0, 5) || null;

  // Gate de privacidade: a convocatória (lista + notas) só é visível
  // publicamente quando o treinador publica (convocation_status = "published").
  // Em rascunho não consultamos game_squads/convocations — a secção mostra
  // "Sem convocatória disponível". Não afecta painel ao vivo nem resultado.
  const convocationPublished = isConvocationPublic(game.convocation_status);

  const initialLiveSnapshot = await getPublicGameLiveSnapshot(admin, {
    id: game.id,
    is_home: game.is_home ?? true,
    status: game.status ?? null,
    score_home: game.score_home ?? null,
    score_away: game.score_away ?? null,
  });

  let convocationPlayers: PublicConvocationEntry[] = [];
  let publicConvocationNotes: string | null = null;

  if (convocationPublished) {
    const { data: convocationNotesRow } = await admin
      .from("convocations")
      .select("notes")
      .eq("game_id", game.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const [
      internalSquadsRes,
      { data: liveRows },
      externalSquadsRes,
    ] = await Promise.all([
      admin
        .from("game_squads")
        .select("player_id, initial_lineup_status")
        .eq("game_id", game.id)
        .not("player_id", "is", null),
      admin
        .from("game_stats_live")
        .select("player_id, status, start_minute")
        .eq("game_id", game.id),
      admin
        .from("game_squads")
        .select("id, external_name, initial_lineup_status, created_at")
        .eq("game_id", game.id)
        .is("player_id", null)
        .order("created_at", { ascending: true }),
    ]);

    const internalSquadsRaw =
      internalSquadsRes.error
        ? []
        : (
            (internalSquadsRes.data || []) as Array<{
              player_id: string | null;
              initial_lineup_status: string | null;
            }>
          );

    const playerIds = Array.from(
      new Set(
        internalSquadsRaw
          .map((row) => row.player_id)
          .filter((value): value is string => typeof value === "string"),
      ),
    );

    const starterIds = getStarterPlayerIdsFromLiveStats(
      ((liveRows || []) as Array<{
        player_id?: string | null;
        status?: string | null;
        start_minute?: number | null;
      }>),
    );

    const externalPlayers = externalSquadsRes.error
      ? []
      : (
          (externalSquadsRes.data || []) as Array<{
            id: string;
            external_name: string | null;
            initial_lineup_status: string | null;
          }>
        ).map((row) => ({
          id: row.id,
          name: row.external_name,
          lineup_status:
            row.initial_lineup_status === "starter" ? "on_field" : "substitute",
        }));

    let squadPlayers: Array<{
      id: string;
      first_name: string | null;
      last_name: string | null;
    }> = [];

    if (playerIds.length > 0) {
      const { data: players } = await admin
        .from("players")
        .select("id, first_name, last_name")
        .in("id", playerIds);

      squadPlayers = (players || []) as Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
      }>;
    }

    convocationPlayers = buildPublicConvocationEntries({
      selectedPlayerIds: playerIds,
      squadPlayers: squadPlayers.map((player) => ({
        id: player.id,
        firstName: player.first_name,
        lastName: player.last_name,
      })),
      starterIds,
      externalPlayers: externalPlayers.map((player) => ({
        id: player.id,
        name: player.name,
        lineupStatus: player.lineup_status,
      })),
    });

    publicConvocationNotes = resolvePublicConvocationNotes({
      convocationNotes: convocationNotesRow?.notes,
      legacyGameNotes: game.notes,
    });
  }

  const hasPublicConvocation = hasPublicConvocationContent({
    playerCount: convocationPlayers.length,
    notes: publicConvocationNotes,
  });

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <StickyBackLink
          href={`/public/${access.identifier}`}
          label="Voltar ao calendário"
          wrapperClassName="-mx-4 bg-slate-50/95 px-4 py-2"
        >
          <Breadcrumb
            items={[
              {
                label: "Calendário",
                href: `/public/${access.identifier}`,
              },
              {
                label: game.opponent_name
                  ? `${game.is_home ? "vs" : "@"} ${game.opponent_name}`
                  : "Jogo",
              },
            ]}
          />
        </StickyBackLink>

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
            <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium ${gameStatusBadgeClassName(game.status)}`}>
              {game.status === "live" ? (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-300 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-200" />
                </span>
              ) : null}
              {gameStatusLabel(game.status)}
            </span>
          </div>
          <div
            className={`mt-5 grid gap-3 ${
              concentrationTime ? "sm:grid-cols-2" : "sm:grid-cols-1"
            }`}
          >
            {concentrationTime && (
              <div className="rounded-2xl bg-white/10 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200">
                  Concentração
                </p>
                <p className="mt-1 text-2xl font-black text-white">
                  {concentrationTime}
                </p>
              </div>
            )}
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

        <PublicGameLivePanel
          apiPath={`/api/public/games/${encodeURIComponent(access.identifier)}/${encodeURIComponent(publicGameRef)}/live`}
          game={{
            game_datetime: game.game_datetime,
            location: game.location,
            is_home: game.is_home,
            opponent_name: game.opponent_name,
            opponent_short_name: game.opponent_short_name,
          }}
          homeClubName={ageGroup?.club_name ?? null}
          homeClubShortName={ageGroup?.club_short_name ?? null}
          initialSnapshot={initialLiveSnapshot}
          coverImageUrl={game.image_url ?? null}
          coverImageAlt={game.title?.trim() || game.opponent_name || "Imagem do jogo"}
        />

        <section>
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
                {formatTimeRange(gameTime, game.end_time)}
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
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Convocatória
          </p>
          {!hasPublicConvocation ? (
            <p className="mt-3 text-sm text-slate-500">
              Sem convocatória disponível.
            </p>
          ) : (
            <div className="mt-3 space-y-4">
              {convocationPlayers.length > 0 ? (
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  <ShieldCheck size={14} />
                  {convocationPlayers.length} convocado
                  {convocationPlayers.length !== 1 ? "s" : ""}
                </div>
              ) : null}

              {publicConvocationNotes ? (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600">
                    <FileText size={14} />
                    Notas da convocatória
                  </div>
                  <RichTextContent
                    content={publicConvocationNotes}
                    className="text-sm text-slate-700"
                  />
                </div>
              ) : null}

              {convocationPlayers.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {convocationPlayers.map((player) => (
                    <div
                      key={player.id}
                      className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                    >
                      {player.name}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </section>

        {(game.location ||
          game.formatted_address ||
          (game.latitude != null && game.longitude != null)) && (
          <LocationMapPreview
            location={game.location}
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
