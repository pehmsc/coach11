"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { Loader2, Trash2, Pencil, Copy, Users, AlertCircle, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RichTextContent } from "@/components/content/RichTextContent";
import { LocationMapPreview } from "@/components/maps/LocationMapPreview";
import { StickyBackLink } from "@/components/navigation/StickyBackLink";
import { resolveLocationLabel } from "@/lib/location";
import { portugalDateTimeToUtc } from "@/lib/events/presence-window";
import { useTrainingForm } from "@/lib/hooks/useTrainingForm";
import {
  getTrainingDisplayTitle,
  parseUtNumberInput,
} from "@/lib/trainings/ut-numbering";
import { TrainingFormFieldsComponent } from "@/components/trainings/TrainingFormFields";
import { TrainingCreateModal } from "@/components/trainings/TrainingCreateModal";
import { getAttendanceStatusClasses } from "@/components/trainings/utils";
import { TrainingUnit } from "@/components/trainings/TrainingUnit";
import type { TrainingRow, AttendanceSummary, TrainingFormFields } from "@/components/trainings/types";
import type { Player, Exercise } from "@/types/database";

type TabKey = "planning" | "attendance" | "documents";

function computeCanEdit(session: TrainingRow): boolean {
  const startsAt = portugalDateTimeToUtc(session.session_date, session.start_time);
  return !!startsAt && startsAt.getTime() > Date.now();
}

export default function TrainingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [ageGroupId, setAgeGroupId] = useState<string | null>(null);
  const [clubInfo, setClubInfo] = useState<{ clubName: string; clubLogoUrl: string | null; teamName: string; season: string | null } | null>(null);
  const [canDelete, setCanDelete] = useState(false);
  const [session, setSession] = useState<TrainingRow | null>(null);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, { player: Player; status: string }>>({});
  const [hasRecordedAttendance, setHasRecordedAttendance] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("planning");

  const editForm = useTrainingForm();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);

  const loadDetail = useCallback(async function loadDetail() {
    setLoading(true);
    setError(null);

    const ctxRes = await fetch("/api/me/context");
    const ctx = await ctxRes.json().catch(() => ({})) as {
      canManageStaff?: boolean;
      ageGroup?: {
        id: string;
        club_name?: string;
        club_logo_url?: string | null;
        name?: string;
        season?: string | null;
      };
    };
    setCanDelete(ctx?.canManageStaff === true);

    if (!ctxRes.ok || !ctx?.ageGroup?.id) {
      setError("Sem acesso ao grupo etário.");
      setLoading(false);
      return;
    }
    setAgeGroupId(ctx.ageGroup.id);
    setClubInfo({
      clubName: ctx.ageGroup.club_name ?? "",
      clubLogoUrl: ctx.ageGroup.club_logo_url ?? null,
      teamName: ctx.ageGroup.name ?? "",
      season: ctx.ageGroup.season ?? null,
    });

    const detailRes = await fetch(`/api/trainings?sessionId=${id}`, { cache: "no-store" });
    const payload = await detailRes.json().catch(() => null) as {
      success?: boolean;
      session?: TrainingRow;
      attendance?: Array<{ player: Player; status: string }>;
      summary?: AttendanceSummary;
      hasRecordedAttendance?: boolean;
      error?: string;
    } | null;

    if (!detailRes.ok || !payload?.success || !payload.session) {
      setError(payload?.error || "Treino não encontrado.");
      setLoading(false);
      return;
    }

    const playerMap: Record<string, { player: Player; status: string }> = {};
    for (const entry of payload.attendance || []) {
      if (!entry?.player?.id) continue;
      playerMap[entry.player.id] = { player: entry.player, status: entry.status };
    }

    setSession(payload.session);
    setAttendanceMap(playerMap);
    setHasRecordedAttendance(payload.hasRecordedAttendance === true);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  async function handleSave(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!session || !ageGroupId) return;

    const fields = editForm.getFields();
    if (!fields.date || !fields.startTime) {
      setError("Preenche data e hora de início.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/calendar/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: session.id,
          type: "training",
          ageGroupId,
          payload: {
            title: fields.title.trim() || "Treino",
            ut_number: parseUtNumberInput(fields.utNumber),
            date: fields.date,
            start_time: fields.startTime,
            end_time: fields.endTime || null,
            location: fields.location.trim() || null,
            formatted_address: fields.formattedAddress.trim() || null,
            latitude: fields.latitude,
            longitude: fields.longitude,
            osm_place_id: fields.osmPlaceId.trim() || null,
            location_source: fields.locationSource,
            notes: fields.notes.trim() || null,
            image_url: fields.imageUrl.trim() || null,
          },
        }),
      });
      const data = await res.json().catch(() => null) as {
        success?: boolean;
        event?: TrainingRow;
        error?: string;
      } | null;

      if (!res.ok || !data?.success) {
        setError(data?.error || "Erro ao guardar treino.");
        return;
      }

      setSession((prev) => prev ? { ...prev, ...data.event } : prev);
      setEditing(false);
      toast.success("Treino guardado.");
      await loadDetail();
    } catch {
      setError("Erro de ligação ao guardar treino.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!session || !ageGroupId || !canDelete) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/calendar/events", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: session.id, type: "training", ageGroupId }),
      });
      const data = await res.json().catch(() => null) as { success?: boolean; error?: string } | null;
      if (!res.ok || !data?.success) {
        setError(data?.error || "Erro ao apagar treino.");
        setShowDeleteConfirm(false);
        return;
      }
      toast.success("Treino apagado.");
      router.push("/trainings");
    } catch {
      setError("Erro de ligação ao apagar treino.");
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  }

  async function handleCreateDuplicate(fields: TrainingFormFields): Promise<{ success: boolean; error?: string }> {
    if (!fields.date || !fields.startTime) return { success: false, error: "Preenche data e hora de início." };
    try {
      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "training",
          payload: {
            title: fields.title.trim() || "Treino",
            ut_number: parseUtNumberInput(fields.utNumber),
            date: fields.date,
            start_time: fields.startTime,
            end_time: fields.endTime || null,
            location: fields.location.trim() || null,
            formatted_address: fields.formattedAddress.trim() || null,
            latitude: fields.latitude,
            longitude: fields.longitude,
            osm_place_id: fields.osmPlaceId.trim() || null,
            location_source: fields.locationSource,
            notes: fields.notes.trim() || null,
            image_url: fields.imageUrl.trim() || null,
          },
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !(payload as { event?: { id: string } } | null)?.event?.id) {
        return { success: false, error: (payload as { error?: string } | null)?.error || "Erro ao criar treino." };
      }
      toast.success("Treino duplicado.");
      router.push("/trainings");
      return { success: true };
    } catch {
      return { success: false, error: "Erro de ligação ao criar treino." };
    }
  }

  async function handleExportUtPdf() {
    if (!session) return;
    try {
      const phasesRes = await fetch(`/api/trainings/${id}/phases`);
      const phasesJson = await phasesRes.json() as {
        success?: boolean;
        phases?: Array<{
          phase_type: string;
          phase_name?: string | null;
          exercises: Array<{
            custom_name?: string | null;
            custom_description?: string | null;
            custom_objectives?: string | null;
            custom_game_format?: string | null;
            custom_duration_minutes?: number | null;
            custom_rest_minutes?: number | null;
            custom_num_players?: number | null;
            custom_field_dimensions?: string | null;
            custom_material?: string | null;
            custom_diagram_url?: string | null;
            notes?: string | null;
            exercise?: Exercise | null;
          }>;
        }>;
      };

      const { exportTrainingUnitPDF } = await import("@/lib/pdf/trainingUnit");
      await exportTrainingUnitPDF({
        clubName: clubInfo?.clubName,
        clubLogoUrl: clubInfo?.clubLogoUrl,
        teamName: clubInfo?.teamName,
        season: clubInfo?.season ?? undefined,
        utNumber: session.ut_number,
        title: session.title,
        sessionDate: session.session_date,
        startTime: session.start_time,
        endTime: session.end_time,
        location: resolveLocationLabel(session.location, session.formatted_address) ?? undefined,
        fieldArea: session.field_area,
        mesocycle: session.mesocycle_number,
        microcycle: session.microcycle_number,
        periodType: session.period_type,
        focus: session.focus,
        intensity: session.intensity,
        objective: session.objective,
        complementaryObjectives: session.complementary_objectives,
        initialInstruction: session.initial_instruction,
        material: session.material,
        phases: (phasesJson.phases ?? []).map((p) => ({
          phase_type: p.phase_type,
          phase_name: p.phase_name,
          exercises: p.exercises.map((ex) => ({
            name: ex.custom_name || ex.exercise?.name || "Exercício",
            description: ex.custom_description || ex.exercise?.description || null,
            objectives: ex.custom_objectives || ex.exercise?.objectives || null,
            gameFormat: ex.custom_game_format || ex.exercise?.game_format || null,
            duration: ex.custom_duration_minutes ?? ex.exercise?.duration_minutes ?? null,
            numPlayers: ex.custom_num_players ?? ex.exercise?.min_players ?? null,
            fieldDimensions: ex.custom_field_dimensions || ex.exercise?.field_dimensions || null,
            material: ex.custom_material || ex.exercise?.material || null,
            rest: ex.custom_rest_minutes ?? ex.exercise?.rest_minutes ?? 0,
            diagramUrl: ex.custom_diagram_url || ex.exercise?.diagram_url || null,
            notes: ex.notes || null,
          })),
        })),
      });
      toast.success("PDF exportado.");
    } catch {
      toast.error("Erro ao exportar PDF.");
    }
  }

  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto flex items-center justify-center py-16">
        <Loader2 size={28} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto text-center py-16">
        <AlertCircle size={40} className="text-red-400 mx-auto mb-3" />
        <p className="text-slate-700 font-semibold">{error || "Treino não encontrado."}</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/trainings")}>Voltar aos treinos</Button>
      </div>
    );
  }

  const locationLabel = resolveLocationLabel(session.location, session.formatted_address);
  const canEditSession = computeCanEdit(session);
  const canCorrectAttendance = canDelete && session.status === "completed";
  const isClosed = session.status === "completed";
  const displayTitle = getTrainingDisplayTitle(session);
  const attendanceCount = Object.keys(attendanceMap).length;
  const hasLocation = !!(session.location || session.formatted_address);

  return (
    <>
      <div className="p-4 md:p-8 max-w-2xl mx-auto">
        <StickyBackLink
          href="/trainings"
          label="Voltar aos treinos"
          wrapperClassName="-mx-4 mb-4 bg-slate-50/95 px-4 py-2 md:-mx-8 md:px-8"
        />

        {/* ── Header (sempre visível acima das tabs) ── */}
        <div className="rounded-2xl bg-emerald-600 text-white p-5 mb-0 relative">
          <div className="absolute top-3 right-3 flex items-center gap-1.5">
            {canEditSession && !editing && (
              <button
                onClick={() => { editForm.populateFromSource(session, "edit"); setEditing(true); }}
                className="p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                title="Editar treino"
              >
                <Pencil size={14} />
              </button>
            )}
            <button
              onClick={() => { editForm.populateFromSource(session, "duplicate"); setDuplicateModalOpen(true); }}
              className="p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
              title="Duplicar treino"
            >
              <Copy size={14} />
            </button>
            {canDelete && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-1.5 rounded-full bg-red-500/80 hover:bg-red-500 transition-colors"
                title="Apagar treino"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium bg-white/20 px-2 py-0.5 rounded-full">
              {isClosed ? "Fechado" : "Agendado"}
            </span>
          </div>
          <h1 className="text-xl font-bold mt-1">{displayTitle}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-emerald-100">
            <span className="capitalize">
              {format(parseISO(session.session_date), "EEEE, d 'de' MMMM yyyy", { locale: pt })}
            </span>
            {session.start_time && (
              <span>
                {session.start_time.substring(0, 5)}
                {session.end_time ? ` – ${session.end_time.substring(0, 5)}` : ""}
              </span>
            )}
            {locationLabel && (
              <button
                type="button"
                className="underline underline-offset-2 hover:text-white"
                onClick={() => setMapExpanded((v) => !v)}
              >
                {locationLabel}
              </button>
            )}
          </div>

          {/* Collapsible map inside header */}
          {mapExpanded && hasLocation && (
            <div className="mt-3 rounded-xl overflow-hidden bg-white/10">
              <LocationMapPreview
                location={session.location}
                formattedAddress={session.formatted_address}
                latitude={session.latitude}
                longitude={session.longitude}
                accent="emerald"
                label=""
                showDirectionsButton={false}
              />
            </div>
          )}
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ── Editing form ── */}
        {editing && (
          <form
            onSubmit={(e) => void handleSave(e)}
            className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 space-y-4"
          >
            <TrainingFormFieldsComponent
              title={editForm.title} onTitleChange={editForm.setTitle}
              utNumber={editForm.utNumber} onUtNumberChange={editForm.setUtNumber}
              date={editForm.date} onDateChange={editForm.setDate}
              startTime={editForm.startTime} onStartTimeChange={editForm.setStartTime}
              endTime={editForm.endTime} onEndTimeChange={editForm.setEndTime}
              location={editForm.location}
              formattedAddress={editForm.formattedAddress} latitude={editForm.latitude}
              longitude={editForm.longitude} osmPlaceId={editForm.osmPlaceId}
              locationSource={editForm.locationSource}
              onLocationChange={(nv) => {
                editForm.setLocation(nv.location);
                editForm.setFormattedAddress(nv.formatted_address);
                editForm.setLatitude(nv.latitude);
                editForm.setLongitude(nv.longitude);
                editForm.setOsmPlaceId(nv.osm_place_id);
                editForm.setLocationSource(nv.location_source);
              }}
              imageUrl={editForm.imageUrl} onImageUrlChange={editForm.setImageUrl}
              notes={editForm.notes} onNotesChange={editForm.setNotes}
              ageGroupId={ageGroupId}
            />
            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={saving} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                {saving ? <Loader2 size={16} className="animate-spin" /> : "Guardar treino"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditing(false)} disabled={saving}>Cancelar</Button>
            </div>
          </form>
        )}

        {/* ── Tabs ── */}
        {!editing && (
          <>
            <div className="flex border-b border-slate-200 mt-0">
              <TabBtn active={activeTab === "planning"} label="Planeamento" onClick={() => setActiveTab("planning")} />
              <TabBtn active={activeTab === "attendance"} label="Presenças" count={attendanceCount} onClick={() => setActiveTab("attendance")} />
              <TabBtn active={activeTab === "documents"} label="Documentos" count={0} onClick={() => setActiveTab("documents")} />
            </div>

            <div className="mt-4">
              {activeTab === "planning" && (
                <TabPlanning
                  session={session}
                  isClosed={isClosed}
                  onExportPdf={() => void handleExportUtPdf()}
                  onSessionSaved={() => void loadDetail()}
                />
              )}

              {activeTab === "attendance" && (
                <TabAttendance
                  session={session}
                  attendanceMap={attendanceMap}
                  hasRecordedAttendance={hasRecordedAttendance}
                  isClosed={isClosed}
                  canCorrectAttendance={canCorrectAttendance}
                  onCorrect={() => router.push(`/attendance?date=${session.session_date}`)}
                />
              )}

              {activeTab === "documents" && (
                <div className="text-center py-12">
                  <FileText size={36} className="text-slate-200 mx-auto mb-3" />
                  <p className="text-sm text-slate-500">Documentos associados a este treino.</p>
                  <p className="text-xs text-slate-400 mt-1">Em breve.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {duplicateModalOpen && (
        <TrainingCreateModal
          createMode="duplicate"
          ageGroupId={ageGroupId}
          form={editForm}
          onClose={() => setDuplicateModalOpen(false)}
          onSubmit={handleCreateDuplicate}
        />
      )}

      {showDeleteConfirm && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4"
          onClick={() => { if (!deleting) setShowDeleteConfirm(false); }}
        >
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="text-base font-bold text-slate-900">Apagar treino?</h3>
              <p className="text-sm text-slate-600 mt-1">
                {isClosed ? "Este treino está fechado e tem presenças registadas. Esta acção é irreversível." : "Esta acção é irreversível."}
              </p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>Cancelar</Button>
              <Button type="button" className="flex-1 bg-red-600 hover:bg-red-700" onClick={() => void handleDelete()} disabled={deleting}>
                {deleting ? <Loader2 size={15} className="mr-2 animate-spin" /> : <Trash2 size={15} className="mr-2" />}
                Apagar
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ── Sub-components ── */

function TabBtn({ active, label, count, onClick }: { active: boolean; label: string; count?: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${active ? "text-emerald-700" : "text-slate-500 hover:text-slate-700"}`}
    >
      {label}
      {count != null && (
        <span className={`ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold ${active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
          {count}
        </span>
      )}
      {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600 rounded-t" />}
    </button>
  );
}

function TabPlanning({ session, isClosed, onExportPdf, onSessionSaved }: { session: TrainingRow; isClosed: boolean; onExportPdf: () => void; onSessionSaved?: () => void }) {
  return (
    <div className="space-y-4">
      {session.notes?.trim() && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Notas</p>
          <RichTextContent content={session.notes} />
        </div>
      )}

      <TrainingUnit
        trainingId={session.id}
        session={session}
        readOnly={isClosed}
        onExportPdf={onExportPdf}
        onSessionSaved={onSessionSaved}
      />
    </div>
  );
}

function TabAttendance({
  session,
  attendanceMap,
  hasRecordedAttendance,
  isClosed,
  canCorrectAttendance,
  onCorrect,
}: {
  session: TrainingRow;
  attendanceMap: Record<string, { player: Player; status: string }>;
  hasRecordedAttendance: boolean;
  isClosed: boolean;
  canCorrectAttendance: boolean;
  onCorrect: () => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-slate-100">
        <p className="text-sm font-semibold text-slate-900">Presenças</p>
        {canCorrectAttendance && (
          <Button type="button" variant="outline" size="sm" className="border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={onCorrect}>
            <Users size={14} className="mr-1.5" />
            Corrigir
          </Button>
        )}
      </div>

      {isClosed && !hasRecordedAttendance ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm font-semibold text-slate-700">Sem presenças gravadas.</p>
          <p className="mt-1 text-xs text-slate-500">O treino está fechado, mas não existem registos de presenças associados.</p>
          {canCorrectAttendance && (
            <Button type="button" variant="outline" className="mt-4 border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={onCorrect}>
              Corrigir presenças
            </Button>
          )}
        </div>
      ) : Object.keys(attendanceMap).length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-slate-500">Sem jogadores com presenças registadas.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {Object.values(attendanceMap)
            .sort((a, b) => a.player.first_name.localeCompare(b.player.first_name))
            .map(({ player, status }) => {
              const statusUi = getAttendanceStatusClasses(status);
              return (
                <div key={player.id} className="flex items-center gap-3 px-5 py-3">
                  <div className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${statusUi.dot}`} />
                  <p className="text-sm text-slate-800">{player.first_name} {player.last_name}</p>
                  <span className={`ml-auto text-xs font-medium ${statusUi.text}`}>{statusUi.label}</span>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
