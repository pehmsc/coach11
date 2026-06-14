import { ImageResponse } from "next/og";

// Cartao Open Graph (1200x630) gerado em build/runtime.
// Tipografia pura, sem fontes nem imagens externas — robusto e sem rede.
export const alt =
  "Coach11 — O treinador regista. O sistema faz o resto.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background:
            "radial-gradient(1100px 520px at 78% -8%, rgba(16,185,129,0.20), rgba(16,185,129,0) 60%), linear-gradient(160deg, #020617 0%, #0b1220 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        {/* Topo: wordmark + tag de publico */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 56,
                height: 56,
                borderRadius: 16,
                background: "#10b981",
                color: "#03130d",
                fontSize: 30,
                fontWeight: 800,
              }}
            >
              11
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 34,
                fontWeight: 800,
                letterSpacing: -0.5,
              }}
            >
              Coach<span style={{ color: "#34d399" }}>11</span>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              padding: "10px 20px",
              borderRadius: 999,
              border: "1px solid rgba(16,185,129,0.35)",
              background: "rgba(16,185,129,0.10)",
              color: "#6ee7b7",
              fontSize: 22,
              fontWeight: 600,
            }}
          >
            Futebol de formacao
          </div>
        </div>

        {/* Centro: headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 78,
              fontWeight: 800,
              lineHeight: 1.04,
              letterSpacing: -1.5,
            }}
          >
            <span>O treinador regista.</span>
            <span style={{ color: "#34d399" }}>O sistema faz o resto.</span>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 30,
              color: "rgba(255,255,255,0.62)",
              maxWidth: 880,
              lineHeight: 1.35,
            }}
          >
            Regista no campo com o telemovel. Consulta tudo no dashboard, sem
            inserir dados duas vezes.
          </div>
        </div>

        {/* Base: claims + dominio */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", gap: 14 }}>
            {["< 20s presencas", "2 toques por evento", "7 dias gratis"].map(
              (chip) => (
                <div
                  key={chip}
                  style={{
                    display: "flex",
                    padding: "12px 22px",
                    borderRadius: 14,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    color: "rgba(255,255,255,0.82)",
                    fontSize: 24,
                    fontWeight: 600,
                  }}
                >
                  {chip}
                </div>
              ),
            )}
          </div>
          <div style={{ display: "flex", color: "#34d399", fontSize: 26, fontWeight: 700 }}>
            coach11.app
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
