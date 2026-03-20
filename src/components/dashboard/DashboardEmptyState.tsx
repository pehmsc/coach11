import Link from "next/link";
import { Users, Calendar, Trophy, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function DashboardEmptyState({ clubName }: { clubName?: string | null }) {
  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">
          {clubName ? `Bem-vindo, ${clubName}!` : "Bem-vindo ao Coach11!"}
        </h1>
        <p className="text-sm text-slate-500">
          O teu clube foi criado. Começa por criar a primeira equipa.
        </p>
      </div>

      <Card className="border-emerald-200 bg-emerald-50">
        <CardContent className="pt-6 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
            <Users size={28} />
          </div>
          <div>
            <h2 className="font-bold text-slate-900">Cria a primeira equipa</h2>
            <p className="text-sm text-slate-600 mt-1">
              Define o escalão, formato de jogo, e começa a gerir jogadores, treinos e jogos.
            </p>
          </div>
          <Link href="/teams">
            <Button className="bg-emerald-600 hover:bg-emerald-700">
              Criar equipa →
            </Button>
          </Link>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-slate-50">
          <CardContent className="pt-5 text-center space-y-2">
            <Calendar size={20} className="mx-auto text-slate-400" />
            <p className="text-xs text-slate-500">Treinos e calendário</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-50">
          <CardContent className="pt-5 text-center space-y-2">
            <Trophy size={20} className="mx-auto text-slate-400" />
            <p className="text-xs text-slate-500">Jogos e competições</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-50">
          <CardContent className="pt-5 text-center space-y-2">
            <Users size={20} className="mx-auto text-slate-400" />
            <p className="text-xs text-slate-500">Plantel e convocatórias</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-50">
          <CardContent className="pt-5 text-center space-y-2">
            <ClipboardList size={20} className="mx-auto text-slate-400" />
            <p className="text-xs text-slate-500">Estatísticas e presenças</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
