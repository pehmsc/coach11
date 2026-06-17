"use client";

import { PublicSharePanel } from "@/components/team/PublicSharePanel";
import { AgeGroupForm } from "@/components/team/setup/AgeGroupForm";
import { ClubLogoUpload } from "@/components/team/setup/ClubLogoUpload";
import { KitsSection } from "@/components/team/setup/KitsSection";
import { StaffSection } from "@/components/team/setup/StaffSection";
import { LegacyStaffSection } from "@/components/team/setup/LegacyStaffSection";
import { DangerZoneSection } from "@/components/team/setup/DangerZoneSection";
import { DeleteAgeGroupModal } from "@/components/team/setup/DeleteAgeGroupModal";
import { useTeamSetup } from "@/lib/hooks/useTeamSetup";

export default function TeamSetupPage() {
  const setup = useTeamSetup();

  if (setup.loading)
    return (
      <div className="p-4 md:p-8">
        <p className="text-slate-500">A carregar...</p>
      </div>
    );

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Configurações</h1>
      {setup.error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg border border-red-200">
          {setup.error}
        </div>
      )}

      {/* -- SECCAO 1: ESCALAO -- */}
      <AgeGroupForm
        existingAgeGroup={setup.existingAgeGroup}
        isEditing={setup.isEditing}
        setIsEditing={setup.setIsEditing}
        accountRole={setup.accountRole}
        saved={setup.saved}
        saving={setup.saving}
        clubName={setup.clubName}
        setClubName={setup.setClubName}
        clubShortName={setup.clubShortName}
        setClubShortName={setup.setClubShortName}
        ageGroupName={setup.ageGroupName}
        setAgeGroupName={setup.setAgeGroupName}
        footballFormat={setup.footballFormat}
        setFootballFormat={setup.setFootballFormat}
        season={setup.season}
        setSeason={setup.setSeason}
        handleSaveSetup={setup.handleSaveSetup}
      />

      {/* -- SECCAO 2: LOGOTIPO DO CLUBE -- */}
      {false && setup.existingAgeGroup && (
        <ClubLogoUpload
          logoUrl={setup.logoUrl}
          uploadingLogo={setup.uploadingLogo}
          logoRef={setup.logoRef}
          handleLogoUpload={setup.handleLogoUpload}
        />
      )}

      {/* -- SECCAO 3: KITS DA EQUIPA -- */}
      {setup.existingAgeGroup && setup.teamId && (
        <KitsSection
          kitStatusMessage={setup.kitStatusMessage}
          kitsExpanded={setup.kitsExpanded}
          setKitsExpanded={setup.setKitsExpanded}
          kitColors={setup.kitColors}
          setKitColors={setup.setKitColors}
          savingKit={setup.savingKit}
          kitSaveTimers={setup.kitSaveTimers}
          getKitPiece={setup.getKitPiece}
          handleKitColorChange={setup.handleKitColorChange}
        />
      )}

      {/* -- SECCAO 4: LINK PUBLICO -- */}
      {setup.existingAgeGroup && (
        <PublicSharePanel
          ageGroupId={setup.existingAgeGroup.id}
          canManage={setup.accountRole === "coordinator" || setup.isSuperCoordinator}
        />
      )}

      {/* -- SECCAO 5: EQUIPA TECNICA -- */}
      {/* Escondida para o individual (plano sem equipa tecnica). Cosmetico — a
          fronteira real e o guard de /api/invite/staff. */}
      {setup.existingAgeGroup && !setup.isIndividual && (setup.accountRole === "coordinator" || setup.isSuperCoordinator) && (
        <StaffSection isSuperCoordinator={setup.isSuperCoordinator} />
      )}

      {false && setup.existingAgeGroup && (
        <LegacyStaffSection
          accountRole={setup.accountRole}
          showStaffForm={setup.showStaffForm}
          setShowStaffForm={setup.setShowStaffForm}
          inviteResult={setup.inviteResult}
          setInviteResult={setup.setInviteResult}
          copiedCode={setup.copiedCode}
          copyCode={setup.copyCode}
          staffForm={setup.staffForm}
          setStaffForm={setup.setStaffForm}
          sendingInvite={setup.sendingInvite}
          handleSendStaffInvite={setup.handleSendStaffInvite}
          staffInvites={setup.staffInvites}
          activeStaffProfileIds={setup.activeStaffProfileIds}
          staffInvitesExpanded={setup.staffInvitesExpanded}
          setStaffInvitesExpanded={setup.setStaffInvitesExpanded}
          confirmDeleteId={setup.confirmDeleteId}
          setConfirmDeleteId={setup.setConfirmDeleteId}
          deletingId={setup.deletingId}
          handleDeleteInvite={setup.handleDeleteInvite}
          setError={setup.setError}
        />
      )}

      {setup.existingAgeGroup && (setup.accountRole === "coordinator" || setup.isSuperCoordinator) && (
        <DangerZoneSection
          setDeleteAgeGroupConfirmText={setup.setDeleteAgeGroupConfirmText}
          setDeleteAgeGroupModalOpen={setup.setDeleteAgeGroupModalOpen}
        />
      )}

      {setup.deleteAgeGroupModalOpen && setup.existingAgeGroup && (
        <DeleteAgeGroupModal
          existingAgeGroup={setup.existingAgeGroup}
          deletingAgeGroup={setup.deletingAgeGroup}
          deleteAgeGroupConfirmText={setup.deleteAgeGroupConfirmText}
          setDeleteAgeGroupConfirmText={setup.setDeleteAgeGroupConfirmText}
          setDeleteAgeGroupModalOpen={setup.setDeleteAgeGroupModalOpen}
          handleDeleteAgeGroup={setup.handleDeleteAgeGroup}
        />
      )}
    </div>
  );
}
