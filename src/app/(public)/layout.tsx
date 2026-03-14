// Layout para a landing page (sem sidebar/navbar da app autenticada)
// Ficheiro destino: src/app/(public)/layout.tsx

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Coach11 — Gestao Desportiva para Futebol de Formacao",
  description:
    "Plataforma mobile-first para treinadores de futebol de formacao. Presencas em 20 segundos, eventos live em jogo, insights no telemovel. Gratis para comecar.",
  keywords: [
    "gestao desportiva",
    "futebol formacao",
    "treinador futebol",
    "presencas treino",
    "convocatorias futebol",
    "coach app",
    "futebol juvenil",
    "certificacao FPF",
  ],
  openGraph: {
    title: "Coach11 — O treinador regista. O sistema faz o resto.",
    description:
      "Plataforma de gestao desportiva para futebol de formacao. Mobile-first, field-first. Gratis para comecar.",
    url: "https://coach11.app",
    siteName: "Coach11",
    type: "website",
    locale: "pt_PT",
  },
  twitter: {
    card: "summary_large_image",
    title: "Coach11 — Gestao Desportiva para Futebol de Formacao",
    description:
      "Presencas em 20 segundos. Eventos live em jogo. Insights no telemovel. Gratis para comecar.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return <>{children}</>;
}