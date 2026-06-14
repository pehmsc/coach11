"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";

type Status = "idle" | "loading" | "success" | "error";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const loading = status === "loading";
  const success = status === "success";

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (loading || !email) return;

    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "landing_cta" }),
      });

      if (res.ok) {
        setStatus("success");
        setEmail("");
        return;
      }

      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setErrorMsg(data?.error ?? "Não foi possível registar. Tenta de novo.");
      setStatus("error");
    } catch {
      setErrorMsg("Sem ligação. Verifica a internet e tenta de novo.");
      setStatus("error");
    }
  };

  return (
    <div className="relative grid">
      {/* Camada do formulario */}
      <div
        className="col-start-1 row-start-1 transition-[opacity,filter] duration-300 ease-out"
        style={{
          opacity: success ? 0 : 1,
          filter: success ? "blur(2px)" : "blur(0px)",
          pointerEvents: success ? "none" : "auto",
        }}
        inert={success}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
          <input
            type="email"
            placeholder="O teu email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
            aria-invalid={status === "error"}
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-5 py-4 text-white placeholder-white/40 outline-none transition focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={loading}
            className="group flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-8 py-4 font-semibold text-white transition hover:bg-emerald-400 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-80"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                A enviar...
              </>
            ) : (
              <>
                Quero acesso
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </>
            )}
          </button>
        </form>

        <p
          role="alert"
          aria-live="polite"
          className="mt-3 min-h-[1.25rem] text-sm text-rose-400 transition-opacity"
          style={{ opacity: status === "error" ? 1 : 0 }}
        >
          {errorMsg}
        </p>
      </div>

      {/* Camada de sucesso (crossfade por cima) */}
      <div
        className="col-start-1 row-start-1 transition-[opacity,filter] duration-300 ease-out"
        style={{
          opacity: success ? 1 : 0,
          filter: success ? "blur(0px)" : "blur(2px)",
          pointerEvents: success ? "auto" : "none",
        }}
        inert={!success}
        aria-hidden={!success}
      >
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-6 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-400" />
          <p className="font-semibold text-emerald-400">Email registado!</p>
          <p className="mt-1 text-sm text-white/60">Entramos em contacto em breve.</p>
        </div>
      </div>
    </div>
  );
}
