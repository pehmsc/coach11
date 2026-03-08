import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StickyBackLink } from "@/components/navigation/StickyBackLink";
import { getSuperUserAccess } from "@/lib/auth/super-user.server";
import {
  getAdminObservabilityMetrics,
  POSTHOG_ADMIN_METRICS_PERIOD_DAYS,
  type AdminMetricCardData,
} from "@/lib/observability/posthog-admin-metrics.server";

const ADMIN_LINKS = [
  {
    href: "/admin/beta-invites",
    title: "Beta Invites",
    description: "Criar, listar, copiar e revogar convites beta de coordenadores.",
  },
  {
    href: "/admin/public-links",
    title: "Public Links",
    description: "Ver links públicos gerados, estatísticas de acesso e revogar links.",
  },
  {
    href: "/admin/audit-logs",
    title: "Audit Logs",
    description: "Consultar os últimos eventos auditáveis da aplicação.",
  },
];

function formatDelta(delta: number | null) {
  if (delta === null) return "Sem base comparável";
  if (delta === 0) return "Sem variação";

  const prefix = delta > 0 ? "+" : "";
  return `${prefix}${delta.toFixed(1)}%`;
}

function formatComparisonLabel(delta: number | null, positiveLabel: string, negativeLabel: string) {
  if (delta === null || delta === 0) return "vs período anterior";
  return delta > 0 ? positiveLabel : negativeLabel;
}

function SparklineBars({ series }: { series: AdminMetricCardData["series"] }) {
  const maxValue = Math.max(...series.map((point) => point.value), 1);

  return (
    <div className="mt-4 flex h-16 items-end gap-1">
      {series.map((point) => (
        <div
          key={point.date}
          className="flex-1 rounded-sm bg-emerald-200/80"
          style={{
            height: `${Math.max(10, (point.value / maxValue) * 100)}%`,
          }}
          title={`${point.date}: ${point.value}`}
        />
      ))}
    </div>
  );
}

function MetricsCard({
  title,
  description,
  value,
  delta,
  deltaLabel,
  series,
}: {
  title: string;
  description: string;
  value: number;
  delta: number | null;
  deltaLabel: string;
  series: AdminMetricCardData["series"];
}) {
  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-3xl font-semibold text-slate-900">{value}</p>
            <p className="mt-1 text-sm text-slate-500">{deltaLabel}</p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              delta === null
                ? "bg-slate-100 text-slate-600"
                : delta >= 0
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-rose-100 text-rose-700"
            }`}
          >
            {formatDelta(delta)}
          </span>
        </div>
        <SparklineBars series={series} />
        <p className="mt-2 text-xs text-slate-500">Últimos 14 dias</p>
      </CardContent>
    </Card>
  );
}

export default async function AdminPage() {
  const access = await getSuperUserAccess();
  if (!access.ok) {
    notFound();
  }

  const metrics = await getAdminObservabilityMetrics();

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <StickyBackLink href="/settings" label="Voltar às Configurações">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Admin Beta</h1>
          <p className="mt-1 text-sm text-slate-500">
            Ferramentas internas para convite beta, links públicos e auditoria.
          </p>
        </div>
      </StickyBackLink>

      <div className="grid gap-4 md:grid-cols-3">
        {ADMIN_LINKS.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="h-full transition-colors hover:border-emerald-300">
              <CardHeader>
                <CardTitle className="text-base">{item.title}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <span className="text-sm font-medium text-emerald-700">
                  Abrir
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Observabilidade</CardTitle>
          <CardDescription>
            Métricas agregadas do PostHog para os últimos{" "}
            {POSTHOG_ADMIN_METRICS_PERIOD_DAYS} dias.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {metrics.configured ? (
            <div className="grid gap-4 md:grid-cols-3">
              <MetricsCard
                title="Daily Active Users"
                description="Utilizadores autenticados ativos hoje."
                value={metrics.dau.headlineValue}
                delta={metrics.dau.delta}
                deltaLabel={formatComparisonLabel(
                  metrics.dau.delta,
                  "vs ontem",
                  "vs ontem",
                )}
                series={metrics.dau.series}
              />
              <MetricsCard
                title="Convocações criadas"
                description={`Total do evento convocation_created nos últimos ${metrics.periodDays} dias.`}
                value={metrics.convocationCreated.headlineValue}
                delta={metrics.convocationCreated.delta}
                deltaLabel={formatComparisonLabel(
                  metrics.convocationCreated.delta,
                  `acima dos ${metrics.periodDays} dias anteriores`,
                  `abaixo dos ${metrics.periodDays} dias anteriores`,
                )}
                series={metrics.convocationCreated.series}
              />
              <MetricsCard
                title="Presenças marcadas"
                description={`Total do evento attendance_marked nos últimos ${metrics.periodDays} dias.`}
                value={metrics.attendanceMarked.headlineValue}
                delta={metrics.attendanceMarked.delta}
                deltaLabel={formatComparisonLabel(
                  metrics.attendanceMarked.delta,
                  `acima dos ${metrics.periodDays} dias anteriores`,
                  `abaixo dos ${metrics.periodDays} dias anteriores`,
                )}
                series={metrics.attendanceMarked.series}
              />
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
              {metrics.message}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
