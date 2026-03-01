import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSuperUserAccess } from "@/lib/auth/super-user.server";

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

export default async function AdminPage() {
  const access = await getSuperUserAccess();
  if (!access.ok) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <div className="space-y-3">
        <Link
          href="/settings"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
        >
          <ArrowLeft size={16} />
          Voltar às Configurações
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">Admin Beta</h1>
        <p className="mt-1 text-sm text-slate-500">
          Ferramentas internas para convite beta, links públicos e auditoria.
        </p>
      </div>

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
    </div>
  );
}
