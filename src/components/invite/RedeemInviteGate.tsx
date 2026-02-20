"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function RedeemInviteGate() {
  const router = useRouter();
  const sp = useSearchParams();
  const [running, setRunning] = useState(false);

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

        // remove query params do URL (fica limpinho)
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

      console.error("Redeem falhou:", res.status, err);
      setRunning(false);
    })();
  }, [running, router, sp]);

  return null;
}
