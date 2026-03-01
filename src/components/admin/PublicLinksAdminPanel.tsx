"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  getStoredPublicShareUrl,
} from "@/lib/public-share-client";

type PublicLinkItem = {
  id: string;
  age_group_id: string;
  created_by: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_accessed_at: string | null;
  access_count: number;
  created_at: string;
  ageGroup: {
    id: string;
    club_name: string;
    name: string;
  } | null;
  createdBy: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;
};

export function PublicLinksAdminPanel() {
  const [links, setLinks] = useState<PublicLinkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingAgeGroupId, setRevokingAgeGroupId] = useState<string | null>(null);
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

  async function handleRevoke(ageGroupId: string) {
    setRevokingAgeGroupId(ageGroupId);
    try {
      const res = await fetch("/api/public-share", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ageGroupId }),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok || payload?.success !== true) {
        toast.error(payload?.error || "Não foi possível revogar o link público.");
        return;
      }

      toast.success("Link público revogado.");
      await loadLinks();
    } catch {
      toast.error("Erro de ligação ao revogar o link público.");
    } finally {
      setRevokingAgeGroupId(null);
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
        <CardTitle className="text-base flex items-center gap-2">
          <Share2 size={16} />
          Admin · Links Públicos
        </CardTitle>
        <CardDescription>
          Links ativos e revogados com estatísticas de acesso.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            A carregar links públicos...
          </div>
        ) : links.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            Ainda não existem links públicos.
          </div>
        ) : (
          <div className="space-y-3">
            {links.map((link) => (
              <div key={link.id} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {link.ageGroup
                        ? `${link.ageGroup.club_name} · ${link.ageGroup.name}`
                        : link.age_group_id}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Criado por {link.createdBy?.full_name || link.createdBy?.email || "—"}
                    </p>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <p>{link.access_count} acesso{link.access_count !== 1 ? "s" : ""}</p>
                    {link.last_accessed_at ? (
                      <p>Último acesso: {new Date(link.last_accessed_at).toLocaleString("pt-PT")}</p>
                    ) : (
                      <p>Sem acessos ainda</p>
                    )}
                  </div>
                </div>

                <div className="grid gap-2 text-xs text-slate-500 md:grid-cols-2">
                  <p>Criado em {new Date(link.created_at).toLocaleString("pt-PT")}</p>
                  <p>Expira em {link.expires_at ? new Date(link.expires_at).toLocaleString("pt-PT") : "Sem expiração"}</p>
                  <p>Revogado em {link.revoked_at ? new Date(link.revoked_at).toLocaleString("pt-PT") : "Ativo"}</p>
                  <p>Age group ID: {link.age_group_id}</p>
                </div>

                {(() => {
                  const storedUrl = getStoredPublicShareUrl(link.age_group_id);
                  if (!storedUrl) {
                    return (
                      <p className="text-xs text-slate-500">
                        O URL não está disponível neste navegador. Se precisares de o voltar a ver aqui, gera um novo link a partir do escalão.
                      </p>
                    );
                  }

                  return (
                    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                      <Input value={storedUrl} readOnly className="bg-white text-xs" />
                      <Button type="button" variant="outline" size="icon" onClick={() => void handleCopy(storedUrl)}>
                        {copiedUrl === storedUrl ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                      </Button>
                    </div>
                  );
                })()}

                {!link.revoked_at ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="border-red-200 text-red-600 hover:bg-red-50"
                    onClick={() => void handleRevoke(link.age_group_id)}
                    disabled={revokingAgeGroupId === link.age_group_id}
                  >
                    {revokingAgeGroupId === link.age_group_id ? (
                      <Loader2 size={14} className="mr-2 animate-spin" />
                    ) : (
                      <Trash2 size={14} className="mr-2" />
                    )}
                    Revogar link
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
