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

  const redeemInvite = useCallback(
    async (code: string) => {
      setRunning(true);
      setError(null);

      try {
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

        if (res.ok || res.status === 409) {
          localStorage.removeItem("inviteCode");
          localStorage.removeItem("inviteEmail");
          router.replace("/dashboard");
          router.refresh();
          return;
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
