"use client";

import { useState } from "react";
import { Users, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AgeGroupCreateModal } from "@/components/team/AgeGroupCreateModal";

interface Props {
  title?: string;
  description?: string;
  /** Quando true, nao envolve num container de pagina (para usar dentro de um). */
  bare?: boolean;
  onCreated?: () => void;
}

/**
 * Empty-state acionavel para quando o utilizador nao tem escalao no contexto.
 * O botao abre o modal de criacao in-place (rede de seguranca duravel: recupera
 * contas presas sem depender do /teams, intermitente para o individual).
 */
export function NoAgeGroupEmptyState({
  title = "Ainda não tens nenhum escalão",
  description = "Cria o teu primeiro escalão para começares a gerir plantel, treinos e jogos.",
  bare = false,
  onCreated,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);

  const card = (
    <Card className="border-emerald-200 bg-emerald-50/50">
      <CardContent className="space-y-4 pb-8 pt-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
          <Users size={28} />
        </div>
        <div>
          <h2 className="font-bold text-slate-900">{title}</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">{description}</p>
        </div>
        <Button
          onClick={() => setModalOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          <Plus size={16} className="mr-1.5" />
          Criar escalão
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <>
      {bare ? card : <div className="mx-auto max-w-2xl p-4 md:p-8">{card}</div>}
      <AgeGroupCreateModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onCreated={onCreated}
      />
    </>
  );
}
