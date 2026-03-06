"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Check, Ticket, ArrowRight, Loader2 } from "lucide-react";
import { ApiFetchError, apiFetch } from "@/lib/http/apiFetch";
import { invalidateContextSensitiveQueries } from "@/lib/query/invalidation";

type RedeemInviteResponse = {
  success?: boolean;
  error?: string;
  role?: string;
  ageGroup?: {
    clubName?: string;
    name?: string;
  };
};

export default function JoinPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const [code, setCode] = useState(searchParams.get("code") || "");
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    clubName: string;
    ageGroupName: string;
    role: string;
  } | null>(null);

  const roleLabels: Record<string, string> = {
    coach: "Treinador Principal",
    assistant_coach: "Treinador Adjunto",
    coordinator: "Coordenador",
  };

  const redeemInviteMutation = useMutation({
    mutationFn: (inviteCode: string) =>
      apiFetch<RedeemInviteResponse>("/api/invite/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode }),
      }),
  });
  const redeemInvite = redeemInviteMutation.mutateAsync;

  const handleRedeemWithCode = useCallback(async (inviteCode: string) => {
    setError(null);

    try {
      const data = await redeemInvite(inviteCode);
      if (!data.success) {
        setError(data.error || "Código inválido ou já utilizado.");
        return;
      }

      setSuccess({
        clubName: data.ageGroup?.clubName || "",
        ageGroupName: data.ageGroup?.name || "",
        role: data.role || "",
      });
      await invalidateContextSensitiveQueries(queryClient);
    } catch (redeemError) {
      if (redeemError instanceof ApiFetchError && redeemError.status === 409) {
        const data =
          redeemError.data && typeof redeemError.data === "object"
            ? (redeemError.data as { error?: string })
            : null;
        const message = String(data?.error || "");
        if (message.toLowerCase().includes("já estás associado")) {
          router.push("/dashboard");
          return;
        }

        setError(message || "Este convite já foi utilizado.");
        return;
      }

      setError("Erro de ligação. Tenta novamente.");
    }
  }, [queryClient, redeemInvite, router]);

  const checkUserStatus = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const urlCode = searchParams.get("code");
    if (urlCode) {
      setChecking(false);
      setCode(urlCode);
      void handleRedeemWithCode(urlCode);
      return;
    }

    // É coordinator?
    const { data: ageGroup } = await supabase
      .from("age_groups")
      .select("id")
      .eq("coordinator_id", user.id)
      .limit(1)
      .maybeSingle();

    if (ageGroup) {
      router.push("/dashboard");
      return;
    }

    // Já é staff? (profile_id = auth.uid)
    const { data: staff } = await supabase
      .from("team_staff")
      .select("id")
      .eq("profile_id", user.id)
      .limit(1)
      .maybeSingle();

    if (staff) {
      router.push("/dashboard");
      return;
    }

    setChecking(false);
  }, [handleRedeemWithCode, router, searchParams, supabase]);

  // Bootstrap da página de convite após montar.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void checkUserStatus();
  }, [checkUserStatus]);

  async function handleRedeem(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    void handleRedeemWithCode(code.trim());
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mb-3">
            {success ? (
              <Check className="w-7 h-7 text-emerald-600" />
            ) : (
              <Ticket className="w-7 h-7 text-emerald-600" />
            )}
          </div>

          {success ? (
            <>
              <CardTitle className="text-xl">Convite aceite!</CardTitle>
              <CardDescription className="mt-1">
                Agora fazes parte da equipa técnica.
              </CardDescription>
            </>
          ) : (
            <>
              <CardTitle className="text-xl">Juntar a um escalão</CardTitle>
              <CardDescription className="mt-1">
                Insere o código de convite que recebeste do teu coordenador.
              </CardDescription>
            </>
          )}
        </CardHeader>

        <CardContent>
          {success ? (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                <p className="text-emerald-800 font-semibold text-lg">
                  {success.clubName}
                </p>
                <p className="text-emerald-700 text-sm">
                  {success.ageGroupName} ·{" "}
                  {roleLabels[success.role] || success.role}
                </p>
              </div>
              <Button
                onClick={() => router.push("/dashboard")}
                className="w-full bg-emerald-600 hover:bg-emerald-700"
              >
                Ir para o dashboard
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          ) : (
            <form onSubmit={handleRedeem} className="space-y-4">
              {error && (
                <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg border border-red-200">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Input
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.toUpperCase().replace(/\s/g, ""))
                  }
                  placeholder="EX: AB3K7NPQ"
                  className="text-center font-mono text-xl tracking-[0.3em] h-14 uppercase"
                  maxLength={8}
                  autoFocus
                />
                <p className="text-xs text-slate-400 text-center">
                  8 caracteres — letras e números
                </p>
              </div>

              <Button
                type="submit"
                disabled={redeemInviteMutation.isPending || code.trim().length < 8}
                className="w-full bg-emerald-600 hover:bg-emerald-700 h-12"
              >
                {redeemInviteMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />A
                    verificar...
                  </>
                ) : (
                  "Aceitar convite"
                )}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => router.push("/settings")}
                  className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
                >
                  Não tenho código — criar o meu escalão
                </button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
