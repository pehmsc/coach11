"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type PublicLinkItem = {
  id: string;
  age_group_id: string;
  public_slug: string | null;
  public_access_enabled: boolean;
  url: string | null;
  ageGroup: {
    id: string;
    club_name: string;
    name: string;
  } | null;
  coordinator: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;
};

export function PublicLinksAdminPanel() {
  const [links, setLinks] = useState<PublicLinkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  useEffect(() => {
    void loadLinks();
  }, []);

  async function loadLinks() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/public-links/list", { cache: "no-store" });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(payload?.error || "Não foi possível carregar os links públicos.");
        setLinks([]);
        return;
      }

      setLinks(Array.isArray(payload?.links) ? (payload.links as PublicLinkItem[]) : []);
    } catch {
      toast.error("Erro de ligação ao carregar os links públicos.");
      setLinks([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      toast.success("URL copiado.");
      window.setTimeout(() => setCopiedUrl(null), 1600);
    } catch {
      toast.error("Não foi possível copiar o URL.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Share2 size={16} />
          Admin · Links Públicos
        </CardTitle>
        <CardDescription>
          Visão global dos slugs públicos fixos por escalão.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            A carregar links públicos...
          </div>
        ) : links.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            Ainda não existem links públicos configurados.
          </div>
        ) : (
          <div className="space-y-3">
            {links.map((link) => (
              <div key={link.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {link.ageGroup
                        ? `${link.ageGroup.club_name} · ${link.ageGroup.name}`
                        : link.age_group_id}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Coordenador: {link.coordinator?.full_name || link.coordinator?.email || "—"}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      link.public_access_enabled
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {link.public_access_enabled ? "Ativo" : "Pausado"}
                  </span>
                </div>

                <div className="grid gap-2 text-xs text-slate-500 md:grid-cols-2">
                  <p>Slug: {link.public_slug || "—"}</p>
                  <p>Age group ID: {link.age_group_id}</p>
                </div>

                {link.url ? (
                  <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <Input value={link.url} readOnly className="bg-white text-xs" />
                    <Button type="button" variant="outline" size="icon" onClick={() => void handleCopy(link.url!)}>
                      {copiedUrl === link.url ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
