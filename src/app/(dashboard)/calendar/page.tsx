"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  format,
  startOfWeek,
  addDays,
  addWeeks,
  subWeeks,
  isToday,
} from "date-fns";
import { pt } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  X,
  Plus,
  MapPin,
  Clock,
  ImageIcon,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NotesEditor } from "@/components/forms/NotesEditor";
import {
  GameFormFields,
  type GameCompetitionOption,
  type SharedGameFormValues,
} from "@/components/games/game-form-fields";
import { LocationFields } from "@/components/maps/LocationFields";
import {
  isValidManualShortName,
  normalizeManualShortName,
} from "@/lib/football/short-name";
import { formatFixtureOpponentLabel } from "@/lib/games/display";

const DAY_NAMES = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

interface CalEvent {
  id: string;
  type: "training" | "game";
  date: string;
  title?: string;
  start_time?: string;
  end_time?: string;
  notes?: string;
  status?: string;
  opponent_name?: string;
  opponent_short_name?: string;
  competition_id?: string;
  location?: string;
  location_address?: string;
  is_home?: boolean;
  image_url?: string;
}

type ModalMode = "add_training" | "add_game" | "edit_training" | "edit_game";

type EventForm = SharedGameFormValues & {
  title: string;
  end_time: string;
  location_address: string;
  notes: string;
  image_url: string;
};

const EMPTY_FORM: EventForm = {
  title: "",
  date: "",
  start_time: "18:00",
  end_time: "",
  opponent_name: "",
  opponent_short_name: "",
  competition_id: "",
  location: "",
  location_address: "",
  is_home: true,
  notes: "",
  image_url: "",
};

function timeToMinutes(time?: string) {
  if (!time) return Number.MAX_SAFE_INTEGER;
  const [h, m] = time.split(":").map((v) => Number(v));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return Number.MAX_SAFE_INTEGER;
  return h * 60 + m;
}

function compareEventsByDateTime(a: CalEvent, b: CalEvent) {
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  const diff = timeToMinutes(a.start_time) - timeToMinutes(b.start_time);
  if (diff !== 0) return diff;
  return a.type.localeCompare(b.type);
}

export default function CalendarPage() {
  const supabase = useMemo(() => createClient(), []);
  const fileRef = useRef<HTMLInputElement>(null);

  const [weekStart, setWeekStart] = useState(
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  );
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [ageGroupId, setAgeGroupId] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [ageGroupName, setAgeGroupName] = useState("");
  const [canDeleteEvents, setCanDeleteEvents] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);
  const [form, setForm] = useState<EventForm>(EMPTY_FORM);
  const [competitionOptions, setCompetitionOptions] = useState<GameCompetitionOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [opError, setOpError] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    if (!ageGroupId) return;
    const from = format(weekStart, "yyyy-MM-dd");
    const to = format(addDays(weekStart, 6), "yyyy-MM-dd");

    setLoadError(null);
    try {
      const res = await fetch(
        `/api/calendar/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&ageGroupId=${encodeURIComponent(ageGroupId)}`,
      );
      const payload = (await res.json().catch(() => null)) as
        | {
            success?: boolean;
            ageGroupName?: string;
            teamId?: string | null;
            canDeleteEvents?: boolean;
            sessions?: Array<Record<string, unknown>>;
            games?: Array<Record<string, unknown>>;
            error?: string;
          }
        | null;

      if (!res.ok || !payload?.success) {
        setEvents([]);
        setLoadError(payload?.error || "Erro ao carregar calendário.");
        return;
      }

      if (typeof payload.ageGroupName === "string" && payload.ageGroupName.trim()) {
        setAgeGroupName(payload.ageGroupName);
      }
      if (typeof payload.teamId === "string") {
        setTeamId(payload.teamId);
      }
      if (typeof payload.canDeleteEvents === "boolean") {
        setCanDeleteEvents(payload.canDeleteEvents);
      }

      const sessions = payload.sessions || [];
      const games = payload.games || [];

      const sessionEvents: CalEvent[] = (sessions || []).map((s) => ({
        id: String(s.id),
        type: "training" as const,
        date: String(s.session_date || ""),
        title: typeof s.title === "string" ? s.title : "Treino",
        start_time: typeof s.start_time === "string" ? s.start_time : undefined,
        end_time: typeof s.end_time === "string" ? s.end_time : undefined,
        notes: typeof s.notes === "string" ? s.notes : undefined,
        status: typeof s.status === "string" ? s.status : undefined,
        location: typeof s.location === "string" ? s.location : undefined,
        location_address:
          typeof s.location_address === "string" ? s.location_address : undefined,
        image_url: typeof s.image_url === "string" ? s.image_url : undefined,
      }));

      const gameEvents: CalEvent[] = (games || []).map((g) => ({
        id: String(g.id),
        type: "game" as const,
        date:
          typeof g.game_datetime === "string" ? g.game_datetime.split("T")[0] : "",
        title:
          typeof g.title === "string" && g.title.trim().length > 0
            ? g.title
            : typeof g.opponent_name === "string" ||
                typeof g.opponent_short_name === "string"
              ? formatFixtureOpponentLabel({
                  isHome: typeof g.is_home === "boolean" ? g.is_home : true,
                  opponentName:
                    typeof g.opponent_name === "string" ? g.opponent_name : undefined,
                  opponentShortName:
                    typeof g.opponent_short_name === "string"
                      ? g.opponent_short_name
                      : undefined,
                })
              : "Jogo",
        start_time:
          typeof g.game_datetime === "string"
            ? g.game_datetime.split("T")[1]?.substring(0, 5)
            : undefined,
        opponent_name:
          typeof g.opponent_name === "string" ? g.opponent_name : undefined,
        opponent_short_name:
          typeof g.opponent_short_name === "string"
            ? g.opponent_short_name
            : undefined,
        competition_id:
          typeof g.competition_id === "string" ? g.competition_id : undefined,
        location: typeof g.location === "string" ? g.location : undefined,
        location_address:
          typeof g.location_address === "string" ? g.location_address : undefined,
        is_home: typeof g.is_home === "boolean" ? g.is_home : undefined,
        status: typeof g.status === "string" ? g.status : undefined,
        image_url: typeof g.image_url === "string" ? g.image_url : undefined,
        notes: typeof g.notes === "string" ? g.notes : undefined,
      }));

      setEvents([...sessionEvents, ...gameEvents].sort(compareEventsByDateTime));
    } catch {
      setEvents([]);
      setLoadError("Erro de ligação ao carregar calendário.");
    }
  }, [ageGroupId, weekStart]);

  useEffect(() => {
    async function loadTeam() {
      setLoadError(null);
      const [contextRes, competitionsRes] = await Promise.all([
        fetch("/api/me/context"),
        fetch("/api/competitions"),
      ]);
      const payload = (await contextRes.json().catch(() => null)) as
        | {
            ageGroup?: { id?: string; club_name?: string; name?: string } | null;
            teamId?: string | null;
            error?: string;
          }
        | null;
      const competitionsPayload = (await competitionsRes.json().catch(() => null)) as
        | {
            success?: boolean;
            competitions?: Array<{
              id?: string;
              name?: string;
              season?: string | null;
              team_label?: string | null;
              is_active?: boolean;
            }>;
          }
        | null;

      if (!contextRes.ok) {
        setLoadError(payload?.error || "Erro ao carregar contexto do calendário.");
        setLoading(false);
        return;
      }

      const resolvedAgeGroupId = payload?.ageGroup?.id ?? null;
      const resolvedAgeGroupName =
        payload?.ageGroup?.club_name && payload?.ageGroup?.name
          ? `${payload.ageGroup.club_name} · ${payload.ageGroup.name}`
          : "";

      setAgeGroupId(resolvedAgeGroupId);
      setAgeGroupName(resolvedAgeGroupName);
      setTeamId(payload?.teamId ?? null);

      const options = (competitionsPayload?.competitions || [])
        .filter((competition) => !!competition.id)
        .map((competition) => ({
          id: competition.id as string,
          name: competition.name || "Competição",
          season: competition.season || null,
          team_label: competition.team_label || null,
          inactive: competition.is_active === false,
        }));
      setCompetitionOptions(options);
      setLoading(false);
    }

    void loadTeam();
  }, []);

  // Efeito de bootstrap/sincronização de dados com o backend.
  useEffect(() => {
    if (ageGroupId) void loadEvents();
  }, [ageGroupId, weekStart, loadEvents]);

  function openAdd(type: "training" | "game", date: string) {
    setSelectedEvent(null);
    setOpError(null);
    setForm({
      ...EMPTY_FORM,
      date,
      start_time: type === "training" ? "18:00" : "10:00",
    });
    setModalMode(type === "training" ? "add_training" : "add_game");
  }

  function openEdit(event: CalEvent) {
    setSelectedEvent(event);
    setOpError(null);
    setForm({
      title: event.title || "",
      date: event.date,
      start_time: event.start_time || "18:00",
      end_time: event.end_time || "",
      opponent_name: event.opponent_name || "",
      opponent_short_name: event.opponent_short_name || "",
      competition_id: event.competition_id || "",
      location: event.location || "",
      location_address: event.location_address || "",
      is_home: event.is_home ?? true,
      notes: event.notes || "",
      image_url: event.image_url || "",
    });
    setModalMode(event.type === "training" ? "edit_training" : "edit_game");
  }

  function closeModal() {
    setModalMode(null);
    setSelectedEvent(null);
    setForm(EMPTY_FORM);
    setOpError(null);
  }

  function handleGameFieldChange(
    field: keyof SharedGameFormValues,
    value: string | boolean,
  ) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !ageGroupId) return;
    setUploading(true);

    const ext = file.name.split(".").pop();
    const fileName = `${ageGroupId}/${Date.now()}.${ext}`;

    const { data, error } = await supabase.storage
      .from("event-images")
      .upload(fileName, file, { upsert: true });

    if (!error && data) {
      const { data: urlData } = supabase.storage
        .from("event-images")
        .getPublicUrl(data.path);
      setForm((f) => ({ ...f, image_url: urlData.publicUrl }));
    } else {
      console.error("Erro upload imagem:", error);
      setOpError(
        "Erro ao carregar imagem. Verifica se o bucket 'event-images' existe no Supabase Storage.",
      );
    }
    setUploading(false);
  }

  async function saveEvent() {
    if (!ageGroupId || !form.date) return;
    if (
      !isTrainingModal &&
      !isValidManualShortName(form.opponent_short_name, 2, 5)
    ) {
      setOpError("A sigla do adversário deve ter entre 2 e 5 caracteres.");
      return;
    }
    setSaving(true);
    setOpError(null);

    const isTraining =
      modalMode === "add_training" || modalMode === "edit_training";
    const isEditing =
      modalMode === "edit_training" || modalMode === "edit_game";

    try {
      const endpoint = "/api/calendar/events";
      const eventType = isTraining ? "training" : "game";
      const requestBody = {
        id: isEditing ? selectedEvent?.id || null : null,
        type: eventType,
        ageGroupId,
        teamId,
        payload: {
          title: form.title,
          date: form.date,
          start_time: form.start_time,
          end_time: form.end_time,
          opponent_name: form.opponent_name,
          opponent_short_name: normalizeManualShortName(
            form.opponent_short_name,
            5,
          ),
          competition_id: form.competition_id || null,
          location: form.location,
          location_address: form.location_address,
          is_home: form.is_home,
          notes: form.notes,
          image_url: form.image_url,
        },
      };

      const res = await fetch(endpoint, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const payload = (await res.json().catch(() => null)) as
        | { success?: boolean; error?: string; teamId?: string | null }
        | null;

      if (!res.ok || !payload?.success) {
        setOpError(payload?.error || "Erro ao guardar evento.");
        setSaving(false);
        return;
      }

      if (typeof payload.teamId === "string") {
        setTeamId(payload.teamId);
      }

      await loadEvents();
      closeModal();
    } catch {
      setOpError("Erro de ligação ao guardar evento.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteEvent() {
    if (!selectedEvent) return;
    if (!canDeleteEvents) {
      setOpError("Só o coordenador pode apagar jogos e treinos.");
      return;
    }
    setSaving(true);
    setOpError(null);

    try {
      const res = await fetch("/api/calendar/events", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedEvent.id,
          type: selectedEvent.type,
          ageGroupId,
        }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { success?: boolean; error?: string }
        | null;

      if (!res.ok || !payload?.success) {
        setOpError(payload?.error || "Erro ao apagar evento.");
        setSaving(false);
        return;
      }

      setEvents((prev) => prev.filter((e) => e.id !== selectedEvent.id));
      closeModal();
      void loadEvents();
    } catch {
      setOpError("Erro de ligação ao apagar evento.");
    } finally {
      setSaving(false);
    }
  }

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekLabel = `${format(weekStart, "d 'de' MMM", { locale: pt })} — ${format(
    addDays(weekStart, 6),
    "d 'de' MMM yyyy",
    { locale: pt },
  )}`;

  const isEditing = modalMode === "edit_training" || modalMode === "edit_game";
  const isTrainingModal =
    modalMode === "add_training" || modalMode === "edit_training";

  if (loading) {
    return (
      <div className="p-4 md:p-8 flex items-center justify-center min-h-[50vh]">
        <p className="text-slate-500">A carregar...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-4 md:p-8 text-center py-16">
        <AlertCircle size={40} className="text-red-300 mx-auto mb-3" />
        <p className="text-slate-700 text-sm">{loadError}</p>
      </div>
    );
  }

  if (!ageGroupId) {
    return (
      <div className="p-4 md:p-8 text-center py-16">
        <p className="text-slate-700 font-semibold mb-2">
          Sem escalão configurado
        </p>
        <p className="text-slate-500 text-sm">
          Configura o teu escalão em Configurações antes de usar o calendário.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Calendário</h1>
          <p className="text-slate-500 text-sm">{ageGroupName}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWeekStart((w) => subWeeks(w, 1))}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <ChevronLeft size={20} className="text-slate-600" />
          </button>
          <button
            onClick={() =>
              setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))
            }
            className="text-xs font-medium text-emerald-600 hover:underline px-2"
          >
            Hoje
          </button>
          <button
            onClick={() => setWeekStart((w) => addWeeks(w, 1))}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <ChevronRight size={20} className="text-slate-600" />
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-400 mb-4 capitalize">{weekLabel}</p>

      <div className="flex gap-4 mb-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />{" "}
          Treino
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />{" "}
          Jogo
        </span>
      </div>

      {/* Grelha da semana */}
      <div className="space-y-2">
        {days.map((day, i) => {
          const dayStr = format(day, "yyyy-MM-dd");
          const dayEvents = events
            .filter((e) => e.date === dayStr)
            .sort(compareEventsByDateTime);
          const isCurrentDay = isToday(day);

          return (
            <div
              key={dayStr}
              className={`rounded-xl border-2 overflow-hidden ${
                isCurrentDay ? "border-emerald-400" : "border-slate-100"
              }`}
            >
              {/* Cabeçalho do dia */}
              <div
                className={`flex items-center gap-3 px-4 py-2 ${isCurrentDay ? "bg-emerald-50" : "bg-slate-50"}`}
              >
                <span
                  className={`text-sm font-semibold w-8 ${isCurrentDay ? "text-emerald-700" : "text-slate-600"}`}
                >
                  {DAY_NAMES[i]}
                </span>
                <span
                  className={`text-sm ${isCurrentDay ? "text-emerald-600 font-bold" : "text-slate-500"}`}
                >
                  {format(day, "d MMM", { locale: pt })}
                </span>
                {isCurrentDay && (
                  <span className="text-xs bg-emerald-500 text-white px-2 py-0.5 rounded-full">
                    Hoje
                  </span>
                )}
                <div className="ml-auto flex gap-1">
                  <button
                    onClick={() => openAdd("training", dayStr)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs text-emerald-600 hover:bg-emerald-100 transition-colors"
                  >
                    <Plus size={12} /> Treino
                  </button>
                  <button
                    onClick={() => openAdd("game", dayStr)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    <Plus size={12} /> Jogo
                  </button>
                </div>
              </div>

              {/* Eventos do dia */}
              <div className="bg-white">
                {dayEvents.length === 0 ? (
                  <p className="px-4 py-2.5 text-xs text-slate-300">
                    Sem eventos
                  </p>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {dayEvents.map((event) => (
                      <button
                        key={event.id}
                        onClick={() => openEdit(event)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
                      >
                        {event.image_url ? (
                          <img
                            src={event.image_url}
                            alt=""
                            className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                          />
                        ) : (
                          <div
                            className={`w-2 h-10 rounded-full flex-shrink-0 ${
                              event.type === "game"
                                ? "bg-blue-500"
                                : "bg-emerald-500"
                            }`}
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-800 text-sm truncate">
                            {event.type === "game" ? "⚽" : "🏃"} {event.title}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {event.start_time && (
                              <span className="text-xs text-slate-400 flex items-center gap-0.5">
                                <Clock size={10} />{" "}
                                {event.start_time.substring(0, 5)}
                              </span>
                            )}
                            {(event.location_address || event.location) && (
                              <span className="text-xs text-slate-400 flex items-center gap-0.5 truncate">
                                <MapPin size={10} />
                                {event.location_address || event.location}
                              </span>
                            )}
                          </div>
                        </div>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                            event.status === "completed"
                              ? "bg-slate-100 text-slate-500"
                              : "bg-emerald-50 text-emerald-600"
                          }`}
                        >
                          {event.status === "completed"
                            ? "Fechado"
                            : "Agendado"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── MODAL ── */}
      {modalMode && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[calc(100dvh-1rem)] md:max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header do modal */}
            <div className="flex justify-between items-center p-5 border-b bg-white z-10 shrink-0">
              <h3 className="font-bold text-slate-900">
                {modalMode === "add_training" && "🏃 Novo Treino"}
                {modalMode === "add_game" && "⚽ Novo Jogo"}
                {modalMode === "edit_training" && "✏️ Editar Treino"}
                {modalMode === "edit_game" && "✏️ Editar Jogo"}
              </h3>
              <button onClick={closeModal}>
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            <div
              className="p-5 space-y-5 flex-1 overflow-y-auto pb-[max(6rem,env(safe-area-inset-bottom))]"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {/* Erro visível */}
              {opError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl">
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Erro</p>
                    <p className="text-xs mt-0.5">{opError}</p>
                  </div>
                </div>
              )}

              {/* Imagem */}
              <div>
                <Label className="mb-2 block">
                  <ImageIcon size={14} className="inline mr-1" />
                  Imagem do evento
                </Label>
                {form.image_url ? (
                  <div className="relative">
                    <img
                      src={form.image_url}
                      alt="thumbnail"
                      className="w-full h-36 object-cover rounded-xl"
                    />
                    <button
                      onClick={() => setForm((f) => ({ ...f, image_url: "" }))}
                      className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="w-full h-24 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center gap-1 text-slate-400 hover:border-emerald-300 hover:text-emerald-500 transition-colors"
                  >
                    <ImageIcon size={24} />
                    <span className="text-xs">
                      {uploading
                        ? "A carregar..."
                        : "Toca para adicionar imagem"}
                    </span>
                  </button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                />
              </div>

              {/* Título */}
              <div className="space-y-1">
                <Label>Título</Label>
                <Input
                  value={form.title}
                  placeholder={
                    isTrainingModal ? "ex: Treino físico" : "ex: Jornada 5"
                  }
                  onChange={(e) =>
                    setForm((f) => ({ ...f, title: e.target.value }))
                  }
                />
              </div>

              {/* Só jogos: adversário + casa/fora */}
              {!isTrainingModal && (
                <GameFormFields
                  values={form}
                  onFieldChange={handleGameFieldChange}
                  competitionOptions={competitionOptions}
                  showCompetitionSelect
                />
              )}

              {/* Data e hora */}
              {isTrainingModal && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>
                      <Clock size={12} className="inline mr-1" />
                      Data *
                    </Label>
                    <Input
                      type="date"
                      value={form.date}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, date: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Hora</Label>
                    <Input
                      type="time"
                      value={form.start_time}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, start_time: e.target.value }))
                      }
                    />
                  </div>
                </div>
              )}

              {/* Local */}
              {isTrainingModal && (
                <LocationFields
                  location={form.location}
                  locationAddress={form.location_address}
                  onLocationChange={(value) =>
                    setForm((current) => ({ ...current, location: value }))
                  }
                  onLocationAddressChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      location_address: value,
                    }))
                  }
                  accent="emerald"
                />
              )}

              {/* Notas */}
              <NotesEditor
                value={form.notes}
                onChange={(value) =>
                  setForm((current) => ({ ...current, notes: value }))
                }
                accent={isTrainingModal ? "emerald" : "blue"}
                rows={6}
              />
            </div>

            <div className="border-t bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shrink-0">
              <div className="flex gap-2">
                <Button
                  onClick={saveEvent}
                  disabled={saving || uploading || !form.date}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                >
                  {saving
                    ? "A guardar..."
                    : isEditing
                      ? "Guardar alterações"
                      : "Adicionar"}
                </Button>
                {isEditing && canDeleteEvents && (
                  <Button
                    variant="outline"
                    onClick={deleteEvent}
                    disabled={saving}
                    className="text-red-500 hover:bg-red-50 border-red-200"
                  >
                    Apagar
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
