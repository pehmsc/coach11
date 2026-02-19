import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { format, addDays } from "date-fns";
import { pt } from "date-fns/locale";
import {
  Users,
  Calendar,
  ClipboardCheck,
  Settings,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const { data: ageGroups } = await supabase
    .from("age_groups")
    .select("*, teams(*)")
    .eq("coordinator_id", user.id);

  const hasSetup = ageGroups && ageGroups.length > 0;
  const firstTeam = ageGroups?.[0]?.teams?.[0];

  const todayDate = format(new Date(), "yyyy-MM-dd");
  const in48h = format(addDays(new Date(), 2), "yyyy-MM-dd");

  // Buscar sessão de hoje
  let todaySession = null;
  let todayAttendanceDone = false;
  if (firstTeam) {
    const { data: session } = await supabase
      .from("training_sessions")
      .select("*")
      .eq("team_id", firstTeam.id)
      .eq("session_date", todayDate)
      .maybeSingle();
    todaySession = session;
    todayAttendanceDone = session?.status === "completed";
  }

  // Buscar jogos nas próximas 48h sem convocatória
  let upcomingGame = null;
  if (firstTeam) {
    const { data: game } = await supabase
      .from("games")
      .select("*")
      .eq("team_id", firstTeam.id)
      .gte("game_datetime", `${todayDate}T00:00:00`)
      .lte("game_datetime", `${in48h}T23:59:59`)
      .maybeSingle();
    upcomingGame = game;
  }

  const today = format(new Date(), "EEEE, d 'de' MMMM", { locale: pt });
  const firstName = profile?.full_name?.split(" ")[0] || "Treinador";

  const navCards = [
    {
      href: "/attendance",
      icon: ClipboardCheck,
      label: "Presenças",
      color: "text-emerald-600",
    },
    { href: "/players", icon: Users, label: "Plantel", color: "text-blue-600" },
    {
      href: "/calendar",
      icon: Calendar,
      label: "Calendário",
      color: "text-purple-600",
    },
    {
      href: "/team/setup",
      icon: Settings,
      label: "Configurações",
      color: "text-slate-600",
    },
  ];

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <p className="text-slate-500 text-sm capitalize">{today}</p>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">
          Olá, {firstName} 👋
        </h1>
      </div>

      {/* Setup pendente */}
      {!hasSetup && (
        <Card className="border-emerald-200 bg-emerald-50 mb-6">
          <CardContent className="pt-5 pb-5">
            <h2 className="font-semibold text-emerald-900 mb-1">
              Começa por configurar o teu escalão
            </h2>
            <p className="text-emerald-700 text-sm mb-4">
              Cria o escalão, equipas e adiciona os atletas.
            </p>
            <Link href="/team/setup">
              <Button className="bg-emerald-600 hover:bg-emerald-700" size="sm">
                Configurar escalão
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Tarefas pendentes do dia */}
      {hasSetup && (
        <div className="mb-6 space-y-3">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
            Para fazer hoje
          </h2>

          {/* Presenças do treino */}
          {todaySession && !todayAttendanceDone && (
            <Link href="/attendance">
              <div className="flex items-center gap-3 p-4 bg-amber-50 border-2 border-amber-200 rounded-xl hover:border-amber-300 transition-colors">
                <AlertCircle
                  size={20}
                  className="text-amber-500 flex-shrink-0"
                />
                <div className="flex-1">
                  <p className="font-semibold text-amber-900 text-sm">
                    Presenças por confirmar
                  </p>
                  <p className="text-amber-700 text-xs">
                    Treino de hoje · {todaySession.start_time?.substring(0, 5)}
                  </p>
                </div>
                <span className="text-amber-600 text-xs font-medium">→</span>
              </div>
            </Link>
          )}

          {todaySession && todayAttendanceDone && (
            <div className="flex items-center gap-3 p-4 bg-emerald-50 border-2 border-emerald-200 rounded-xl">
              <ClipboardCheck
                size={20}
                className="text-emerald-500 flex-shrink-0"
              />
              <div className="flex-1">
                <p className="font-semibold text-emerald-900 text-sm">
                  Presenças confirmadas ✓
                </p>
                <p className="text-emerald-700 text-xs">
                  Treino de hoje fechado
                </p>
              </div>
            </div>
          )}

          {/* Jogo nas próximas 48h */}
          {upcomingGame && (
            <Link href="/calendar">
              <div className="flex items-center gap-3 p-4 bg-blue-50 border-2 border-blue-200 rounded-xl hover:border-blue-300 transition-colors">
                <AlertCircle
                  size={20}
                  className="text-blue-500 flex-shrink-0"
                />
                <div className="flex-1">
                  <p className="font-semibold text-blue-900 text-sm">
                    Jogo em menos de 48h
                  </p>
                  <p className="text-blue-700 text-xs">
                    {upcomingGame.opponent_name
                      ? `vs ${upcomingGame.opponent_name}`
                      : "Confirma a convocatória"}
                    {" · "}
                    {format(
                      new Date(upcomingGame.game_datetime),
                      "EEEE 'às' HH:mm",
                      { locale: pt },
                    )}
                  </p>
                </div>
                <span className="text-blue-600 text-xs font-medium">→</span>
              </div>
            </Link>
          )}

          {!todaySession && !upcomingGame && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center">
              <p className="text-slate-400 text-sm">
                Sem tarefas pendentes para hoje ✓
              </p>
            </div>
          )}
        </div>
      )}

      {/* Atalhos rápidos */}
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
        Atalhos
      </h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 items-stretch">
        {navCards.map(({ href, icon: Icon, label, color }) => (
          <Link key={href} href={href}>
            <Card className="hover:shadow-md transition-all cursor-pointer border-2 hover:border-emerald-200 h-full">
              <CardContent className="pt-5 pb-4 flex flex-col items-center justify-center text-center min-h-[90px]">
                <Icon className={`mb-2 ${color}`} size={26} />
                <p className="font-semibold text-sm text-slate-700 leading-tight">
                  {label}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
