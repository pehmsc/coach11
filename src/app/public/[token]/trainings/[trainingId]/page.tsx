import Image from "next/image";
import { unstable_cache } from "next/cache";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { Clock3, MapPin } from "lucide-react";
import { RichTextContent } from "@/components/content/RichTextContent";
import { LocationMapPreview } from "@/components/maps/LocationMapPreview";
import { StickyBackLink } from "@/components/navigation/StickyBackLink";
import { PublicRateLimitedState } from "@/components/public/PublicRateLimitedState";
import {
  buildDateTimeFromDateAndTime,
  formatTimeRange,
} from "@/lib/events/time";
import { resolveFormattedAddress, resolveLocationLabel } from "@/lib/location";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolvePublicAccessGate,
  resolvePublicTrainingId,
} from "@/lib/public-share";

export const revalidate = 30;

type PublicTrainingDetailParams = {
  params: Promise<{ token: string; trainingId: string }>;
};

function formatTrainingDate(
  sessionDate: string | null | undefined,
  startTime: string | null | undefined,
) {
  if (!sessionDate) return "Data por definir";

  const isoValue = buildDateTimeFromDateAndTime(sessionDate, startTime);
  if (!isoValue) return sessionDate;

  try {
    return format(parseISO(isoValue), "EEEE, d MMMM yyyy · HH:mm", {
      locale: pt,
    });
  } catch {
    return sessionDate;
  }
}

function trainingStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "completed":
      return "Concluído";
    case "cancelled":
      return "Cancelado";
    case "live":
      return "A decorrer";
    default:
      return "Agendado";
  }
}

const getPublicTrainingDetailPayload = unstable_cache(
  async (
    ageGroupId: string,
    accessIdentifier: string,
    publicTrainingRef: string,
  ) => {
    const admin = createAdminClient();

    const { data: allTrainingRows, error: allTrainingsError } = await admin
      .from("training_sessions")
      .select("id")
      .eq("age_group_id", ageGroupId)
      .limit(1000);

    if (allTrainingsError) {
      return { training: null, ageGroup: null };
    }

    const resolvedTrainingId = resolvePublicTrainingId(
      accessIdentifier,
      publicTrainingRef,
      (allTrainingRows || []).map((row) => row.id),
    );

    if (!resolvedTrainingId) {
      return { training: null, ageGroup: null };
    }

    const [{ data: training }, { data: ageGroup }] = await Promise.all([
      admin
        .from("training_sessions")
        .select(
          "id, title, session_date, start_time, end_time, location, formatted_address, latitude, longitude, osm_place_id, location_source, notes, status, image_url",
        )
        .eq("id", resolvedTrainingId)
        .eq("age_group_id", ageGroupId)
        .maybeSingle(),
      admin
        .from("age_groups")
        .select("club_name, name")
        .eq("id", ageGroupId)
        .maybeSingle(),
    ]);

    return {
      training,
      ageGroup,
    };
  },
  ["public-training-detail-v2"],
  { revalidate: 30 },
);

export default async function PublicTrainingDetailPage({
  params,
}: PublicTrainingDetailParams) {
  const { token: publicIdentifier, trainingId: publicTrainingRef } = await params;
  const admin = createAdminClient();
  const gate = await resolvePublicAccessGate(admin, publicIdentifier, await headers());

  if (gate.status === 404) {
    notFound();
  }

  if (gate.status === 429) {
    return <PublicRateLimitedState />;
  }

  const access = gate.access;
  const { training, ageGroup } = await getPublicTrainingDetailPayload(
    access.ageGroupId,
    access.identifier,
    publicTrainingRef,
  );

  if (!training) {
    notFound();
  }

  const trainingLocationLabel = resolveLocationLabel(
    training.location,
    training.formatted_address,
  );
  const trainingAddress = resolveFormattedAddress(
    training.formatted_address,
  );

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <StickyBackLink
          href={`/public/${access.identifier}`}
          label="Voltar ao calendário"
          wrapperClassName="-mx-4 bg-slate-50/95 px-4 py-2"
        />

        <section className="rounded-3xl bg-slate-900 px-6 py-8 text-white">
          <p className="text-sm uppercase tracking-[0.2em] text-emerald-300">
            {ageGroup?.club_name || "Coach11"} · {ageGroup?.name || "Escalão"}
          </p>
          <h1 className="mt-3 text-3xl font-black">
            {training.title?.trim() || "Treino"}
          </h1>
          <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-300">
            <span className="inline-flex items-center gap-1">
              <Clock3 size={14} />
              {formatTrainingDate(training.session_date, training.start_time)}
            </span>
            {trainingLocationLabel && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={14} />
                {trainingLocationLabel}
              </span>
            )}
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white">
              {trainingStatusLabel(training.status)}
            </span>
          </div>
        </section>

        {training.image_url && (
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
            <div className="relative h-56 w-full sm:h-72">
              <Image
                src={training.image_url}
                alt={training.title?.trim() || "Imagem do treino"}
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
              Informações
            </p>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <p>
                <strong>Data:</strong>{" "}
                {formatTrainingDate(training.session_date, training.start_time)}
              </p>
              <p>
                <strong>Horário:</strong>{" "}
                {formatTimeRange(training.start_time, training.end_time)}
              </p>
              <p>
                <strong>Estado:</strong> {trainingStatusLabel(training.status)}
              </p>
              {training.location && <p>Local: {training.location}</p>}
              {trainingAddress && (
                <p>
                  <strong>Morada:</strong> {trainingAddress}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Notas
            </p>
            {training.notes?.trim() ? (
              <div className="mt-3 flex gap-3 text-sm text-slate-700">
                <RichTextContent
                  content={training.notes}
                  className="min-w-0 flex-1"
                />
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                Sem notas adicionais para este treino.
              </p>
            )}
          </div>
        </section>

        {(training.location ||
          training.formatted_address ||
          (training.latitude != null && training.longitude != null)) && (
          <LocationMapPreview
            location={training.location}
            formattedAddress={training.formatted_address}
            latitude={training.latitude}
            longitude={training.longitude}
            accent="slate"
            label="Mapa do treino"
            resolveFallback
          />
        )}
      </div>
    </main>
  );
}
