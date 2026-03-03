import Link from "next/link";
import Image from "next/image";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { ArrowLeft, Clock3, MapPin } from "lucide-react";
import { RichTextContent } from "@/components/content/RichTextContent";
import { LocationMapPreview } from "@/components/maps/LocationMapPreview";
import {
  buildDateTimeFromDateAndTime,
  formatTimeRange,
} from "@/lib/events/time";
import { resolveFormattedAddress, resolveLocationLabel } from "@/lib/location";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolvePublicAccessRequest,
  resolvePublicTrainingId,
} from "@/lib/public-share";

export const dynamic = "force-dynamic";

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

export default async function PublicTrainingDetailPage({
  params,
}: PublicTrainingDetailParams) {
  const { token: publicIdentifier, trainingId: publicTrainingRef } = await params;
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

  if (!access) {
    notFound();
  }

  if (access.paused) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8">
        <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 text-center">
          <h1 className="text-2xl font-bold text-slate-900">
            Acesso temporariamente pausado
          </h1>
          <p className="mt-3 text-sm text-slate-600">
            Acesso temporariamente pausado pelo coordenador.
          </p>
        </div>
      </main>
    );
  }

  const { data: allTrainingRows, error: allTrainingsError } = await admin
    .from("training_sessions")
    .select("id")
    .eq("age_group_id", access.ageGroupId)
    .limit(1000);

  if (allTrainingsError) {
    notFound();
  }

  const resolvedTrainingId = resolvePublicTrainingId(
    access.identifier,
    publicTrainingRef,
    (allTrainingRows || []).map((row) => row.id),
  );

  if (!resolvedTrainingId) {
    notFound();
  }

  const [{ data: training }, { data: ageGroup }] = await Promise.all([
    admin
      .from("training_sessions")
      .select(
        "id, title, session_date, start_time, end_time, location, location_address, formatted_address, latitude, longitude, osm_place_id, location_source, notes, status, image_url",
      )
      .eq("id", resolvedTrainingId)
      .eq("age_group_id", access.ageGroupId)
      .maybeSingle(),
    admin
      .from("age_groups")
      .select("club_name, name")
      .eq("id", access.ageGroupId)
      .maybeSingle(),
  ]);

  if (!training) {
    notFound();
  }

  const trainingLocationLabel = resolveLocationLabel(
    training.location,
    training.formatted_address,
    training.location_address,
  );
  const trainingAddress = resolveFormattedAddress(
    training.formatted_address,
    training.location_address,
  );

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
          training.location_address ||
          training.formatted_address ||
          (training.latitude != null && training.longitude != null)) && (
          <LocationMapPreview
            location={training.location}
            locationAddress={training.location_address}
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
