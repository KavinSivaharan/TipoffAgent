"use client";

import { useState, useRef, useEffect } from "react";
import { ScoredCompany, InvestigationEvent, FeedMessage } from "@/lib/types";

// ── Fake "recent finds" shown on idle screen ──────────────────────────────────
const EXAMPLE_FINDS = [
  { name: "Cohere", score: 91, tag: "AI · Series C", signal: "hiring" },
  { name: "Descript", score: 84, tag: "Dev Tools · Seed", signal: "github" },
  { name: "Fermat", score: 78, tag: "B2B SaaS · Series A", signal: "funding" },
  { name: "Keeper", score: 73, tag: "Fintech · Pre-seed", signal: "launches" },
  { name: "Anysphere", score: 88, tag: "AI Infra · Seed", signal: "hiring" },
  { name: "Mintlify", score: 76, tag: "Dev Tools · YC W22", signal: "github" },
];

const TICKER_ITEMS = [
  "YC W25 · 247 companies indexed",
  "HN · 14 Show HN posts this week",
  "SEC EDGAR · 31 Form D filings (30d)",
  "GitHub · 1,204 trending repos",
  "Crunchbase · 89 seed rounds (7d)",
  "News · 412 funding announcements",
];

function Ticker() {
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS];
  return (
    <div style={{
      overflow: "hidden",
      borderTop: "1px solid #1a1a1a",
      borderBottom: "1px solid #1a1a1a",
      padding: "7px 0",
      marginBottom: 52,
      position: "relative",
    }}>
      {/* fade edges */}
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0, width: 40, zIndex: 1,
        background: "linear-gradient(to right, #0d0d0d, transparent)",
      }} />
      <div style={{
        position: "absolute", right: 0, top: 0, bottom: 0, width: 40, zIndex: 1,
        background: "linear-gradient(to left, #0d0d0d, transparent)",
      }} />
      <div style={{
        display: "flex", gap: 48,
        animation: "ticker 28s linear infinite",
        width: "max-content",
      }}>
        {items.map((item, i) => (
          <span key={i} style={{
            fontSize: 11, color: "#2e2e2e",
            fontFamily: "monospace", letterSpacing: "0.04em",
            whiteSpace: "nowrap",
          }}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function ExampleCard({ name, score, tag, signal, delay }: {
  name: string; score: number; tag: string; signal: string; delay: number;
}) {
  const scoreColor = score >= 85 ? "#e8e8e8" : score >= 75 ? "#555" : "#333";
  return (
    <div style={{
      border: "1px solid #1a1a1a",
      borderRadius: 6,
      padding: "12px 14px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      animation: `fade-up 0.4s ease-out ${delay}ms both`,
      cursor: "default",
      transition: "border-color 0.15s, background 0.15s",
    }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#2a2a2a";
        e.currentTarget.style.background = "#111";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#1a1a1a";
        e.currentTarget.style.background = "transparent";
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#c0c0c0", letterSpacing: "-0.02em", marginBottom: 3 }}>
          {name}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "#2e2e2e", fontFamily: "monospace" }}>{tag}</span>
          <span style={{
            fontSize: 9, color: "#333", fontFamily: "monospace",
            background: "#161616", border: "1px solid #1e1e1e",
            padding: "1px 5px", borderRadius: 2, letterSpacing: "0.04em",
          }}>{signal}</span>
        </div>
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: scoreColor, letterSpacing: "-0.04em", flexShrink: 0 }}>
        {score}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Home() {
  const [thesis, setThesis] = useState("");
  const [isInvestigating, setIsInvestigating] = useState(false);
  const [feedMessages, setFeedMessages] = useState<FeedMessage[]>([]);
  const [results, setResults] = useState<ScoredCompany[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const feedRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (isInvestigating) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isInvestigating]);

  function addFeedMessage(msg: FeedMessage) {
    setFeedMessages((prev) => [...prev, msg]);
    setTimeout(() => {
      feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
    }, 30);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!thesis.trim() || isInvestigating) return;
    setIsInvestigating(true);
    setFeedMessages([]);
    setResults([]);

    try {
      const res = await fetch("/api/investigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thesis }),
      });
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data: InvestigationEvent = JSON.parse(line.slice(6));
          switch (data.type) {
            case "thinking": addFeedMessage({ type: "thinking", text: data.message || "", iteration: data.iteration }); break;
            case "tool_call": addFeedMessage({ type: "tool_call", text: `${data.toolName}(${fmtArgs(data.toolArgs)})`, iteration: data.iteration }); break;
            case "tool_result": addFeedMessage({ type: "tool_result", text: data.message || "", iteration: data.iteration }); break;
            case "status": addFeedMessage({ type: "status", text: data.message || "" }); break;
            case "result": if (data.company) setResults((prev) => [...prev, data.company!].sort((a, b) => b.score - a.score)); break;
            case "done": addFeedMessage({ type: "status", text: data.message || "Done." }); setIsInvestigating(false); break;
            case "error": addFeedMessage({ type: "error", text: data.message || "Unknown error" }); setIsInvestigating(false); break;
          }
        }
      }
    } catch {
      addFeedMessage({ type: "error", text: "Connection failed" });
      setIsInvestigating(false);
    }
  }

  const demos = [
    "AI infra companies hiring senior MLEs",
    "B2B SaaS that just raised Series A",
    "Dev tools with explosive GitHub growth",
    "Stealth AI founded by ex-OpenAI researchers",
  ];

  const idle = !isInvestigating && results.length === 0 && feedMessages.length === 0;

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          background: #0d0d0d;
          color: #e8e8e8;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        ::selection { background: #e8e8e8; color: #0d0d0d; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: #222; }
        input, button { font-family: inherit; }

        @keyframes fade-up {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes ticker {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        @keyframes dot-blink {
          0%, 100% { opacity: 1; } 50% { opacity: 0; }
        }
        @keyframes number-count {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fade-up { animation: fade-up 0.2s ease-out both; }
      `}</style>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "0 20px 100px" }}>

        {/* Nav */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 0 16px",
          borderBottom: "1px solid #1a1a1a",
          marginBottom: idle ? 0 : 40,
        }}>
          <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: "-0.02em", color: "#fff" }}>
            tipoff
          </span>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <span style={{ fontSize: 10, color: "#2a2a2a", fontFamily: "monospace", letterSpacing: "0.06em" }}>
              STARTUP INTELLIGENCE
            </span>
          </div>
        </div>

        {/* ── IDLE STATE ── */}
        {idle && (
          <>
            {/* Big hero number */}
            <div style={{
              padding: "56px 0 48px",
              borderBottom: "1px solid #1a1a1a",
              marginBottom: 0,
            }}>
              <div style={{
                fontSize: 11, color: "#2e2e2e", fontFamily: "monospace",
                letterSpacing: "0.08em", marginBottom: 16, textTransform: "uppercase",
              }}>
                Live coverage
              </div>
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
                gap: 0,
                marginBottom: 40,
              }}>
                {[
                  { n: "6", label: "Data sources" },
                  { n: "2.4k", label: "Companies indexed" },
                  { n: "< 60s", label: "To results" },
                ].map(({ n, label }, i) => (
                  <div key={label} style={{
                    padding: "0 24px 0 0",
                    borderRight: i < 2 ? "1px solid #1a1a1a" : "none",
                    paddingLeft: i > 0 ? 24 : 0,
                    animation: `fade-up 0.4s ease-out ${i * 80}ms both`,
                  }}>
                    <div style={{
                      fontSize: 36, fontWeight: 700, letterSpacing: "-0.05em",
                      color: "#fff", lineHeight: 1, marginBottom: 6,
                    }}>{n}</div>
                    <div style={{ fontSize: 11, color: "#333", letterSpacing: "0.01em" }}>{label}</div>
                  </div>
                ))}
              </div>

              <h1 style={{
                fontSize: 28, fontWeight: 700, letterSpacing: "-0.035em",
                lineHeight: 1.2, color: "#888", maxWidth: 480,
              }}>
                Find the breakout{" "}
                <span style={{ color: "#fff" }}>before it's obvious.</span>
              </h1>
            </div>

            {/* Ticker */}
            <Ticker />

            {/* Input */}
            <form onSubmit={handleSubmit} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  ref={inputRef}
                  type="text"
                  value={thesis}
                  onChange={(e) => setThesis(e.target.value)}
                  placeholder="Describe what you're tracking…"
                  style={{
                    flex: 1, background: "#111", border: "1px solid #222",
                    borderRadius: 6, padding: "12px 14px", fontSize: 14,
                    color: "#e8e8e8", outline: "none", letterSpacing: "-0.01em",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#333")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "#222")}
                />
                <button
                  type="submit"
                  disabled={!thesis.trim()}
                  style={{
                    background: thesis.trim() ? "#fff" : "transparent",
                    color: thesis.trim() ? "#0d0d0d" : "#2a2a2a",
                    border: "1px solid " + (thesis.trim() ? "#fff" : "#222"),
                    borderRadius: 6, padding: "12px 20px", fontSize: 13,
                    fontWeight: 600, letterSpacing: "-0.01em",
                    transition: "all 0.12s", whiteSpace: "nowrap",
                    cursor: thesis.trim() ? "pointer" : "default",
                  }}
                >
                  Investigate
                </button>
              </div>
            </form>

            {/* Demo pills */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 52 }}>
              {demos.map((d) => (
                <button
                  key={d}
                  onClick={() => { setThesis(d); inputRef.current?.focus(); }}
                  style={{
                    background: "transparent", border: "1px solid #1e1e1e",
                    borderRadius: 20, padding: "4px 11px", fontSize: 12,
                    color: "#333", cursor: "pointer", letterSpacing: "-0.01em",
                    transition: "all 0.1s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#333"; e.currentTarget.style.color = "#888"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1e1e1e"; e.currentTarget.style.color = "#333"; }}
                >
                  {d}
                </button>
              ))}
            </div>

            {/* Example results */}
            <div>
              <div style={{
                fontSize: 10, color: "#252525", fontFamily: "monospace",
                letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12,
              }}>
                Recent finds — example
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {EXAMPLE_FINDS.map((f, i) => (
                  <ExampleCard key={f.name} {...f} delay={i * 60} />
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── ACTIVE / RESULTS STATE ── */}
        {!idle && (
          <>
            {/* Compact input */}
            <form onSubmit={handleSubmit} style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  ref={inputRef}
                  type="text"
                  value={thesis}
                  onChange={(e) => setThesis(e.target.value)}
                  placeholder="Describe what you're tracking…"
                  disabled={isInvestigating}
                  style={{
                    flex: 1, background: "#111", border: "1px solid #222",
                    borderRadius: 6, padding: "10px 14px", fontSize: 13,
                    color: "#e8e8e8", outline: "none", letterSpacing: "-0.01em",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#333")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "#222")}
                />
                <button
                  type="submit"
                  disabled={isInvestigating || !thesis.trim()}
                  style={{
                    background: !isInvestigating && thesis.trim() ? "#fff" : "transparent",
                    color: !isInvestigating && thesis.trim() ? "#0d0d0d" : "#333",
                    border: "1px solid " + (!isInvestigating && thesis.trim() ? "#fff" : "#222"),
                    borderRadius: 6, padding: "10px 18px", fontSize: 12,
                    fontWeight: 600, letterSpacing: "-0.01em",
                    transition: "all 0.12s", whiteSpace: "nowrap",
                    cursor: !isInvestigating && thesis.trim() ? "pointer" : "default",
                  }}
                >
                  {isInvestigating ? `${elapsed}s…` : "Run again"}
                </button>
              </div>
            </form>

            {/* Status bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              {isInvestigating && (
                <div style={{
                  width: 5, height: 5, borderRadius: "50%", background: "#fff",
                  animation: "dot-blink 0.8s step-end infinite", flexShrink: 0,
                }} />
              )}
              <span style={{ fontSize: 11, color: "#333", letterSpacing: "0.05em", textTransform: "uppercase", fontFamily: "monospace" }}>
                {isInvestigating
                  ? `Scanning · ${elapsed}s${results.length > 0 ? ` · ${results.length} found` : ""}`
                  : `Complete · ${results.length} results · ${elapsed}s`}
              </span>
            </div>

            {/* Feed */}
            {feedMessages.length > 0 && (
              <div ref={feedRef} style={{
                background: "#0a0a0a", border: "1px solid #1a1a1a",
                borderRadius: 6, padding: "10px 12px",
                maxHeight: 200, overflowY: "auto", marginBottom: 24,
              }}>
                {feedMessages.map((msg, i) => <FeedRow key={i} msg={msg} i={i} />)}
                {isInvestigating && (
                  <span style={{ fontSize: 12, color: "#2a2a2a", fontFamily: "monospace" }}>▌</span>
                )}
              </div>
            )}

            {/* Results */}
            {results.length > 0 && (
              <div>
                <div style={{
                  display: "grid", gridTemplateColumns: "1fr 44px",
                  padding: "0 0 8px", borderBottom: "1px solid #1c1c1c",
                }}>
                  <span style={{ fontSize: 10, color: "#2a2a2a", letterSpacing: "0.07em", textTransform: "uppercase", fontFamily: "monospace" }}>Company</span>
                  <span style={{ fontSize: 10, color: "#2a2a2a", letterSpacing: "0.07em", textTransform: "uppercase", fontFamily: "monospace", textAlign: "right" }}>Score</span>
                </div>
                {results.map((c, i) => <ResultRow key={`${c.name}-${i}`} company={c} rank={i} />)}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function FeedRow({ msg, i }: { msg: FeedMessage; i: number }) {
  const s = {
    tool_call:   { color: "#4a5aee", prefix: "→" },
    tool_result: { color: "#2a2a2a", prefix: " " },
    thinking:    { color: "#333",    prefix: "·" },
    status:      { color: "#444",    prefix: "·" },
    error:       { color: "#c0392b", prefix: "!" },
  }[msg.type] || { color: "#444", prefix: "·" };

  return (
    <div className="fade-up" style={{
      display: "flex", gap: 8, padding: "1.5px 0",
      fontSize: 11.5, fontFamily: "'SF Mono', 'Fira Code', monospace",
      color: s.color, lineHeight: 1.6,
      animationDelay: `${Math.min(i * 8, 200)}ms`,
    }}>
      <span style={{ flexShrink: 0, color: "#1e1e1e" }}>{s.prefix}</span>
      <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {msg.type === "thinking" ? <em>{trunc(msg.text, 180)}</em> : trunc(msg.text, 280)}
      </span>
    </div>
  );
}

function ResultRow({ company, rank }: { company: ScoredCompany; rank: number }) {
  const [open, setOpen] = useState(false);
  const scoreColor = company.score >= 80 ? "#e8e8e8" : company.score >= 60 ? "#555" : "#2e2e2e";

  return (
    <div className="fade-up" style={{ borderBottom: "1px solid #161616", animationDelay: `${rank * 40}ms` }}>
      <div
        onClick={() => setOpen((x) => !x)}
        style={{ display: "grid", gridTemplateColumns: "1fr 44px", padding: "13px 0", cursor: "pointer", gap: 8, alignItems: "center" }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "-0.02em", color: "#e8e8e8" }}>{company.name}</span>
            <span style={{ fontSize: 10, color: "#222", fontFamily: "monospace" }}>#{rank + 1}</span>
            <SignalPips signals={company.signals} />
          </div>
          <span style={{ fontSize: 12, color: "#333", letterSpacing: "-0.01em" }}>{company.description}</span>
        </div>
        <div style={{ textAlign: "right", fontSize: 18, fontWeight: 700, letterSpacing: "-0.03em", color: scoreColor }}>
          {company.score}
        </div>
      </div>
      {open && (
        <div className="fade-up" style={{ paddingBottom: 14 }}>
          <p style={{ fontSize: 12.5, color: "#555", lineHeight: 1.65, marginBottom: 10 }}>{company.reasoning}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {company.sources.map((s) => (
              <span key={s} style={{
                fontSize: 10, fontFamily: "monospace", color: "#2a2a2a",
                background: "#111", border: "1px solid #1e1e1e",
                padding: "2px 6px", borderRadius: 3,
              }}>{s}</span>
            ))}
            {company.url && (
              <a href={company.url} target="_blank" rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{ fontSize: 12, color: "#444", marginLeft: "auto", textDecoration: "underline", textUnderlineOffset: 3 }}>
                {company.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SignalPips({ signals }: { signals: ScoredCompany["signals"] }) {
  const active = ([
    [signals.hiring, "H"],
    [signals.github, "G"],
    [signals.funding, "F"],
    [signals.launches, "L"],
  ] as [boolean | undefined, string][]).filter(([v]) => v).map(([, l]) => l);
  if (!active.length) return null;
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {active.map((l) => (
        <span key={l} style={{
          fontSize: 9, fontFamily: "monospace", color: "#444",
          background: "#161616", border: "1px solid #222",
          padding: "1px 4px", borderRadius: 2,
        }}>{l}</span>
      ))}
    </div>
  );
}

function fmtArgs(args?: Record<string, unknown>) {
  if (!args) return "";
  return Object.entries(args).map(([k, v]) => `${k}="${v}"`).join(", ");
}

function trunc(text: string, max: number) {
  return text.length > max ? text.slice(0, max) + "…" : text;
}