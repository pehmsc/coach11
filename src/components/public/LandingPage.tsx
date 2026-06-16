"use client";

import { useEffect } from "react";
import Link from "next/link";
import { PlanCtaButton } from "@/components/public/PlanCtaButton";
import "./landing/landing-anexo.css";

/**
 * Landing do treinador — reproduz fielmente o layout canonico aprovado pelo
 * Pedro (Anexo A). O CSS vive em ./landing/landing-anexo.css com escopo `.c11lp`
 * para nao vazar. As animacoes (nav solid ao scroll, reveal on-scroll, demos dos
 * telemoveis) correm aqui no useEffect — equivalente ao <script> do mockup, mas
 * com cleanup. Os CTA primarios usam o PlanCtaButton real (-> /billing/start).
 *
 * A recolha do questionario (/api/survey, survey_responses, questionario.html)
 * e independente desta pagina e nao e tocada aqui.
 */
export default function LandingPage() {
  useEffect(() => {
    const reduce = window.matchMedia(
      "(prefers-reduced-motion:reduce)",
    ).matches;

    const observers: IntersectionObserver[] = [];
    const timeouts: number[] = [];
    const intervals: number[] = [];

    // nav solido ao fazer scroll
    const nav = document.getElementById("c11lp-nav");
    const onScroll = () => {
      if (nav) nav.classList.toggle("solid", window.scrollY > 20);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    // reveal on-scroll
    if ("IntersectionObserver" in window && !reduce) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add("in");
              io.unobserve(e.target);
            }
          });
        },
        { threshold: 0.18 },
      );
      document.querySelectorAll(".c11lp .rev").forEach((el) => io.observe(el));
      observers.push(io);
    } else {
      document
        .querySelectorAll(".c11lp .rev")
        .forEach((el) => el.classList.add("in"));
    }

    const once = (el: Element | null, cb: () => void) => {
      if (!el) return;
      const o = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              cb();
              o.disconnect();
            }
          });
        },
        { threshold: 0.4 },
      );
      o.observe(el);
      observers.push(o);
    };

    // hero — ultima presenca marcada
    (() => {
      const p = document.getElementById("ph-hero");
      if (!p) return;
      const apply = () => {
        const last = document.getElementById("h-last");
        if (last) {
          last.textContent = "Presente";
          last.style.color = "#059669";
          last.style.background = "#DCFCE7";
        }
        const count = document.getElementById("h-count");
        if (count) count.textContent = "18";
      };
      if (reduce) {
        apply();
        return;
      }
      once(p, () => {
        timeouts.push(window.setTimeout(apply, 1100));
      });
    })();

    // demo — criar jogo
    (() => {
      const p = document.getElementById("ph-jogo");
      if (!p) return;
      const seq: [string, string][] = [
        ["j-adv", "🔍 Casa Pia AC (CPAC)"],
        ["j-data", "15/06/2026"],
        ["j-ini", "18:15"],
        ["j-comp", "Campeonato Nacional"],
      ];
      seq.forEach(([id]) => {
        const el = document.getElementById(id);
        if (el) el.style.opacity = "0";
      });
      const fill = () => {
        seq.forEach(([id, text], i) => {
          timeouts.push(
            window.setTimeout(
              () => {
                const el = document.getElementById(id);
                if (el) {
                  el.style.opacity = "1";
                  el.textContent = text;
                }
              },
              reduce ? 0 : 250 + i * 240,
            ),
          );
        });
        const map = document.getElementById("j-map");
        const pin = document.getElementById("j-pin");
        timeouts.push(
          window.setTimeout(
            () => {
              if (map) {
                map.style.transition = "opacity .4s";
                map.style.opacity = "1";
              }
              if (pin) {
                pin.style.transition =
                  "transform .5s cubic-bezier(.34,1.56,.64,1),opacity .3s";
                pin.style.opacity = "1";
                pin.style.transform = "translateY(0)";
              }
            },
            reduce ? 0 : 250 + seq.length * 240 + 150,
          ),
        );
      };
      once(p, fill);
    })();

    // demo — convocatoria
    (() => {
      const p = document.getElementById("ph-conv");
      const list = document.getElementById("cv-list");
      const count = document.getElementById("cv-count");
      if (!p || !list || !count) return;
      const T: string[][] = [
        ["49", "António Sá", "GR"],
        ["5", "Mamade Mendes", "MO"],
        ["24", "Santiago Dias", "MC"],
        ["46", "João Moreira", "DE"],
        ["50", "Vasco São Vicente", "DD"],
        ["55", "Lourenço Baião", "DC"],
        ["74", "Lucas Shaw", "DC"],
        ["84", "Manuel Prates", "MC"],
        ["85", "Daniel Martins", "MC"],
        ["91", "Ricardo Machado", "AV"],
        ["97", "Adulai Embaló", "ED"],
      ];
      const row = (t: string[]) => {
        const gk = t[2] === "GR";
        return (
          '<div class="row" style="opacity:0;transform:translateX(-8px);background:' +
          (gk ? "#FFFBEB" : "#F0F7FF") +
          ";border:1px solid " +
          (gk ? "#FDE68A" : "#DBEAFE") +
          '"><div class="bdg" style="background:' +
          (gk ? "#F59E0B" : "#3B82F6") +
          '">' +
          t[0] +
          '</div><div><div class="nm">' +
          t[1] +
          '</div><div class="sub">#' +
          t[0] +
          " · " +
          t[2] +
          '</div></div><div class="pill" style="color:' +
          (gk ? "#B45309" : "#1D4ED8") +
          ";background:" +
          (gk ? "#FEF3C7" : "#DBEAFE") +
          '">' +
          (gk ? "GR" : "Titular") +
          "</div></div>"
        );
      };
      list.innerHTML = T.map(row).join("");
      const rows = list.querySelectorAll<HTMLElement>(".row");
      const play = () => {
        for (let i = 0; i < rows.length; i++) {
          const idx = i;
          timeouts.push(
            window.setTimeout(
              () => {
                rows[idx].style.transition = "opacity .3s,transform .3s";
                rows[idx].style.opacity = "1";
                rows[idx].style.transform = "none";
                count.textContent = String(idx + 1);
              },
              reduce ? 0 : 120 + idx * 120,
            ),
          );
        }
      };
      once(p, play);
    })();

    // demo — jogo ao vivo
    (() => {
      const p = document.getElementById("ph-live");
      const clock = document.getElementById("lv-clock");
      const score = document.getElementById("lv-score");
      const events = document.getElementById("lv-events");
      const golo = document.getElementById("lv-golo");
      if (!p || !clock || !score || !events || !golo) return;
      const fmt = (s: number) => {
        const m = Math.floor(s / 60);
        const r = s % 60;
        return (
          (m < 10 ? "0" : "") +
          m +
          ":" +
          (r < 10 ? "0" : "") +
          r +
          " · " +
          (m + 1) +
          "'"
        );
      };
      const play = () => {
        let sec = 230;
        clock.textContent = fmt(sec);
        if (reduce) {
          score.innerHTML =
            'CFB <span style="color:#059669">1</span> <span style="color:#94A3B8">—</span> 0 CPAC';
          return;
        }
        intervals.push(
          window.setInterval(() => {
            sec++;
            clock.textContent = fmt(sec);
          }, 1000),
        );
        timeouts.push(
          window.setTimeout(() => {
            golo.style.transition = "box-shadow .3s";
            golo.style.boxShadow = "0 0 0 5px rgba(16,185,129,.3)";
            timeouts.push(
              window.setTimeout(() => {
                golo.style.boxShadow = "";
              }, 420),
            );
            const d = document.createElement("div");
            d.style.cssText =
              "display:flex;gap:6px;font-size:10px;color:#0F172A;padding:5px 0;border-top:1px solid #E2E8F0;opacity:0;transform:translateX(-8px);transition:opacity .35s,transform .35s";
            d.innerHTML =
              `<span style="color:#94A3B8">5'</span>⚽ Golo — Ricardo Machado`;
            events.insertBefore(d, events.firstChild);
            requestAnimationFrame(() => {
              d.style.opacity = "1";
              d.style.transform = "none";
            });
            score.innerHTML =
              'CFB <span style="color:#059669">1</span> <span style="color:#94A3B8">—</span> 0 CPAC';
          }, 1800),
        );
      };
      once(p, play);
    })();

    return () => {
      window.removeEventListener("scroll", onScroll);
      observers.forEach((o) => o.disconnect());
      timeouts.forEach((t) => window.clearTimeout(t));
      intervals.forEach((t) => window.clearInterval(t));
    };
  }, []);

  return (
    <div className="c11lp">
      <div className="bgfx">
        <div className="orb a" />
        <div className="orb b" />
        <div className="vig" />
      </div>

      <nav id="c11lp-nav">
        <div className="nav-in">
          <div className="logo">
            Coach<span className="e">11</span>
          </div>
          <div className="nav-r">
            <a className="lnk" href="#como">
              Como funciona
            </a>
            <a className="lnk" href="#funcionalidades">
              Funcionalidades
            </a>
            <a className="lnk" href="#preco">
              Preço
            </a>
            <PlanCtaButton
              href="/billing/start"
              label="Começar grátis"
              planIntent="individual"
              className="btn btn-em btn-sm"
            />
          </div>
        </div>
      </nav>

      <main>
        {/* HERO */}
        <header className="wrap hero">
          <div>
            <span className="badge">⚽ Para treinadores de formação</span>
            <h1>
              Do treino ao
              <br />
              <span className="g">apito final.</span>
            </h1>
            <p className="lead">
              Marca presenças, convoca o onze e regista o jogo ao vivo — tudo no
              telemóvel, em segundos, no relvado. As estatísticas e os relatórios
              preenchem-se sozinhos. Sem papel, sem voltar a lançar tudo no
              computador.
            </p>
            <div className="cta">
              <PlanCtaButton
                href="/billing/start"
                label="Começar grátis — 7 dias"
                planIntent="individual"
                className="btn btn-em"
              />
              <a href="#demo" className="btn btn-gh">
                Ver a app a funcionar
              </a>
            </div>
            <div className="micro">
              Sem cartão para experimentar · cancela quando quiseres
            </div>
            <div className="stats">
              <div>
                <div className="v em">&lt;20s</div>
                <div className="l">para marcar presenças</div>
              </div>
              <div>
                <div className="v">2 toques</div>
                <div className="l">por evento de jogo</div>
              </div>
              <div>
                <div className="v">€7,99</div>
                <div className="l">/mês · tudo incluído</div>
              </div>
            </div>
            <div className="founder-strip">
              <div className="av">PC</div>
              <div className="t">
                Feito por um treinador de formação no{" "}
                <b>CF Os Belenenses</b> — para resolver a própria dor.
              </div>
            </div>
          </div>
          <div className="phone-host rev">
            <div className="phone" id="ph-hero">
              <div className="speaker" />
              <div className="screen">
                <div className="scrin">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div className="hd">Presenças</div>
                    <div style={{ fontSize: "9px", color: "#94A3B8" }}>
                      Treino ·{" "}
                      <b id="h-count" style={{ color: "#059669" }}>
                        17
                      </b>
                      /22
                    </div>
                  </div>
                  <div
                    className="row"
                    style={{ background: "#fff", border: "1px solid #E2E8F0" }}
                  >
                    <div className="bdg" style={{ background: "#3B82F6" }}>
                      5
                    </div>
                    <div>
                      <div className="nm">Mamade Mendes</div>
                      <div className="sub">#5 · Médio ofensivo</div>
                    </div>
                    <div
                      className="pill"
                      style={{ color: "#059669", background: "#DCFCE7" }}
                    >
                      Presente
                    </div>
                  </div>
                  <div
                    className="row"
                    style={{ background: "#fff", border: "1px solid #E2E8F0" }}
                  >
                    <div className="bdg" style={{ background: "#3B82F6" }}>
                      24
                    </div>
                    <div>
                      <div className="nm">Santiago Dias</div>
                      <div className="sub">#24 · Médio centro</div>
                    </div>
                    <div
                      className="pill"
                      style={{ color: "#B45309", background: "#FEF3C7" }}
                    >
                      Atrasado
                    </div>
                  </div>
                  <div
                    className="row"
                    style={{ background: "#fff", border: "1px solid #E2E8F0" }}
                  >
                    <div className="bdg" style={{ background: "#3B82F6" }}>
                      74
                    </div>
                    <div>
                      <div className="nm">Lucas Shaw</div>
                      <div className="sub">#74 · Defesa central</div>
                    </div>
                    <div
                      className="pill"
                      style={{ color: "#B91C1C", background: "#FEE2E2" }}
                    >
                      Ausente
                    </div>
                  </div>
                  <div
                    className="row"
                    style={{ background: "#fff", border: "1px solid #E2E8F0" }}
                  >
                    <div className="bdg" style={{ background: "#3B82F6" }}>
                      91
                    </div>
                    <div>
                      <div className="nm">Ricardo Machado</div>
                      <div className="sub">#91 · Avançado</div>
                    </div>
                    <div
                      className="pill"
                      style={{ color: "#6D28D9", background: "#EDE9FE" }}
                    >
                      Lesionado
                    </div>
                  </div>
                  <div
                    className="row"
                    style={{ background: "#fff", border: "1px solid #E2E8F0" }}
                  >
                    <div className="bdg" style={{ background: "#3B82F6" }}>
                      97
                    </div>
                    <div>
                      <div className="nm">Adulai Embaló</div>
                      <div className="sub">#97 · Extremo</div>
                    </div>
                    <div
                      className="pill"
                      style={{ color: "#059669", background: "#DCFCE7" }}
                    >
                      Presente
                    </div>
                  </div>
                  <div
                    className="row"
                    style={{ background: "#fff", border: "1px solid #E2E8F0" }}
                  >
                    <div className="bdg" style={{ background: "#3B82F6" }}>
                      85
                    </div>
                    <div>
                      <div className="nm">Daniel Martins</div>
                      <div className="sub">#85 · Médio centro</div>
                    </div>
                    <div
                      className="pill"
                      id="h-last"
                      style={{ color: "#94A3B8", background: "#F1F5F9" }}
                    >
                      Por marcar
                    </div>
                  </div>
                  <div
                    style={{
                      marginTop: "auto",
                      background: "#10B981",
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: "11px",
                      textAlign: "center",
                      padding: "10px",
                      borderRadius: "10px",
                    }}
                  >
                    Guardar presenças
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* PAIN */}
        <section id="pain">
          <div className="wrap">
            <div className="rev">
              <span className="eyebrow">Conheces este filme?</span>
              <h2 className="sec">
                O jogo acaba. O trabalho de secretária começa.
              </h2>
              <p className="sec-sub">
                Treinas porque gostas de futebol — não para passares as noites a
                copiar dados para o computador do clube.
              </p>
            </div>
            <div className="grid3">
              <div className="pcard rev">
                <div className="ic">📋</div>
                <h3>Papel no banco</h3>
                <p>
                  Fichas e cadernos que se perdem, molham e nunca chegam ao sítio
                  certo. No fim do jogo, metade da informação evapora-se.
                </p>
              </div>
              <div className="pcard rev">
                <div className="ic">⌨️</div>
                <h3>Tudo duas vezes</h3>
                <p>
                  Registas no campo e depois voltas a lançar tudo num backoffice
                  pesado, à secretária. O mesmo trabalho, feito a dobrar.
                </p>
              </div>
              <div className="pcard rev">
                <div className="ic">🤷</div>
                <h3>Sem histórico</h3>
                <p>
                  Quem faltou? Quantos minutos jogou? Como evoluiu? Sem registo
                  consistente, não há respostas — nem para ti, nem para os pais.
                </p>
              </div>
            </div>
            <div className="quote-big rev">
              <span className="em">131</span> treinos agendados. Apenas{" "}
              <span className="em">1</span> com presenças registadas.
              <br />
              <span
                style={{
                  fontSize: ".6em",
                  color: "var(--mut)",
                  fontWeight: 500,
                }}
              >
                É isto que acontece quando a ferramenta não está onde estás tu —
                no relvado.
              </span>
            </div>
          </div>
        </section>

        {/* HOW */}
        <section id="como">
          <div className="wrap">
            <div className="rev center">
              <span className="eyebrow">A diferença</span>
              <h2 className="sec">Regista uma vez. No campo.</h2>
              <p className="sec-sub">
                O Coach11 inverte a lógica: registas no telemóvel enquanto está a
                acontecer, e o backoffice preenche-se sozinho. Zero dupla
                introdução de dados.
              </p>
            </div>
            <div className="steps">
              <div className="step rev">
                <div className="n">01 · NO RELVADO</div>
                <h3>Regista no telemóvel</h3>
                <p>
                  Presenças, convocatórias e eventos do jogo — em toques, sem
                  tirar os olhos do treino ou da partida.
                </p>
                <div className="arr">→</div>
              </div>
              <div className="step rev">
                <div className="n">02 · AUTOMÁTICO</div>
                <h3>O sistema organiza</h3>
                <p>
                  Cada toque alimenta a ficha, o calendário, as estatísticas e o
                  relatório. Não voltas a lançar nada.
                </p>
                <div className="arr">→</div>
              </div>
              <div className="step rev">
                <div className="n">03 · EM CASA</div>
                <h3>Vês tudo pronto</h3>
                <p>
                  Dashboard, evolução dos atletas e relatórios prontos a
                  partilhar com o clube e com os pais.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* DEMO */}
        <section id="demo">
          <div className="wrap">
            <div className="rev center">
              <span className="eyebrow">Vê com os teus olhos</span>
              <h2 className="sec">A app a trabalhar, a sério.</h2>
              <p className="sec-sub">
                Não é uma promessa bonita. É o que vais fazer todas as semanas,
                do telemóvel.
              </p>
            </div>
            <div className="demo-row">
              <div className="demo-col rev">
                <div className="phone-host">
                  <div className="phone flat" id="ph-jogo">
                    <div className="speaker" />
                    <div className="screen">
                      <div className="scrin" style={{ gap: "8px" }}>
                        <div className="hd">Novo jogo</div>
                        <div>
                          <div className="fl">Adversário</div>
                          <div
                            className="fld f2"
                            id="j-adv"
                            style={{
                              display: "flex",
                              gap: "5px",
                              alignItems: "center",
                            }}
                          />
                        </div>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <div style={{ flex: 1 }}>
                            <div className="fl">Data</div>
                            <div className="fld f2" id="j-data" />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div className="fl">Início</div>
                            <div className="fld f2" id="j-ini" />
                          </div>
                        </div>
                        <div>
                          <div className="fl">Competição</div>
                          <div className="fld f2" id="j-comp" />
                        </div>
                        <div
                          className="f2"
                          id="j-map"
                          style={{
                            border: "1px solid #E2E8F0",
                            borderRadius: "9px",
                            overflow: "hidden",
                            background: "#fff",
                            opacity: 0,
                          }}
                        >
                          <svg
                            viewBox="0 0 220 70"
                            style={{
                              width: "100%",
                              height: "54px",
                              display: "block",
                            }}
                          >
                            <rect width="220" height="70" fill="#E2E8F0" />
                            <path
                              d="M0 24H220M0 50H220M52 0V70M150 0V70"
                              stroke="#CBD5E1"
                              strokeWidth={3}
                            />
                            <path
                              d="M0 37H220"
                              stroke="#C0CBD8"
                              strokeWidth={6}
                            />
                            <rect
                              x="84"
                              y="27"
                              width="52"
                              height="20"
                              rx="3"
                              fill="#BBF7D0"
                            />
                            <g
                              id="j-pin"
                              style={{
                                transform: "translateY(-16px)",
                                opacity: 0,
                              }}
                            >
                              <circle cx="110" cy="37" r="9" fill="#059669" />
                              <circle cx="110" cy="37" r="3.5" fill="#fff" />
                            </g>
                          </svg>
                          <div style={{ padding: "6px 8px" }}>
                            <div
                              style={{
                                fontSize: "10px",
                                fontWeight: 600,
                                color: "#0F172A",
                              }}
                            >
                              Campo Major Baptista da Silva
                            </div>
                          </div>
                        </div>
                        <div
                          id="j-add"
                          style={{
                            marginTop: "auto",
                            background: "#10B981",
                            color: "#fff",
                            fontWeight: 700,
                            fontSize: "11px",
                            textAlign: "center",
                            padding: "10px",
                            borderRadius: "10px",
                          }}
                        >
                          Criar jogo
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="cap">
                  <h3>Cria o jogo em segundos</h3>
                  <p>
                    Adversário, data e campo — com a morada por pesquisa no mapa.
                  </p>
                </div>
              </div>

              <div className="demo-col rev">
                <div className="phone-host">
                  <div className="phone flat" id="ph-conv">
                    <div className="speaker" />
                    <div className="screen">
                      <div className="scrin" style={{ gap: "4px" }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                          }}
                        >
                          <div className="hd">Convocatória</div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: "9px", color: "#94A3B8" }}>
                              <b id="cv-count">0</b>/11 titulares
                            </div>
                            <div
                              style={{
                                fontSize: "9px",
                                color: "#059669",
                                fontWeight: 600,
                              }}
                            >
                              A guardar…
                            </div>
                          </div>
                        </div>
                        <div
                          style={{
                            fontSize: "9px",
                            fontWeight: 700,
                            letterSpacing: ".08em",
                            color: "#2563EB",
                          }}
                        >
                          TITULARES
                        </div>
                        <div
                          id="cv-list"
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "4px",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="cap">
                  <h3>Convoca o teu onze</h3>
                  <p>
                    Titulares e suplentes definidos e guardados — partilháveis num
                    link.
                  </p>
                </div>
              </div>

              <div className="demo-col rev">
                <div className="phone-host">
                  <div className="phone flat" id="ph-live">
                    <div className="speaker" />
                    <div className="screen">
                      <div className="scrin" style={{ gap: "9px" }}>
                        <div
                          style={{
                            background: "#0F172A",
                            borderRadius: "13px",
                            padding: "11px 8px",
                            textAlign: "center",
                            color: "#fff",
                          }}
                        >
                          <div style={{ fontSize: "8.5px", color: "#94A3B8" }}>
                            15/06 · Campo Major Baptista da Silva
                          </div>
                          <div
                            style={{
                              fontWeight: 800,
                              fontSize: "23px",
                              marginTop: "4px",
                            }}
                            id="lv-score"
                          >
                            CFB 0 <span style={{ color: "#94A3B8" }}>—</span> 0
                            CPAC
                          </div>
                          <div
                            style={{
                              fontSize: "10px",
                              color: "#34D399",
                              marginTop: "3px",
                            }}
                            id="lv-clock"
                          >
                            03:50 · 4&apos;
                          </div>
                        </div>
                        <div
                          id="lv-golo"
                          style={{
                            background: "#DCFCE7",
                            color: "#059669",
                            border: "1px solid #A7F3D0",
                            fontWeight: 700,
                            fontSize: "11px",
                            textAlign: "center",
                            padding: "10px",
                            borderRadius: "10px",
                          }}
                        >
                          ⚽ Golo
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "6px",
                          }}
                        >
                          <div
                            style={{
                              background: "#FEF3C7",
                              color: "#B45309",
                              border: "1px solid #FDE68A",
                              fontWeight: 600,
                              fontSize: "11px",
                              textAlign: "center",
                              padding: "9px",
                              borderRadius: "9px",
                            }}
                          >
                            🟨 Amarelo
                          </div>
                          <div
                            style={{
                              background: "#EFF6FF",
                              color: "#1D4ED8",
                              border: "1px solid #DBEAFE",
                              fontWeight: 600,
                              fontSize: "11px",
                              textAlign: "center",
                              padding: "9px",
                              borderRadius: "9px",
                            }}
                          >
                            🔄 Subst.
                          </div>
                        </div>
                        <div>
                          <div
                            style={{
                              fontSize: "8.5px",
                              letterSpacing: ".1em",
                              textTransform: "uppercase",
                              color: "#94A3B8",
                              marginBottom: "3px",
                            }}
                          >
                            Eventos
                          </div>
                          <div id="lv-events">
                            <div
                              style={{
                                display: "flex",
                                gap: "6px",
                                fontSize: "10px",
                                color: "#0F172A",
                                padding: "5px 0",
                                borderTop: "1px solid #E2E8F0",
                              }}
                            >
                              <span style={{ color: "#94A3B8" }}>1&apos;</span>🟨
                              Amarelo — Lucas Shaw
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="cap">
                  <h3>Regista o jogo ao vivo</h3>
                  <p>
                    Golos, cartões e substituições. A ficha e o resultado
                    atualizam-se sozinhos — e os adeptos acompanham.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section id="funcionalidades">
          <div className="wrap">
            <div className="rev center">
              <span className="eyebrow">Tudo num só sítio</span>
              <h2 className="sec">O teu escalão, organizado.</h2>
              <p className="sec-sub">
                As ferramentas que usas todas as semanas — pensadas para o
                telemóvel, prontas para o relvado.
              </p>
            </div>
            <div className="fgrid">
              <div className="fcard hot rev">
                <div className="ic">✅</div>
                <h3>Presenças em 20s</h3>
                <p>Presente, atrasado, ausente ou lesionado num toque.</p>
              </div>
              <div className="fcard hot rev">
                <div className="ic">🔴</div>
                <h3>Jogos ao vivo</h3>
                <p>Eventos em 2 toques, minuto preenchido automaticamente.</p>
              </div>
              <div className="fcard hot rev">
                <div className="ic">🔁</div>
                <h3>Duplica a semana</h3>
                <p>Repete o microciclo de treinos sem montar tudo de novo.</p>
              </div>
              <div className="fcard rev">
                <div className="ic">📋</div>
                <h3>Convocatórias</h3>
                <p>Define o onze e partilha por link com atletas e famílias.</p>
              </div>
              <div className="fcard rev">
                <div className="ic">📅</div>
                <h3>Calendário público</h3>
                <p>Os pais sabem onde e quando, sem te andarem a perguntar.</p>
              </div>
              <div className="fcard rev">
                <div className="ic">📈</div>
                <h3>Estatísticas &amp; insights</h3>
                <p>Minutos, golos e evolução de cada atleta, sem esforço.</p>
              </div>
              <div className="fcard rev">
                <div className="ic">📄</div>
                <h3>Relatórios automáticos</h3>
                <p>
                  Documentos prontos a partilhar com o clube — sem trabalho
                  extra.
                </p>
              </div>
              <div className="fcard rev">
                <div className="ic">📲</div>
                <h3>Instala como app</h3>
                <p>
                  Funciona como aplicação no telemóvel, sem passar pela App Store.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* FOUNDER */}
        <section>
          <div className="wrap">
            <div className="founder rev">
              <div className="big-av">PC</div>
              <div>
                <blockquote>
                  &ldquo;Construí o Coach11 porque vivo o problema. Sou treinador
                  de formação e estava farto de registar tudo em papel e voltar a
                  escrever no computador. Quis uma ferramenta que estivesse onde
                  eu estou — no campo, no telemóvel. Uso-a todas as semanas com o
                  meu escalão.&rdquo;
                </blockquote>
                <div className="by">
                  — <b>Pedro Campos</b>, treinador de formação · CF Os Belenenses
                  · fundador do Coach11
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* RISK */}
        <section>
          <div className="wrap">
            <div className="rev center">
              <span className="eyebrow">Sem letras pequenas</span>
              <h2 className="sec">Experimentar não tem risco.</h2>
            </div>
            <div className="risk">
              <div className="ritem rev">
                <div className="ic">🎁</div>
                <h3>7 dias grátis</h3>
                <p>Testa tudo sem dar o cartão.</p>
              </div>
              <div className="ritem rev">
                <div className="ic">🚪</div>
                <h3>Cancela num clique</h3>
                <p>Sem chamadas, sem fidelização.</p>
              </div>
              <div className="ritem rev">
                <div className="ic">📤</div>
                <h3>Os dados são teus</h3>
                <p>Exporta o que é teu quando quiseres.</p>
              </div>
              <div className="ritem rev">
                <div className="ic">⚡</div>
                <h3>Pronto em minutos</h3>
                <p>Cria conta e começa no mesmo dia.</p>
              </div>
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section id="preco">
          <div className="wrap">
            <div className="rev center">
              <span className="eyebrow">Preço simples</span>
              <h2 className="sec">Um plano. Tudo incluído.</h2>
              <p className="sec-sub">
                Menos do que um café por semana para deixares o papel no banco de
                vez.
              </p>
            </div>
            <div className="price-card rev">
              <div className="tier">Treinador</div>
              <div className="amt">
                €7,99<span> /mês</span>
              </div>
              <div className="trial">7 dias grátis · sem cartão</div>
              <div className="plist">
                <div className="li">
                  <span className="c">✓</span> Presenças, treinos e microciclo
                </div>
                <div className="li">
                  <span className="c">✓</span> Jogos ao vivo e ficha automática
                </div>
                <div className="li">
                  <span className="c">✓</span> Convocatórias e calendário públicos
                </div>
                <div className="li">
                  <span className="c">✓</span> Estatísticas, insights e relatórios
                </div>
                <div className="li">
                  <span className="c">✓</span> App instalável no telemóvel
                </div>
              </div>
              <PlanCtaButton
                href="/billing/start"
                label="Começar grátis"
                planIntent="individual"
                className="btn btn-em"
              />
              <div className="price-foot">
                Cancela quando quiseres · IVA incluído
              </div>
            </div>
            <div className="club-line rev">
              Tens um clube com vários escalões?{" "}
              <Link href="/contacto?persona=club">Fala connosco →</Link>
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="final">
          <div className="wrap rev">
            <h2>
              Pronto para deixar
              <br />o papel no banco?
            </h2>
            <p className="lead">
              Começa hoje. Em segundos estás a registar o primeiro treino do
              telemóvel.
            </p>
            <div className="cta">
              <PlanCtaButton
                href="/billing/start"
                label="Começar grátis — 7 dias"
                planIntent="individual"
                className="btn btn-em"
              />
              <a href="#demo" className="btn btn-gh">
                Ver a app a funcionar
              </a>
            </div>
            <div className="micro">Sem cartão · cancela quando quiseres</div>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap foot-in">
          <div className="logo" style={{ fontSize: "18px" }}>
            Coach<span className="e">11</span> ·{" "}
            <span style={{ color: "var(--mut2)", fontWeight: 500 }}>
              feito em Lisboa para treinadores de formação
            </span>
          </div>
          <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
            <a href="#funcionalidades">Funcionalidades</a>
            <Link href="/precos">Preço</Link>
            <Link href="/contacto">Contacto</Link>
            <Link href="/faqs">FAQs</Link>
            <Link href="/termos">Termos</Link>
            <Link href="/privacidade">Privacidade</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
