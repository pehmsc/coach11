import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Users, Calendar, ClipboardCheck, Settings } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Buscar escalão do coordinator
  const { data: ageGroups } = await supabase
    .from("age_groups")
    .select("*, teams(*)")
    .eq("coordinator_id", user.id);

  const hasSetup = ageGroups && ageGroups.length > 0;
  const today = format(new Date(), "EEEE, d 'de' MMMM", { locale: pt });

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <p className="text-slate-500 text-sm capitalize">{today}</p>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">
          Seja bem-vindo! 👋
        </h1>
      </div>

      {/* Se ainda não tem setup */}
      {!hasSetup && (
        <Card className="border-emerald-200 bg-emerald-50 mb-6">
          <CardContent className="pt-6">
            <h2 className="font-semibold text-emerald-900 mb-2">
              Começa por configurar o teu escalão
            </h2>
            <p className="text-emerald-700 text-sm mb-4">
              Cria o teu escalão, equipas e adiciona os teus atletas para
              começar.
            </p>
            <Link href="/team/setup">
              <Button className="bg-emerald-600 hover:bg-emerald-700">
                Configurar escalão
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Atalhos rápidos */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Link href="/attendance">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-2 hover:border-emerald-300">
            <CardContent className="pt-6 pb-4 text-center">
              <ClipboardCheck
                className="mx-auto mb-2 text-emerald-600"
                size={28}
              />
              <p className="font-semibold text-sm text-slate-700">
                Marcar Presenças
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/players">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-2 hover:border-emerald-300">
            <CardContent className="pt-6 pb-4 text-center">
              <Users className="mx-auto mb-2 text-emerald-600" size={28} />
              <p className="font-semibold text-sm text-slate-700">Plantel</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/calendar">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-2 hover:border-emerald-300">
            <CardContent className="pt-6 pb-4 text-center">
              <Calendar className="mx-auto mb-2 text-emerald-600" size={28} />
              <p className="font-semibold text-sm text-slate-700">Calendário</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/team/setup">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-2 hover:border-emerald-300">
            <CardContent className="pt-6 pb-4 text-center">
              <Settings className="mx-auto mb-2 text-emerald-600" size={28} />
              <p className="font-semibold text-sm text-slate-700">
                Configurações
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
