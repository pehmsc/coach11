import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { PWAClient } from "@/components/pwa/PWAClient";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = localFont({
  src: "../../public/fonts/geist-sans.woff2",
  variable: "--font-geist-sans",
  display: "swap",
  preload: true,
});

const geistMono = localFont({
  src: "../../public/fonts/geist-mono.woff2",
  variable: "--font-geist-mono",
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  metadataBase: new URL("https://coach11.app"),
  applicationName: "Coach11",
  title: {
    default: "Coach11",
    template: "%s | Coach11",
  },
  description:
    "Plataforma de gestão desportiva para treinadores, equipas técnicas e coordenação.",
  openGraph: {
    type: "website",
    locale: "pt_PT",
    url: "https://coach11.app",
    siteName: "Coach11",
    title: "Coach11 — O treinador regista. O sistema faz o resto.",
    description:
      "Plataforma de gestão desportiva para futebol de formação. Regista no campo com o telemóvel; o backoffice preenche-se sozinho.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Coach11 — O treinador regista. O sistema faz o resto.",
    description:
      "Regista no campo com o telemóvel. Consulta tudo no dashboard, sem inserir dados duas vezes.",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Coach11",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/icons/apple-touch-icon-180.png", sizes: "180x180" }],
  },
  keywords: ["coach", "football", "team management", "training", "pwa"],
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f172a",
  colorScheme: "light",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-PT">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <QueryProvider>
          <PWAClient>{children}</PWAClient>
        </QueryProvider>
        <Toaster richColors position="top-right" closeButton />
      </body>
    </html>
  );
}
