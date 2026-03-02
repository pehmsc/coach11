"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type PublicShareSummary = {
  id: string;
  age_group_id: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_accessed_at: string | null;
  access_count: number;
  created_at: string;
};

type Props = {
  ageGroupId: string;
  canManage: boolean;
};

export function PublicSharePanel({ ageGroupId, canManage }: Props) {
  const [share, setShare] = useState<PublicShareSummary | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [requiresRegeneration, setRequiresRegeneration] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  useEffect(() => {
    if (!canManage) {
      setShare(null);
      setGeneratedUrl(null);
      setRequiresRegeneration(false);
      setError(null);
      setLoading(false);
      return;
    }

    void loadShare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ageGroupId, canManage]);

  async function loadShare() {
    setLoading(true);
    setError(null);

    console.log("[public-share.panel] load:start", { ageGroupId });

    try {
      const res = await fetch(
        `/api/public-share?ageGroupId=${encodeURIComponent(ageGroupId)}`,
        { cache: "no-store" },
      );
      console.log("[public-share.panel] load:response", {
        ageGroupId,
        status: res.status,
        ok: res.ok,
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        const nextError =
          typeof payload?.error === "string"
            ? payload.error
            : "Não foi possível carregar o link público.";
        setShare(null);
        setGeneratedUrl(null);
        setRequiresRegeneration(false);
        setError(nextError);
        return;
      }

      const nextShare = payload?.share ? (payload.share as PublicShareSummary) : null;
      setShare(nextShare);
      setGeneratedUrl(typeof payload?.url === "string" ? payload.url : null);
      setRequiresRegeneration(payload?.requiresRegeneration === true);
    } catch {
      setShare(null);
      setGeneratedUrl(null);
      setRequiresRegeneration(false);
      setError("Erro de ligação ao carregar o link público.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    setBusy(true);
    setError(null);
    setGeneratedUrl(null);

    console.log("[public-share.panel] generate:start", { ageGroupId });

    try {
      const res = await fetch("/api/public-share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ageGroupId }),
      });
      console.log("[public-share.panel] generate:response", {
        ageGroupId,
        status: res.status,
        ok: res.ok,
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok || payload?.success !== true || typeof payload?.url !== "string") {
        const nextError =
          typeof payload?.error === "string"
            ? payload.error
            : "Não foi possível gerar o link público.";
        setError(nextError);
        toast.error(nextError);
        return;
      }

      setShare(payload?.share ? (payload.share as PublicShareSummary) : null);
      setGeneratedUrl(payload.url as string);
      setRequiresRegeneration(false);
      toast.success("Link público gerado.");
    } catch {
      const nextError = "Erro de ligação ao gerar o link público.";
      setError(nextError);
      toast.error(nextError);
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke() {
    setBusy(true);
    setError(null);

    console.log("[public-share.panel] revoke:start", { ageGroupId });

    try {
      const res = await fetch("/api/public-share", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ageGroupId }),
      });
      console.log("[public-share.panel] revoke:response", {
        ageGroupId,
        status: res.status,
        ok: res.ok,
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok || payload?.success !== true) {
        const nextError =
          typeof payload?.error === "string"
            ? payload.error
            : "Não foi possível revogar o link público.";
        setError(nextError);
        toast.error(nextError);
        return;
      }

      setShare(null);
      setGeneratedUrl(null);
      setRequiresRegeneration(false);
      setCopiedUrl(false);
      toast.success("Link público revogado.");
    } catch {
      const nextError = "Erro de ligação ao revogar o link público.";
      setError(nextError);
      toast.error(nextError);
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!generatedUrl) return;

    try {
      await navigator.clipboard.writeText(generatedUrl);
      setCopiedUrl(true);
      toast.success("URL copiado.");
      window.setTimeout(() => setCopiedUrl(false), 1600);
    } catch {
      toast.error("Não foi possível copiar o URL.");
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Share2 size={16} />
              Link Público
            </CardTitle>
            <CardDescription className="mt-1">
              Calendário e jogos em modo só leitura para pais e fãs.
            </CardDescription>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void handleGenerate()}
            disabled={!canManage || busy}
          >
            {busy ? <Loader2 size={14} className="mr-2 animate-spin" /> : null}
            {share ? "Gerar novo link" : "Gerar link público"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!canManage ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Só o coordenador do escalão ou o coordenador principal podem gerir este link.
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {generatedUrl ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
            <p className="text-sm font-medium text-emerald-900">
              Este link só aparece uma vez; guarda-o.
            </p>
            <div className="flex items-center gap-2">
              <Input value={generatedUrl} readOnly className="bg-white text-xs" />
              <Button type="button" variant="outline" size="icon" onClick={() => void handleCopy()}>
                {copiedUrl ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
              </Button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-slate-400">A carregar link público...</p>
        ) : share ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                Ativo
              </span>
              <span className="text-xs text-slate-500">
                {share.access_count} acesso{share.access_count !== 1 ? "s" : ""}
              </span>
              <span className="text-xs text-slate-500">
                Criado em {new Date(share.created_at).toLocaleString("pt-PT")}
              </span>
              {share.last_accessed_at ? (
                <span className="text-xs text-slate-500">
                  Último acesso: {new Date(share.last_accessed_at).toLocaleString("pt-PT")}
                </span>
              ) : null}
            </div>
            {!generatedUrl ? (
              <p className="text-xs text-slate-500">
                {requiresRegeneration
                  ? "Este link foi criado numa versão anterior e já não pode ser revelado. Gera um novo link para o poderes copiar e gerir aqui."
                  : "Não foi possível revelar o link atual. Gera um novo link para voltares a copiá-lo aqui."}
              </p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="w-full border-red-200 text-red-600 hover:bg-red-50"
              onClick={() => void handleRevoke()}
              disabled={!canManage || busy}
            >
              {busy ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Trash2 size={14} className="mr-2" />}
              Revogar link público
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4">
            <p className="text-sm text-slate-600">
              Ainda não existe link público para este escalão.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              O link mostra apenas jogos, calendário e convocatória sanitizada, sempre em modo só leitura.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
