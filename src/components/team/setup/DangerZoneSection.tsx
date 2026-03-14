"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Trash2 } from "lucide-react";

interface DangerZoneSectionProps {
  setDeleteAgeGroupConfirmText: (v: string) => void;
  setDeleteAgeGroupModalOpen: (v: boolean) => void;
}

export function DangerZoneSection({
  setDeleteAgeGroupConfirmText,
  setDeleteAgeGroupModalOpen,
}: DangerZoneSectionProps) {
  return (
    <Card className="border-red-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-red-700">Zona de perigo</CardTitle>
        <CardDescription>
          Apaga o escalão e todos os dados associados, mantendo a tua conta ativa.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-slate-600">
          Esta ação remove equipa técnica, jogadores, jogos, treinos,
          convocatórias, estatísticas, links públicos, convites e imagens do
          escalão.
        </p>
        <Button
          variant="outline"
          className="w-full border-red-200 text-red-600 hover:bg-red-50"
          onClick={() => {
            setDeleteAgeGroupConfirmText("");
            setDeleteAgeGroupModalOpen(true);
          }}
        >
          <Trash2 size={16} className="mr-2" />
          Apagar escalão
        </Button>
      </CardContent>
    </Card>
  );
}
