"use client";

import { useState, useEffect, useRef } from "react";
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
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DAY_NAMES = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

interface CalEvent {
  id: string;
  type: "training" | "game";
  date: string;
  title?: string;
  start_time?: string;
  notes?: string;
  status?: string;
  opponent_name?: string;
  location?: string;
  location_address?: string;
  location_lat?: number;
  location_lng?: number;
  is_home?: boolean;
  image_url?: string;
  team_id?: string;
}

type ModalMode = "add_training" | "add_game" | "edit_training" | "edit_game";

interface EventForm {
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  opponent_name: string;
  location: string;
  location_address: string;
  is_home: boolean;
  notes: string;
  image_url: string;
}

const EMPTY_FORM: EventForm = {
  title: "",
  date: "",
  start_time: "18:00",
  end_time: "",
  opponent_name: "",
  location: "",
  location_address: "",
  is_home: true,
  notes: "",
  image_url: "",
};

export default function CalendarPage() {
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [weekStart, setWeekStart] = useState(
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  );
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [ageGroupName, setAgeGroupName] = useState("");

  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);
  const [form, setForm] = useState<EventForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadTeam();
  }, []);
  useEffect(() => {
    if (teamId) loadEvents();
  }, [teamId, weekStart]);

  async function loadTeam() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data: ag } = await supabase
      .from("age_groups")
      .select("*, teams(*)")
      .eq("coordinator_id", user.id)
      .single();
    if (ag?.teams?.[0]) {
      setTeamId(ag.teams[0].id);
      setAgeGroupName(`${ag.club_name} · ${ag.name}`);
    }
    setLoading(false);
  }

  async function loadEvents() {
    if (!teamId) return;
    const from = format(weekStart, "yyyy-MM-dd");
    const to = format(addDays(weekStart, 6), "yyyy-MM-dd");

    const { data: sessions } = await supabase
      .from("training_sessions")
      .select("*")
      .eq("team_id", teamId)
      .gte("session_date", from)
      .lte("session_date", to);

    const { data: games } = await supabase
      .from("games")
      .select("*")
      .eq("team_id", teamId)
      .gte("game_datetime", `${from}T00:00:00`)
      .lte("game_datetime", `${to}T23:59:59`);

    const sessionEvents: CalEvent[] = (sessions || []).map((s) => ({
      id: s.id,
      type: "training",
      date: s.session_date,
      title: s.title || "Treino",
      start_time: s.start_time,
      notes: s.notes,
      status: s.status,
      location: s.location,
      location_address: s.location_address,
      image_url: s.image_url,
      team_id: s.team_id,
    }));

    const gameEvents: CalEvent[] = (games || []).map((g) => ({
      id: g.id,
      type: "game",
      date: g.game_datetime?.split("T")[0] || "",
      title: g.title || (g.opponent_name ? `vs ${g.opponent_name}` : "Jogo"),
      start_time: g.game_datetime?.split("T")[1]?.substring(0, 5),
      opponent_name: g.opponent_name,
      location: g.location,
      location_address: g.location_address,
      location_lat: g.location_lat,
      location_lng: g.location_lng,
      is_home: g.is_home,
      status: g.status,
      image_url: g.image_url,
      notes: g.notes,
      team_id: g.team_id,
    }));

    setEvents([...sessionEvents, ...gameEvents]);
  }

  function openAdd(type: "training" | "game", date: string) {
    setSelectedEvent(null);
    setForm({
      ...EMPTY_FORM,
      date,
      start_time: type === "training" ? "18:00" : "10:00",
    });
    setModalMode(type === "training" ? "add_training" : "add_game");
  }

  function openEdit(event: CalEvent) {
    setSelectedEvent(event);
    setForm({
      title: event.title || "",
      date: event.date,
      start_time: event.start_time || "18:00",
      end_time: "",
      opponent_name: event.opponent_name || "",
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
  }

  // Upload de imagem para o Supabase Storage
  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !teamId) return;
    setUploading(true);

    const ext = file.name.split(".").pop();
    const fileName = `${teamId}/${Date.now()}.${ext}`;

    const { data, error } = await supabase.storage
      .from("event-images")
      .upload(fileName, file, { upsert: true });

    if (!error && data) {
      const { data: urlData } = supabase.storage
        .from("event-images")
        .getPublicUrl(data.path);
      setForm((f) => ({ ...f, image_url: urlData.publicUrl }));
    }
    setUploading(false);
  }

  async function saveEvent() {
    if (!teamId || !form.date) return;
    setSaving(true);

    const isTraining =
      modalMode === "add_training" || modalMode === "edit_training";
    const isEditing =
      modalMode === "edit_training" || modalMode === "edit_game";

    if (isTraining) {
      const payload = {
        team_id: teamId,
        title: form.title || "Treino",
        session_date: form.date,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        location: form.location || null,
        location_address: form.location_address || null,
        notes: form.notes || null,
        image_url: form.image_url || null,
        status: "scheduled",
      };
      if (isEditing && selectedEvent) {
        await supabase
          .from("training_sessions")
          .update(payload)
          .eq("id", selectedEvent.id);
      } else {
        await supabase.from("training_sessions").insert(payload);
      }
    } else {
      const datetime = `${form.date}T${form.start_time}:00`;
      const payload = {
        team_id: teamId,
        title:
          form.title ||
          (form.opponent_name ? `vs ${form.opponent_name}` : "Jogo"),
        game_datetime: datetime,
        opponent_name: form.opponent_name || null,
        location: form.location || null,
        location_address: form.location_address || null,
        is_home: form.is_home,
        notes: form.notes || null,
        image_url: form.image_url || null,
        status: "scheduled",
        game_type: "league",
      };
      if (isEditing && selectedEvent) {
        await supabase.from("games").update(payload).eq("id", selectedEvent.id);
      } else {
        await supabase.from("games").insert(payload);
      }
    }

    await loadEvents();
    closeModal();
    setSaving(false);
  }

  async function deleteEvent() {
    if (!selectedEvent) return;
    setSaving(true);
    if (selectedEvent.type === "training") {
      await supabase
        .from("training_sessions")
        .delete()
        .eq("id", selectedEvent.id);
    } else {
      await supabase.from("games").delete().eq("id", selectedEvent.id);
    }
    await loadEvents();
    closeModal();
    setSaving(false);
  }

  function getMapsUrl(event: CalEvent) {
    const query = event.location_address || event.location || "";
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
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

      {/* Grelha */}
      <div className="space-y-2">
        {days.map((day, i) => {
          const dayStr = format(day, "yyyy-MM-dd");
          const dayEvents = events.filter((e) => e.date === dayStr);
          const isCurrentDay = isToday(day);

          return (
            <div
              key={dayStr}
              className={`rounded-xl border-2 overflow-hidden ${
                isCurrentDay ? "border-emerald-400" : "border-slate-100"
              }`}
            >
              {/* Cabeçalho */}
              <div
                className={`flex items-center gap-3 px-4 py-2 ${
                  isCurrentDay ? "bg-emerald-50" : "bg-slate-50"
                }`}
              >
                <span
                  className={`text-sm font-semibold w-8 ${
                    isCurrentDay ? "text-emerald-700" : "text-slate-600"
                  }`}
                >
                  {DAY_NAMES[i]}
                </span>
                <span
                  className={`text-sm ${
                    isCurrentDay
                      ? "text-emerald-600 font-bold"
                      : "text-slate-500"
                  }`}
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

              {/* Eventos */}
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
                        {/* Thumbnail */}
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
            className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex justify-between items-center p-5 border-b sticky top-0 bg-white z-10">
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

            <div className="p-5 space-y-5">
              {/* Imagem thumbnail */}
              <div>
                <Label className="mb-2 block">
                  <ImageIcon size={14} className="inline mr-1" /> Imagem do
                  evento
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

              {/* Só para jogos: adversário + casa/fora */}
              {!isTrainingModal && (
                <>
                  <div className="space-y-1">
                    <Label>Adversário</Label>
                    <Input
                      value={form.opponent_name}
                      placeholder="ex: Sporting CP"
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          opponent_name: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Casa ou Fora?</Label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setForm((f) => ({ ...f, is_home: true }))
                        }
                        className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition-colors ${
                          form.is_home
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 text-slate-500"
                        }`}
                      >
                        🏠 Casa
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setForm((f) => ({ ...f, is_home: false }))
                        }
                        className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition-colors ${
                          !form.is_home
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-slate-200 text-slate-500"
                        }`}
                      >
                        ✈️ Fora
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Data e hora */}
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

              {/* Local */}
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>
                    <MapPin size={12} className="inline mr-1" />
                    Nome do local
                  </Label>
                  <Input
                    value={form.location}
                    placeholder="ex: Campo 1, Complexo Desportivo"
                    onChange={(e) =>
                      setForm((f) => ({ ...f, location: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Morada completa</Label>
                  <Input
                    value={form.location_address}
                    placeholder="ex: Rua do Campo, 1, Lisboa"
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        location_address: e.target.value,
                      }))
                    }
                  />
                  {form.location_address && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(form.location_address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-emerald-600 hover:underline flex items-center gap-1 mt-1"
                    >
                      <MapPin size={10} /> Ver no Google Maps ↗
                    </a>
                  )}
                </div>
              </div>

              {/* Notas */}
              <div className="space-y-1">
                <Label>
                  <FileText size={12} className="inline mr-1" />
                  Notas
                </Label>
                <textarea
                  value={form.notes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  placeholder="Informações adicionais, instruções, equipamento..."
                  rows={4}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>

              {/* Botões */}
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={saveEvent}
                  disabled={saving || !form.date}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                >
                  {saving
                    ? "A guardar..."
                    : isEditing
                      ? "Guardar alterações"
                      : "Adicionar"}
                </Button>
                {isEditing && (
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
