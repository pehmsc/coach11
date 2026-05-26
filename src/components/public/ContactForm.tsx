"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2 } from "lucide-react";

type Persona = "individual" | "club";

const PERSONA_LABELS: Record<Persona, string> = {
  individual: "Treinador individual",
  club: "Clube",
};

export function ContactForm() {
  const searchParams = useSearchParams();
  const initialPersona: Persona =
    searchParams.get("persona") === "club" ? "club" : "individual";

  const [persona, setPersona] = useState<Persona>(initialPersona);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [clubName, setClubName] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const qp = searchParams.get("persona");
    if (qp === "club" || qp === "individual") setPersona(qp);
  }, [searchParams]);

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!email) return;
    setSubmitting(true);
    setError(null);

    try {
      const body: Record<string, string> = {
        email,
        persona,
        source: "contacto_page",
      };
      if (fullName.trim()) body.full_name = fullName.trim();
      if (phone.trim()) body.phone = phone.trim();
      if (persona === "club" && clubName.trim()) body.club_name = clubName.trim();
      if (message.trim()) body.message = message.trim();

      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        setError("Não foi possível registar o pedido. Tenta de novo em breve.");
      } else {
        setSubmitted(true);
      }
    } catch {
      setError("Não foi possível registar o pedido. Tenta de novo em breve.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-8 text-center not-prose">
        <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-emerald-400" aria-hidden="true" />
        <h3 className="text-lg font-bold text-white">Pedido registado!</h3>
        <p className="mt-2 text-sm text-white/70">
          {persona === "individual"
            ? "Entras na lista de espera do plano Individual. Avisamos quando o auto-serviço abrir."
            : "Recebemos o teu pedido. A nossa equipa entra em contacto em breve com proposta e próximos passos."}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="not-prose space-y-5">
      <div>
        <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-white/40">
          Sou
        </span>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(PERSONA_LABELS) as Persona[]).map((key) => {
            const active = persona === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setPersona(key)}
                className={`rounded-xl border px-4 py-3 text-sm font-medium transition ${
                  active
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                    : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/20"
                }`}
              >
                {PERSONA_LABELS[key]}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label htmlFor="email" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/40">
          Email <span className="text-emerald-400">*</span>
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="o.teu@email.com"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/30 outline-none transition focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20"
        />
      </div>

      <div>
        <label htmlFor="fullName" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/40">
          Nome
        </label>
        <input
          id="fullName"
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="O teu nome"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/30 outline-none transition focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20"
        />
      </div>

      {persona === "club" ? (
        <div>
          <label htmlFor="clubName" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/40">
            Clube
          </label>
          <input
            id="clubName"
            type="text"
            value={clubName}
            onChange={(e) => setClubName(e.target.value)}
            placeholder="Nome do clube"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/30 outline-none transition focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20"
          />
        </div>
      ) : null}

      <div>
        <label htmlFor="phone" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/40">
          Telefone <span className="text-white/30">(opcional)</span>
        </label>
        <input
          id="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+351 9..."
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/30 outline-none transition focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20"
        />
      </div>

      <div>
        <label htmlFor="message" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/40">
          Mensagem <span className="text-white/30">(opcional)</span>
        </label>
        <textarea
          id="message"
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={
            persona === "club"
              ? "Conta-nos um pouco sobre o clube — escalões, nº de atletas, contexto..."
              : "Algo que queiras partilhar?"
          }
          className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/30 outline-none transition focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20"
        />
      </div>

      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-8 py-4 font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting
          ? "A enviar..."
          : persona === "individual"
            ? "Entrar na lista de espera"
            : "Pedir proposta"}
        {!submitting ? (
          <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden="true" />
        ) : null}
      </button>

      <p className="text-xs text-white/30">
        Ao submeter, aceitas o tratamento dos teus dados conforme a nossa{" "}
        <a href="/privacidade" className="text-emerald-400 underline-offset-2 hover:underline">
          política de privacidade
        </a>
        .
      </p>
    </form>
  );
}
