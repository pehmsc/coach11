"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, X } from "lucide-react";

export default function RedeemInviteGate() {
  const router = useRouter();
  const sp = useSearchParams();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (running) return;

    const codeFromUrl =
      sp.get("code") ?? sp.get("inviteCode") ?? sp.get("invite_code");

    const code =
      (codeFromUrl?.trim().toUpperCase() ||
        localStorage.getItem("inviteCode")?.trim().toUpperCase() ||
        "") ??
      "";

    if (!code) return;

    setRunning(true);

    (async () => {
      const res = await fetch("/api/invite/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: code }),
      });

      if (res.ok) {
        localStorage.removeItem("inviteCode");
        localStorage.removeItem("inviteEmail");
        router.replace("/dashboard");
        router.refresh();
        return;
      }

      const err = await res.json().catch(() => ({}));

      // 409 = já associado (tudo ok)
      if (res.status === 409) {
        localStorage.removeItem("inviteCode");
        localStorage.removeItem("inviteEmail");
        router.replace("/dashboard");
        router.refresh();
        return;
      }

      const msg =
        err?.error ||
        "Erro ao aceitar o convite. Tenta novamente ou contacta o coordenador.";
      console.error("Redeem falhou:", res.status, err);
      setError(msg);
      setRunning(false);
    })();
  }, [running, router, sp]);

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
