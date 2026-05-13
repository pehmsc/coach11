"use client";

import { AlertCircle } from "lucide-react";
import { useCalendarData } from "@/lib/hooks/useCalendarData";
import { useCalendarModal } from "@/lib/hooks/useCalendarModal";
import { CalendarHeader } from "@/components/calendar/CalendarHeader";
import { CalendarDayRow } from "@/components/calendar/CalendarDayRow";
import { CalendarEventModal } from "@/components/calendar/CalendarEventModal";

export default function CalendarPage() {
  const {
    weekStart,
    events,
    setEvents,
    loading,
    ageGroupId,
    teamId,
    setTeamId,
    ageGroupName,
    canDeleteEvents,
    loadError,
    competitionOptions,
    loadEvents,
    days,
    goToPreviousWeek,
    goToNextWeek,
    goToCurrentWeek,
  } = useCalendarData();

  const {
    modalMode,
    setModalScreen,
    selectedEvent,
    form,
    setForm,
    saving,
    opError,
    draftMode,
    isEditing,
    isTrainingModal,
    canEditSelectedEvent,
    canCorrectSelectedEventAttendance,
    showReadOnlyEventSummary,
    openAdd,
    openEdit,
    duplicateSelectedEvent,
    closeModal,
    handleGameFieldChange,
    saveEvent,
    deleteEvent,
    openAttendanceCorrectionFromCalendar,
    opponentSelection,
    handleOpponentSelectionChange,
  } = useCalendarModal({
    ageGroupId,
    teamId,
    setTeamId,
    canDeleteEvents,
    setEvents,
    loadEvents,
  });

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
      <CalendarHeader
        weekStart={weekStart}
        ageGroupName={ageGroupName}
        goToPreviousWeek={goToPreviousWeek}
        goToNextWeek={goToNextWeek}
        goToCurrentWeek={goToCurrentWeek}
      />

      {/* Grelha da semana */}
      <div className="space-y-2">
        {days.map((day, i) => (
          <CalendarDayRow
            key={day.toISOString()}
            day={day}
            dayIndex={i}
            events={events}
            onAddTraining={(date) => openAdd("training", date)}
            onAddGame={(date) => openAdd("game", date)}
            onEditEvent={openEdit}
          />
        ))}
      </div>

      {/* ── MODAL ── */}
      {modalMode && (
        <CalendarEventModal
          modalMode={modalMode}
          draftMode={draftMode}
          showReadOnlyEventSummary={showReadOnlyEventSummary}
          selectedEvent={selectedEvent}
          form={form}
          setForm={setForm}
          isEditing={isEditing}
          isTrainingModal={isTrainingModal}
          canEditSelectedEvent={canEditSelectedEvent}
          canCorrectSelectedEventAttendance={canCorrectSelectedEventAttendance}
          canDeleteEvents={canDeleteEvents}
          saving={saving}
          opError={opError}
          competitionOptions={competitionOptions}
          ageGroupId={ageGroupId}
          onClose={closeModal}
          onSave={saveEvent}
          onDelete={deleteEvent}
          onDuplicate={duplicateSelectedEvent}
          onEditScreen={() => setModalScreen("edit")}
          onViewScreen={() => setModalScreen("view")}
          onGameFieldChange={handleGameFieldChange}
          onAttendanceCorrection={openAttendanceCorrectionFromCalendar}
          opponentSelection={opponentSelection}
          onOpponentSelectionChange={handleOpponentSelectionChange}
        />
      )}
    </div>
  );
}
