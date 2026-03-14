"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertTriangle } from "lucide-react";
import type { AgeGroup } from "@/components/team/setup/types";

interface DeleteAgeGroupModalProps {
  existingAgeGroup: AgeGroup;
  deletingAgeGroup: boolean;
  deleteAgeGroupConfirmText: string;
  setDeleteAgeGroupConfirmText: (v: string) => void;
  setDeleteAgeGroupModalOpen: (v: boolean) => void;
  handleDeleteAgeGroup: () => void;
}

export function DeleteAgeGroupModal({
  existingAgeGroup,
  deletingAgeGroup,
  deleteAgeGroupConfirmText,
  setDeleteAgeGroupConfirmText,
  setDeleteAgeGroupModalOpen,
  handleDeleteAgeGroup,
}: DeleteAgeGroupModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 md:items-center"
      onClick={() => {
        if (!deletingAgeGroup) setDeleteAgeGroupModalOpen(false);
      }}
    >
      <div
        className="flex max-h-[calc(100dvh-1rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl md:max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b p-5">
          <h3 className="flex items-center gap-2 font-bold text-slate-900">
            <AlertTriangle size={18} className="text-red-500" />
            Confirmar apagamento do escalão
          </h3>
          <p className="mt-2 text-sm text-slate-500">
            Esta ação é irreversível. Para confirmar, escreve{" "}
            <strong>APAGAR ESCALAO</strong>.
          </p>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-900">
            <p className="font-medium">
              {existingAgeGroup.club_name} · {existingAgeGroup.name}
            </p>
            <p className="mt-1 text-red-800">
              Links públicos, convites e ficheiros em storage deste escalão também
              serão removidos.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Confirmação</Label>
            <Input
              value={deleteAgeGroupConfirmText}
              onChange={(e) => setDeleteAgeGroupConfirmText(e.target.value)}
              placeholder="APAGAR ESCALAO"
              disabled={deletingAgeGroup}
            />
          </div>
        </div>

        <div className="border-t bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setDeleteAgeGroupModalOpen(false)}
              disabled={deletingAgeGroup}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1 bg-red-600 hover:bg-red-700"
              onClick={() => void handleDeleteAgeGroup()}
              disabled={deletingAgeGroup}
            >
              {deletingAgeGroup ? (
                <Loader2 size={16} className="mr-2 animate-spin" />
              ) : null}
              Apagar escalão
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
