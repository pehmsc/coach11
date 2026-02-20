"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, X } from "lucide-react";

export default function RedeemInviteGate() {
  const router = useRouter();
  const sp = useSearchParams();
  const [, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastProcessedCodeRef = useRef<string | null>(null);
  const syncAttemptedRef = useRef(false);

  const redeemInvite = useCallback(
    async (code: string) => {
      setRunning(true);
      setError(null);

      try {
        for (let attempt = 0; attempt < 3; attempt++) {
          const res = await fetch("/api/invite/redeem", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ inviteCode: code }),
          });

          let payload: { error?: string } | null = null;
          try {
            payload = await res.json();
          } catch {
            payload = null;
          }

          const errorText =
            typeof payload?.error === "string" ? payload.error.toLowerCase() : "";

          if (res.ok) {
            localStorage.removeItem("inviteCode");
            localStorage.removeItem("inviteEmail");
            router.replace("/dashboard");
            router.refresh();
            return;
          }

          // Compatibilidade com deploy anterior: 409 "já associado".
          if (
            res.status === 409 &&
            errorText.includes("já estás associado")
          ) {
            localStorage.removeItem("inviteCode");
            localStorage.removeItem("inviteEmail");
            router.replace("/dashboard");
            router.refresh();
            return;
          }

          if (res.status === 401 && attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            continue;
          }

          if (res.status === 401) {
            localStorage.setItem("inviteCode", code);
            router.replace(`/login?code=${encodeURIComponent(code)}`);
            return;
          }

          const msg =
            payload?.error ||
            "Erro ao aceitar o convite. Tenta novamente ou contacta o coordenador.";

          console.error("Redeem falhou:", res.status, payload);
          setError(msg);
          return;
        }
      } catch (err) {
        console.error("Erro de rede no redeem:", err);
        setError("Falha de ligação. Verifica a internet e tenta novamente.");
      } finally {
        setRunning(false);
      }
    },
    [router],
  );

  useEffect(() => {
    const codeFromUrl =
      sp.get("code") ?? sp.get("inviteCode") ?? sp.get("invite_code");

    const code =
      (codeFromUrl?.trim().toUpperCase() ||
        localStorage.getItem("inviteCode")?.trim().toUpperCase() ||
        "") ??
      "";

    if (!code) return;
    if (lastProcessedCodeRef.current === code) return;

    lastProcessedCodeRef.current = code;
    void redeemInvite(code);
  }, [redeemInvite, sp]);

  useEffect(() => {
    const codeFromUrl =
      sp.get("code") ?? sp.get("inviteCode") ?? sp.get("invite_code");
    const localCode = localStorage.getItem("inviteCode");

    if (codeFromUrl || localCode || syncAttemptedRef.current) return;

    syncAttemptedRef.current = true;

    (async () => {
      try {
        const res = await fetch("/api/invite/sync", { method: "POST" });
        const payload = await res.json().catch(() => ({}));

        if (res.ok && payload?.linked) {
          router.refresh();
          return;
        }

        if (!res.ok && typeof payload?.error === "string") {
          setError(payload.error);
        }
      } catch {
        setError("Falha ao sincronizar convite. Tenta novamente.");
      }
    })();
  }, [router, sp]);

  if (!error) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 max-w-md mx-auto bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 flex items-start gap-3 shadow-lg">
      <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="font-semibold text-sm">Erro ao aceitar convite</p>
        <p className="text-xs mt-0.5">{error}</p>
      </div>
      <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
        <X size={16} />
      </button>
    </div>
  );
}
