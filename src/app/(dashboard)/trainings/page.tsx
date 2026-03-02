"use client";

import { useState, useEffect } from "react";
import { format, parseISO, isToday, isFuture } from "date-fns";
import { pt } from "date-fns/locale";
import {
  Loader2,
  Dumbbell,
  X,
  Users,
  Clock,
  MapPin,
  Copy,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { RichTextContent } from "@/components/content/RichTextContent";
import { NotesEditor } from "@/components/forms/NotesEditor";
import { LocationFields } from "@/components/maps/LocationFields";
import { LocationMapPreview } from "@/components/maps/LocationMapPreview";
import { OpenMapsButton } from "@/components/maps/OpenMapsButton";
import type { Player } from "@/types/database";

interface TrainingRow {
  id: string;
  session_date: string;
  start_time?: string;
  end_time?: string;
  title?: string;
  location?: string;
  location_address?: string;
  notes?: string;
  status: string;
  age_group_id?: string;
  team_id?: string;
}

interface AttendanceSummary {
  session_id: string;
  present: number;
  absent: number;
  injured: number;
  total: number;
}

interface SessionDetail {
  session: TrainingRow;
  attendance: Record<string, { player: Player; status: string }>;
  summary: AttendanceSummary;
  hasRecordedAttendance: boolean;
}

function groupByMonth(sessions: TrainingRow[]): { label: string; sessions: TrainingRow[] }[] {
  const map = new Map<string, TrainingRow[]>();
  for (const s of sessions) {
    const key = format(parseISO(s.session_date), "MMMM yyyy", { locale: pt });
    const bucket = map.get(key) ?? [];
    bucket.push(s);
    map.set(key, bucket);
  }
  return Array.from(map.entries()).map(([label, sessions]) => ({ label, sessions }));
}

export default function TrainingsPage() {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<TrainingRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceSummary[]>([]);
  const [ageGroupId, setAgeGroupId] = useState<string | null>(null);

  const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creatingTraining, setCreatingTraining] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createMode, setCreateMode] = useState<"create" | "duplicate">("create");
  const [newTrainingTitle, setNewTrainingTitle] = useState("Treino");
  const [newTrainingDate, setNewTrainingDate] = useState("");
  const [newTrainingStartTime, setNewTrainingStartTime] = useState("18:30");
  const [newTrainingEndTime, setNewTrainingEndTime] = useState("20:00");
  const [newTrainingLocation, setNewTrainingLocation] = useState("");
  const [newTrainingLocationAddress, setNewTrainingLocationAddress] = useState("");
  const [newTrainingNotes, setNewTrainingNotes] = useState("");
  const [canDeleteTrainings, setCanDeleteTrainings] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingTraining, setDeletingTraining] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    const res = await fetch("/api/me/context");
    const ctx = await res.json().catch(() => ({}));
    setCanDeleteTrainings(ctx?.canManageStaff === true);
    if (!res.ok || !ctx?.ageGroup?.id) {
      setLoading(false);
      return;
    }

    const agId: string = (ctx.ageGroup as { id: string }).id;
    setAgeGroupId(agId);

    const trainingsRes = await fetch("/api/trainings", { cache: "no-store" });
    const trainingsPayload = (await trainingsRes.json().catch(() => null)) as
      | {
          success?: boolean;
          linked?: boolean;
          sessions?: TrainingRow[];
          summaries?: AttendanceSummary[];
          error?: string;
        }
      | null;

    if (!trainingsRes.ok || !trainingsPayload?.success) {
      setSessions([]);
      setAttendance([]);
      setLoading(false);
      return;
    }

    setSessions(trainingsPayload.sessions || []);
    setAttendance(trainingsPayload.summaries || []);

    setLoading(false);
  }

  function getSummary(sessionId: string): AttendanceSummary | null {
    return attendance.find((a) => a.session_id === sessionId) ?? null;
  }

  async function handleSessionClick(session: TrainingRow) {
    setLoadingDetail(true);
    setDetailError(null);
    setShowDeleteConfirm(false);

    try {
      const detailRes = await fetch(`/api/trainings?sessionId=${session.id}`, {
        cache: "no-store",
      });
      const detailPayload = (await detailRes.json().catch(() => null)) as
        | {
            success?: boolean;
            session?: TrainingRow;
            attendance?: Array<{ player: Player; status: string }>;
            summary?: AttendanceSummary;
            hasRecordedAttendance?: boolean;
            error?: string;
          }
        | null;

      if (!detailRes.ok || !detailPayload?.success || !detailPayload.session || !detailPayload.summary) {
        setDetailError(detailPayload?.error || "Erro ao carregar detalhe do treino.");
        setLoadingDetail(false);
        return;
      }

      const playerMap: Record<string, { player: Player; status: string }> = {};
      for (const entry of detailPayload.attendance || []) {
        if (!entry?.player?.id) continue;
        playerMap[entry.player.id] = {
          player: entry.player,
          status: entry.status,
        };
      }

      setSelectedSession({
        session: detailPayload.session,
        attendance: playerMap,
        summary: detailPayload.summary,
        hasRecordedAttendance: detailPayload.hasRecordedAttendance === true,
      });
    } catch {
      setDetailError("Erro de ligação ao carregar detalhe do treino.");
    } finally {
      setLoadingDetail(false);
    }
  }

  async function handleDeleteSelectedSession() {
    if (!selectedSession) return;
    if (!canDeleteTrainings) {
      setDetailError("Só o coordenador pode apagar treinos.");
      return;
    }

    setDeletingTraining(true);
    setDetailError(null);
    const sessionId = selectedSession.session.id;

    try {
      const res = await fetch("/api/calendar/events", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: sessionId,
          type: "training",
          ageGroupId,
        }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { success?: boolean; error?: string }
        | null;

      if (!res.ok || !payload?.success) {
        setDetailError(payload?.error || "Erro ao apagar treino.");
        return;
      }

      setSessions((prev) => prev.filter((item) => item.id !== sessionId));
      setAttendance((prev) => prev.filter((item) => item.session_id !== sessionId));
      setSelectedSession(null);
      setShowDeleteConfirm(false);
      await loadData();
    } catch {
      setDetailError("Erro de ligação ao apagar treino.");
    } finally {
      setDeletingTraining(false);
    }
  }

  function resetCreateForm() {
    const today = new Date();
    setCreateMode("create");
    setNewTrainingTitle("Treino");
    setNewTrainingDate(format(today, "yyyy-MM-dd"));
    setNewTrainingStartTime("18:30");
    setNewTrainingEndTime("20:00");
    setNewTrainingLocation("");
    setNewTrainingLocationAddress("");
    setNewTrainingNotes("");
    setCreateError(null);
  }

  function openCreateTrainingModal() {
    resetCreateForm();
    setCreateModalOpen(true);
  }

  function openDuplicateTraining(source: TrainingRow) {
    setCreateMode("duplicate");
    setNewTrainingTitle(`Cópia de ${source.title || "Treino"}`);
    setNewTrainingDate("");
    setNewTrainingStartTime(source.start_time?.slice(0, 5) || "18:30");
    setNewTrainingEndTime(source.end_time?.slice(0, 5) || "20:00");
    setNewTrainingLocation(source.location || "");
    setNewTrainingLocationAddress(source.location_address || "");
    setNewTrainingNotes(source.notes || "");
    setCreateError(null);
    setDetailError(null);
    setShowDeleteConfirm(false);
    setSelectedSession(null);
    setCreateModalOpen(true);
  }

  async function handleCreateTraining(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!newTrainingDate || !newTrainingStartTime) {
      setCreateError("Preenche data e hora de início.");
      return;
    }

    setCreatingTraining(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "training",
          payload: {
            title: newTrainingTitle.trim() || "Treino",
            date: newTrainingDate,
            start_time: newTrainingStartTime,
            end_time: newTrainingEndTime || null,
            location: newTrainingLocation.trim() || null,
            location_address: newTrainingLocationAddress.trim() || null,
            notes: newTrainingNotes.trim() || null,
          },
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.event?.id) {
        setCreateError(
          (payload as { error?: string } | null)?.error || "Erro ao criar treino.",
        );
        return;
      }
      setCreateModalOpen(false);
      resetCreateForm();
      await loadData();
    } catch {
      setCreateError("Erro de ligação ao criar treino.");
    } finally {
      setCreatingTraining(false);
    }
  }

  const grouped = groupByMonth(sessions);
  const selectedSessionLocationLabel = selectedSession
    ? selectedSession.session.location || selectedSession.session.location_address
    : null;

  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto flex items-center justify-center py-16">
        <Loader2 size={28} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto text-center py-16">
        <Dumbbell size={40} className="text-slate-200 mx-auto mb-3" />
        <p className="text-slate-500 text-sm">Nenhum treino registado.</p>
        <p className="text-slate-400 text-xs mt-1">Cria o primeiro treino aqui.</p>
        <Button
          className="mt-4 bg-emerald-600 hover:bg-emerald-700"
          onClick={openCreateTrainingModal}
        >
          <Plus size={16} className="mr-2" />
          Adicionar treino
        </Button>
      </div>
    );
  }

  void ageGroupId; // suppress unused var warning

  return (
    <>
      <div className="p-4 md:p-8 max-w-2xl mx-auto">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-slate-900">Treinos</h1>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={openCreateTrainingModal}
          >
            <Plus size={16} className="mr-2" />
            Adicionar treino
          </Button>
        </div>

        <div className="space-y-6">
          {grouped.map(({ label, sessions: monthSessions }) => (
            <section key={label}>
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 capitalize">{label}</h2>
              <div className="space-y-2">
                {monthSessions.map((session) => {
                  const summary = getSummary(session.id);
                  const dt = parseISO(session.session_date);
                  const upcoming = isToday(dt) || isFuture(dt);
                  const locationLabel = session.location || session.location_address;

                  return (
                    <button
                      key={session.id}
                      onClick={() => void handleSessionClick(session)}
                      className={`w-full flex items-center gap-3 p-4 rounded-2xl border text-left transition-all hover:shadow-sm ${
                        upcoming
                          ? "bg-emerald-50 border-emerald-200 hover:border-emerald-300"
                          : "bg-white border-slate-100 hover:border-slate-200"
                      }`}
                    >
                      {/* Date */}
                      <div className="flex-shrink-0 w-10 text-center">
                        <p className="text-base font-bold text-slate-900 leading-none">{format(dt, "d")}</p>
                        <p className="text-[10px] text-slate-400 capitalize">{format(dt, "EEE", { locale: pt })}</p>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">
                          {session.title || "Treino"}
                          {isToday(dt) && (
                            <span className="ml-2 text-[10px] font-bold bg-amber-100 text-amber-700 rounded px-1.5 py-0.5">Hoje</span>
                          )}
                          <span
                            className={`ml-2 text-[10px] font-bold rounded px-1.5 py-0.5 ${
                              session.status === "completed"
                                ? "bg-slate-100 text-slate-500"
                                : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {session.status === "completed" ? "Fechado" : "Agendado"}
                          </span>
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {session.start_time && (
                            <span className="text-xs text-slate-400 flex items-center gap-0.5">
                              <Clock size={10} className="flex-shrink-0" />
                              {session.start_time.substring(0, 5)}
                            </span>
                          )}
                          {locationLabel && (
                            <span className="text-xs text-slate-400 flex items-center gap-0.5 truncate">
                              <MapPin size={10} className="flex-shrink-0" />
                              {locationLabel}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Attendance badge */}
                      {summary ? (
                        <div className="flex-shrink-0 text-right">
                          <p className="text-sm font-bold text-emerald-700">{summary.present}</p>
                          <p className="text-[10px] text-slate-400">presentes</p>
                        </div>
                      ) : (
                        <div className="flex-shrink-0">
                          <Users size={16} className="text-slate-300" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      {createModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4"
          onClick={() => setCreateModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[calc(100dvh-1rem)] md:max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h3 className="font-bold text-slate-900">
                  {createMode === "duplicate" ? "Duplicar treino" : "Adicionar treino"}
                </h3>
                {createMode === "duplicate" && (
                  <p className="mt-1 text-xs text-slate-500">
                    Revê os dados e escolhe uma nova data antes de guardar.
                  </p>
                )}
              </div>
              <button onClick={() => setCreateModalOpen(false)}>
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            <form
              onSubmit={handleCreateTraining}
              className="p-5 space-y-3 overflow-y-auto flex-1 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Título</label>
                <input
                  type="text"
                  value={newTrainingTitle}
                  onChange={(event) => setNewTrainingTitle(event.target.value)}
                  placeholder="Treino"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Data *</label>
                  <input
                    type="date"
                    value={newTrainingDate}
                    onChange={(event) => setNewTrainingDate(event.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Início *</label>
                  <input
                    type="time"
                    value={newTrainingStartTime}
                    onChange={(event) => setNewTrainingStartTime(event.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    required
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Fim</label>
                <input
                  type="time"
                  value={newTrainingEndTime}
                  onChange={(event) => setNewTrainingEndTime(event.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <LocationFields
                location={newTrainingLocation}
                locationAddress={newTrainingLocationAddress}
                onLocationChange={setNewTrainingLocation}
                onLocationAddressChange={setNewTrainingLocationAddress}
                accent="emerald"
              />
              <NotesEditor
                value={newTrainingNotes}
                onChange={setNewTrainingNotes}
                accent="emerald"
                rows={7}
              />
              {createError && <p className="text-sm text-red-600">{createError}</p>}
              <div className="flex gap-2 pt-1">
                <Button
                  type="submit"
                  disabled={creatingTraining}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                >
                  {creatingTraining ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    createMode === "duplicate" ? "Criar cópia" : "Criar treino"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateModalOpen(false)}
                  disabled={creatingTraining}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedSession && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4"
          onClick={() => {
            if (deletingTraining) return;
            setSelectedSession(null);
            setShowDeleteConfirm(false);
            setDetailError(null);
          }}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[calc(100dvh-1rem)] md:max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h3 className="font-bold text-slate-900">
                  {selectedSession.session.title || "Treino"} —{" "}
                  {format(parseISO(selectedSession.session.session_date), "d 'de' MMMM", { locale: pt })}
                </h3>
                {selectedSession.session.start_time && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selectedSession.session.start_time.substring(0, 5)}
                    {selectedSession.session.end_time ? ` – ${selectedSession.session.end_time.substring(0, 5)}` : ""}
                    {selectedSessionLocationLabel ? ` · ${selectedSessionLocationLabel}` : ""}
                  </p>
                )}
                {selectedSession.session.location_address &&
                  selectedSession.session.location_address !== selectedSessionLocationLabel && (
                    <p className="mt-1 text-xs text-slate-500">
                      {selectedSession.session.location_address}
                    </p>
                  )}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => openDuplicateTraining(selectedSession.session)}
                  className="p-1.5 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                  title="Duplicar treino"
                  disabled={deletingTraining}
                >
                  <Copy size={16} />
                </button>
                <OpenMapsButton
                  location={selectedSession.session.location}
                  locationAddress={selectedSession.session.location_address}
                  variant="icon"
                  accent="emerald"
                  title="Abrir no GPS"
                />
                {canDeleteTrainings && (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="p-1.5 rounded-full bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                    title="Apagar treino"
                    disabled={deletingTraining}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
                <button
                  onClick={() => {
                    setSelectedSession(null);
                    setShowDeleteConfirm(false);
                    setDetailError(null);
                  }}
                  disabled={deletingTraining}
                >
                  <X size={20} className="text-slate-400" />
                </button>
              </div>
            </div>

            {detailError && (
              <div className="mx-5 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {detailError}
              </div>
            )}

            {/* Summary row */}
            <div className="flex divide-x border-b">
              {[
                { label: "Presentes", value: selectedSession.summary.present, color: "text-emerald-600" },
                { label: "Ausentes", value: selectedSession.summary.absent, color: "text-red-500" },
                { label: "Lesionados", value: selectedSession.summary.injured, color: "text-orange-500" },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex-1 text-center py-3">
                  <p className={`text-xl font-bold ${color}`}>{value}</p>
                  <p className="text-xs text-slate-500">{label}</p>
                </div>
              ))}
            </div>

            {/* Player list */}
            {loadingDetail ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="animate-spin text-slate-400" />
              </div>
            ) : selectedSession.session.status === "completed" &&
              !selectedSession.hasRecordedAttendance ? (
              <div className="flex flex-1 items-center justify-center px-6 py-10 text-center">
                <div>
                  <p className="text-sm font-semibold text-slate-700">
                    Sem presenças gravadas para este treino.
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    O treino está fechado, mas não existem registos de presenças associados.
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-y-auto flex-1">
                {(selectedSession.session.location ||
                  selectedSession.session.location_address) && (
                  <div className="border-b px-5 py-4">
                    <LocationMapPreview
                      location={selectedSession.session.location}
                      locationAddress={selectedSession.session.location_address}
                      accent="emerald"
                      label="Localização"
                    />
                  </div>
                )}
                {selectedSession.session.notes?.trim() && (
                  <div className="border-b px-5 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Notas
                    </p>
                    <RichTextContent
                      content={selectedSession.session.notes}
                      className="mt-2"
                    />
                  </div>
                )}
                <div className="divide-y">
                  {Object.values(selectedSession.attendance)
                    .sort((a, b) => a.player.first_name.localeCompare(b.player.first_name))
                    .map(({ player, status }) => (
                      <div key={player.id} className="flex items-center gap-3 px-5 py-3">
                        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                          status === "present" ? "bg-emerald-500" :
                          status === "absent" ? "bg-red-500" : "bg-orange-400"
                        }`} />
                        <p className="text-sm text-slate-800">
                          {player.first_name} {player.last_name}
                        </p>
                        <span className={`ml-auto text-xs font-medium ${
                          status === "present" ? "text-emerald-600" :
                          status === "absent" ? "text-red-500" : "text-orange-500"
                        }`}>
                          {status === "present" ? "Presente" : status === "absent" ? "Ausente" : "Lesionado"}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {selectedSession && showDeleteConfirm && (
        <div
          className="fixed inset-0 bg-black/55 z-[60] flex items-end md:items-center justify-center p-4"
          onClick={() => {
            if (deletingTraining) return;
            setShowDeleteConfirm(false);
          }}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm shadow-xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-base font-bold text-slate-900">Apagar treino?</h3>
              <p className="text-sm text-slate-600 mt-1">
                Esta ação remove presenças e registos estatísticos associados.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deletingTraining}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="flex-1 bg-red-600 hover:bg-red-700"
                onClick={() => void handleDeleteSelectedSession()}
                disabled={deletingTraining}
              >
                {deletingTraining ? (
                  <Loader2 size={15} className="mr-2 animate-spin" />
                ) : (
                  <Trash2 size={15} className="mr-2" />
                )}
                Apagar treino
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
