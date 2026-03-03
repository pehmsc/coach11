"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2, PauseCircle, PlayCircle, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type PublicShareSummary = {
  age_group_id: string;
  public_slug: string;
  public_access_enabled: boolean;
  url: string;
  access_count: number;
  last_accessed_at: string | null;
};

type Props = {
  ageGroupId: string;
  canManage: boolean;
};

export function PublicSharePanel({ ageGroupId, canManage }: Props) {
  const [share, setShare] = useState<PublicShareSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  useEffect(() => {
    void loadShare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ageGroupId]);

  async function loadShare() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/public-share?ageGroupId=${encodeURIComponent(ageGroupId)}`,
        { cache: "no-store" },
      );
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        setShare(null);
        setError(
          typeof payload?.error === "string"
            ? payload.error
            : "Não foi possível carregar o link público.",
        );
        return;
      }

      setShare(payload?.share ? (payload.share as PublicShareSummary) : null);
    } catch {
      setShare(null);
      setError("Erro de ligação ao carregar o link público.");
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(nextEnabled: boolean) {
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/public-share", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ageGroupId,
          publicAccessEnabled: nextEnabled,
        }),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok || payload?.success !== true || !payload?.share) {
        const nextError =
          typeof payload?.error === "string"
            ? payload.error
            : "Não foi possível atualizar o acesso público.";
        setError(nextError);
        toast.error(nextError);
        return;
      }

      setShare(payload.share as PublicShareSummary);
      toast.success(nextEnabled ? "Link público retomado." : "Link público pausado.");
    } catch {
      const nextError = "Erro de ligação ao atualizar o link público.";
      setError(nextError);
      toast.error(nextError);
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!share?.url) return;

    try {
      await navigator.clipboard.writeText(share.url);
      setCopiedUrl(true);
      toast.success("URL copiado.");
      window.setTimeout(() => setCopiedUrl(false), 1600);
    } catch {
      toast.error("Não foi possível copiar o URL.");
    }
  }

  function formatLastAccess(value: string | null) {
    if (!value) return "Sem acessos registados";

    try {
      return new Date(value).toLocaleString("pt-PT");
    } catch {
      return value;
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Share2 size={16} />
              Link Público
            </CardTitle>
            <CardDescription className="mt-1">
              Link fixo do escalão para pais e fãs, com pausa e retoma sem mudar o URL.
            </CardDescription>
          </div>
          {share && canManage ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void handleToggle(!share.public_access_enabled)}
              disabled={!canManage || busy}
            >
              {busy ? (
                <Loader2 size={14} className="mr-2 animate-spin" />
              ) : share.public_access_enabled ? (
                <PauseCircle size={14} className="mr-2" />
              ) : (
                <PlayCircle size={14} className="mr-2" />
              )}
              {share.public_access_enabled ? "Pausar acesso" : "Retomar acesso"}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!canManage ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            O link pode ser copiado e partilhado, mas só o coordenador do escalão ou o coordenador principal o podem pausar ou retomar.
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-slate-400">A carregar link público...</p>
        ) : share ? (
          <>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    share.public_access_enabled
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {share.public_access_enabled ? "Ativo" : "Pausado"}
                </span>
                <span className="text-xs text-slate-500">
                  `/public/{share.public_slug}`
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Input value={share.url} readOnly className="bg-white text-xs" />
                <Button type="button" variant="outline" size="icon" onClick={() => void handleCopy()}>
                  {copiedUrl ? (
                    <Check size={16} className="text-emerald-600" />
                  ) : (
                    <Copy size={16} />
                  )}
                </Button>
              </div>
              <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600 md:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Acessos
                  </p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {share.access_count}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Último acesso
                  </p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {formatLastAccess(share.last_accessed_at)}
                  </p>
                </div>
              </div>
            </div>

            <p className="text-xs leading-5 text-slate-500">
              O link é estável e não muda com o tempo. Quando pausado, o mesmo URL continua a existir
              mas mostra uma mensagem de acesso temporariamente pausado.
            </p>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            Não foi possível preparar o link público deste escalão.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
