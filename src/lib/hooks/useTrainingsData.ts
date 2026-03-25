"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  TrainingRow,
  AttendanceSummary,
  SessionDetail,
  TrainingFormFields,
} from "@/components/trainings/types";
import { parseUtNumberInput } from "@/lib/trainings/ut-numbering";
import type { Player } from "@/types/database";
import { useAgeGroup } from "@/contexts/AgeGroupContext";

export function useTrainingsData() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedAgeGroupId: contextAgeGroupId } = useAgeGroup();
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<TrainingRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceSummary[]>([]);
  const [ageGroupId, setAgeGroupId] = useState<string | null>(null);

  const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [canDeleteTrainings, setCanDeleteTrainings] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingTraining, setDeletingTraining] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [editingSelectedSession, setEditingSelectedSession] = useState(false);

  const loadData = useCallback(async function loadData() {
    setLoading(true);

    const res = await fetch("/api/me/context");
    const ctx = await res.json().catch(() => ({}));
    setCanDeleteTrainings(ctx?.canManageStaff === true);
    const hasAnyAccess =
      ctx?.ageGroup?.id ||
      (Array.isArray(ctx?.accessibleAgeGroupIds) && ctx.accessibleAgeGroupIds.length > 0);
    if (!res.ok || !hasAnyAccess) {
      setLoading(false);
      return;
    }

    // ageGroupId para operações de criação: escalão seleccionado ou default do servidor
    const agId: string | null = contextAgeGroupId ?? (ctx.ageGroup as { id: string } | null)?.id ?? null;
    setAgeGroupId(agId);

    // Só passa ?ageGroupId quando o utilizador escolheu um escalão específico
    const trainingsUrl = contextAgeGroupId
      ? `/api/trainings?ageGroupId=${contextAgeGroupId}`
      : "/api/trainings";
    const trainingsRes = await fetch(trainingsUrl, { cache: "no-store" });
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
  }, [contextAgeGroupId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function getSummary(sessionId: string): AttendanceSummary | null {
    return attendance.find((a) => a.session_id === sessionId) ?? null;
  }

  function clearOpenSessionQuery() {
    if (searchParams.get("open")) {
      router.replace("/trainings", { scroll: false });
    }
  }

  async function handleSessionClick(session: TrainingRow) {
    setLoadingDetail(true);
    setDetailError(null);
    setShowDeleteConfirm(false);
    setEditingSelectedSession(false);

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
      closeSelectedSessionModal();
      await loadData();
    } catch {
      setDetailError("Erro de ligação ao apagar treino.");
    } finally {
      setDeletingTraining(false);
    }
  }

  function closeSelectedSessionModal() {
    setSelectedSession(null);
    setShowDeleteConfirm(false);
    setDetailError(null);
    setEditingSelectedSession(false);
    clearOpenSessionQuery();
  }

  function openAttendanceCorrection(session: TrainingRow) {
    setSelectedSession(null);
    setShowDeleteConfirm(false);
    setDetailError(null);
    setEditingSelectedSession(false);
    router.push(`/attendance?date=${session.session_date}`);
  }

  async function handleSaveSelectedSession(
    editFields: {
      title: string;
      utNumber: string;
      date: string;
      startTime: string;
      endTime: string;
      location: string;
      locationAddress: string;
      formattedAddress: string;
      latitude: number | null;
      longitude: number | null;
      osmPlaceId: string;
      locationSource: "google" | "osm" | "manual" | null;
      notes: string;
      imageUrl: string;
    },
  ): Promise<{ success: boolean; error?: string }> {
    if (!selectedSession) return { success: false };
    if (!editFields.date || !editFields.startTime) {
      setDetailError("Preenche data e hora de início.");
      return { success: false };
    }

    setDetailError(null);

    try {
      const res = await fetch("/api/calendar/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedSession.session.id,
          type: "training",
          ageGroupId,
          payload: {
            title: editFields.title.trim() || "Treino",
            ut_number: parseUtNumberInput(editFields.utNumber),
            date: editFields.date,
            start_time: editFields.startTime,
            end_time: editFields.endTime || null,
            location: editFields.location.trim() || null,
            location_address: editFields.locationAddress.trim() || null,
            formatted_address: editFields.formattedAddress.trim() || null,
            latitude: editFields.latitude,
            longitude: editFields.longitude,
            osm_place_id: editFields.osmPlaceId.trim() || null,
            location_source: editFields.locationSource,
            notes: editFields.notes.trim() || null,
            image_url: editFields.imageUrl.trim() || null,
          },
        }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { success?: boolean; event?: TrainingRow; error?: string }
        | null;

      if (!res.ok || !payload?.success || !payload.event) {
        const err = payload?.error || "Erro ao guardar treino.";
        setDetailError(err);
        return { success: false, error: err };
      }

      setSessions((prev) =>
        prev.map((session) =>
          session.id === payload.event?.id ? { ...session, ...payload.event } : session,
        ),
      );
      setSelectedSession((prev) =>
        prev
          ? {
              ...prev,
              session: {
                ...prev.session,
                ...payload.event,
              },
            }
          : prev,
      );
      setEditingSelectedSession(false);
      await loadData();
      return { success: true };
    } catch {
      setDetailError("Erro de ligação ao guardar treino.");
      return { success: false, error: "Erro de ligação ao guardar treino." };
    }
  }

  async function handleCreateTraining(
    fields: TrainingFormFields,
  ): Promise<{ success: boolean; error?: string }> {
    if (!fields.date || !fields.startTime) {
      return { success: false, error: "Preenche data e hora de início." };
    }

    try {
      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "training",
          // Passa o escalão efectivo para o servidor poder criar no escalão correcto.
          // Essencial quando o club_coordinator tem um escalão seleccionado.
          ...(ageGroupId ? { ageGroupId } : {}),
          payload: {
            title: fields.title.trim() || "Treino",
            ut_number: parseUtNumberInput(fields.utNumber),
            date: fields.date,
            start_time: fields.startTime,
            end_time: fields.endTime || null,
            location: fields.location.trim() || null,
            location_address: fields.locationAddress.trim() || null,
            formatted_address: fields.formattedAddress.trim() || null,
            latitude: fields.latitude,
            longitude: fields.longitude,
            osm_place_id: fields.osmPlaceId.trim() || null,
            location_source: fields.locationSource,
            notes: fields.notes.trim() || null,
            image_url: fields.imageUrl.trim() || null,
            focus: fields.utFocus || null,
            intensity: fields.utIntensity || null,
            period_type: fields.utPeriodType || null,
            field_area: fields.utFieldArea || null,
            objective: fields.utObjective?.trim() || null,
            material: fields.utMaterial?.trim() || null,
            initial_instruction: fields.utInitialInstruction?.trim() || null,
          },
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.event?.id) {
        const err = (payload as { error?: string } | null)?.error || "Erro ao criar treino.";
        return { success: false, error: err };
      }
      await loadData();
      return { success: true };
    } catch {
      return { success: false, error: "Erro de ligação ao criar treino." };
    }
  }

  // Redirecionar URLs com ?open=<id> para a página de detalhe /trainings/<id>
  useEffect(() => {
    const requestedSessionId = searchParams.get("open");
    if (!requestedSessionId || loading) {
      return;
    }

    const targetSession = sessions.find((session) => session.id === requestedSessionId);
    if (targetSession) {
      router.replace(`/trainings/${requestedSessionId}`);
      return;
    }

    if (sessions.length > 0) {
      router.replace("/trainings", { scroll: false });
    }
  }, [loading, router, searchParams, sessions]);

  const nextUtNumber =
    sessions.reduce((maxValue, session) => {
      if (typeof session.ut_number !== "number") {
        return maxValue;
      }

      return Math.max(maxValue, session.ut_number);
    }, 0) + 1;

  return {
    loading,
    sessions,
    setSessions,
    attendance,
    setAttendance,
    ageGroupId,
    selectedSession,
    setSelectedSession,
    loadingDetail,
    canDeleteTrainings,
    showDeleteConfirm,
    setShowDeleteConfirm,
    deletingTraining,
    detailError,
    setDetailError,
    editingSelectedSession,
    setEditingSelectedSession,
    nextUtNumber,
    getSummary,
    clearOpenSessionQuery,
    handleSessionClick,
    handleDeleteSelectedSession,
    closeSelectedSessionModal,
    openAttendanceCorrection,
    handleSaveSelectedSession,
    handleCreateTraining,
    loadData,
  };
}
