"use client"

import { useEffect, useState, useMemo, useRef } from "react"

type Market = {
  id: string
  status?: string
  resolvesAt?: string
  dataSources?: string[]
  metadata?: {
    question?: string
    outcomes?: string[]
  }
}

type Capture = {
  market_id: string
  question?: string
  outcomes?: string[]
  sources?: string[]
  closes_at?: string
  status?: string
  captured_at?: string
  capture_source?: string
  ipfs_cid?: string
  evidence_hash?: string
  raw_evidence?: string
  oracle_result?: string
  ree_receipt_hash?: string
  combined_hash?: string
  oracle_hash?: string
  proof_submitted_at?: string
  updated_at?: string
}

const C = {
  bg:      "#080808",
  bg1:     "#0e0e0e",
  bg2:     "#141414",
  bg3:     "#1a1a1a",
  border:  "#222222",
  text:    "#e8e4df",
  muted:   "#888480",
  dim:     "#444240",
  ghost:   "#2a2826",
  amber:   "#f0a500",
  amberBg: "#120d00",
  green:   "#16c768",
  greenBg: "#001a0a",
  red:     "#e04444",
  redBg:   "#1a0606",
  blue:    "#4a9eff",
  blueBg:  "#020d1a",
  purple:  "#9b7fff",
}

function timeUntil(v?: string) {
  if (!v) return null
  const diff = new Date(v).getTime() - Date.now()
  if (diff <= 0) return null
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  if (h > 48) return `${Math.floor(h / 24)}d`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function fmtDate(v?: string) {
  if (!v) return "—"
  return new Date(v).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  })
}

function shortHash(h?: string) {
  if (!h) return "—"
  const clean = h.replace("sha256:", "")
  return `${clean.slice(0, 8)}…${clean.slice(-6)}`
}

function statusColor(s?: string) {
  if (s === "captured")     return C.green
  if (s === "ree_verified") return C.purple
  if (s === "inconclusive") return C.red
  if (s === "open")         return C.amber
  return C.muted
}

function statusLabel(s?: string) {
  if (s === "captured")     return "CAPTURED"
  if (s === "ree_verified") return "REE VERIFIED"
  if (s === "inconclusive") return "INCONCLUSIVE"
  if (s === "open")         return "OPEN"
  if (s === "settled")      return "SETTLED"
  return (s || "UNKNOWN").toUpperCase()
}

export default function Home() {
  const [markets,  setMarkets]  = useState<Market[]>([])
  const [captures, setCaptures] = useState<Capture[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const detailRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (selected && detailRef.current) {
      detailRef.current.scrollTop = 0
    }
  }, [selected])
  const [filter,   setFilter]   = useState<string>("all")
  const [search,   setSearch]   = useState("")
  const [loading,  setLoading]  = useState(true)
  const [tick,     setTick]     = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    Promise.all([
      fetch("/api/markets").then(r => r.json()),
      fetch("/api/captures").then(r => r.json()),
    ]).then(([m, c]) => {
      setMarkets(m.markets || [])
      setCaptures(c.captures || [])
      setLoading(false)
    })
  }, [tick])

  // Merge markets with captures
  const merged = useMemo(() => {
    const captureMap = new Map(captures.map(c => [c.market_id, c]))
    const all: Capture[] = []

    // Add all markets
    for (const m of markets) {
      const cap = captureMap.get(m.id)
      all.push({
        market_id:  m.id,
        question:   m.metadata?.question || "",
        outcomes:   m.metadata?.outcomes || [],
        sources:    m.dataSources || [],
        closes_at:  m.resolvesAt,
        status:     cap?.status || (m.status === "settled" ? "settled" : "open"),
        ...cap,
      })
    }

    // Add captures not in markets
    for (const c of captures) {
      if (!markets.find(m => m.id === c.market_id)) {
        all.push(c)
      }
    }

    return all.sort((a, b) =>
      new Date(b.closes_at || b.updated_at || 0).getTime() -
      new Date(a.closes_at || a.updated_at || 0).getTime()
    )
  }, [markets, captures])

  const stats = useMemo(() => ({
    total:       merged.length,
    captured:    merged.filter(m => m.status === "captured" || m.status === "ree_verified").length,
    ree:         merged.filter(m => m.status === "ree_verified").length,
    open:        merged.filter(m => m.status === "open").length,
  }), [merged])

  const filtered = useMemo(() => {
    let list = merged
    if (filter !== "all") {
      if (filter === "captured") {
        list = list.filter(m => m.status === "captured" || m.status === "ree_verified")
      } else {
        list = list.filter(m => m.status === filter)
      }
    }
    if (search) list = list.filter(m =>
      m.question?.toLowerCase().includes(search.toLowerCase()) ||
      m.market_id?.toLowerCase().includes(search.toLowerCase())
    )
    return list
  }, [merged, filter, search])

  const sel = selected ? merged.find(m => m.market_id === selected) : null

  return (
    <div style={{
      height: "100vh", background: C.bg, color: C.text,
      fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
      display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        borderBottom: `1px solid ${C.border}`,
        padding: "16px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: C.bg1,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: `linear-gradient(135deg, ${C.amber}, ${C.purple})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 700,
          }}>⬡</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: 2 }}>ORACLESEAL</div>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1 }}>
              settlement integrity · gensyn delphi
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            background: C.green,
            boxShadow: `0 0 8px ${C.green}`,
            animation: "pulse 2s infinite",
          }}/>
          <span style={{ fontSize: 11, color: C.green, letterSpacing: 1 }}>LIVE</span>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
        borderBottom: `1px solid ${C.border}`,
        background: C.bg1,
      }}>
        {[
          { v: stats.total,    l: "Total Markets",    c: C.text },
          { v: stats.open,     l: "Open Markets",     c: C.amber },
          { v: stats.captured, l: "Captures",         c: C.green },
          { v: stats.ree,      l: "REE Verified",     c: C.purple },
        ].map((s, i) => (
          <div key={i} onClick={() => {
            if (i === 1) setFilter("open")
            else if (i === 2) setFilter("captured")
            else if (i === 3) setFilter("ree_verified")
            else setFilter("all")
          }} style={{
            padding: "16px 24px",
            borderRight: i < 3 ? `1px solid ${C.border}` : "none",
            textAlign: "center",
            cursor: "pointer",
          }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: s.c, lineHeight: 1 }}>
              {loading ? "—" : s.v}
            </div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 4, letterSpacing: 1 }}>
              {s.l.toUpperCase()}
            </div>
          </div>
        ))}
      </div>

      {/* Main content */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Left panel — market list */}
        <div style={{
          width: sel ? "42%" : "100%",
          borderRight: sel ? `1px solid ${C.border}` : "none",
          display: "flex", flexDirection: "column",
          transition: "width 0.2s",
        }}>
          {/* Search + filter */}
          <div style={{
            padding: "12px 16px",
            borderBottom: `1px solid ${C.border}`,
            display: "flex", gap: 8, flexWrap: "wrap",
          }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search markets..."
              style={{
                flex: 1, minWidth: 160,
                background: C.bg2, border: `1px solid ${C.border}`,
                color: C.text, padding: "6px 10px",
                fontSize: 12, borderRadius: 4, outline: "none",
                fontFamily: "inherit",
              }}
            />
            {["all", "open", "captured", "ree_verified", "inconclusive"].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: "6px 10px", fontSize: 10, letterSpacing: 1,
                border: `1px solid ${filter === f ? statusColor(f === "all" ? undefined : f) : C.border}`,
                background: filter === f ? C.bg3 : "transparent",
                color: filter === f ? statusColor(f === "all" ? undefined : f) : C.muted,
                cursor: "pointer", borderRadius: 4, fontFamily: "inherit",
              }}>
                {f === "all" ? "ALL" : statusLabel(f)}
              </button>
            ))}
          </div>

          {/* Market list */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading ? (
              <div style={{ padding: 32, textAlign: "center", color: C.muted, fontSize: 12 }}>
                Loading markets...
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: C.muted, fontSize: 12 }}>
                No markets found
              </div>
            ) : filtered.map(m => {
              const until = timeUntil(m.closes_at)
              const isSelected = selected === m.market_id
              return (
                <div
                  key={m.market_id}
                  onClick={() => setSelected(isSelected ? null : m.market_id)}
                  style={{
                    padding: "14px 16px",
                    borderBottom: `1px solid ${C.border}`,
                    cursor: "pointer",
                    background: isSelected ? C.bg3 : "transparent",
                    borderLeft: isSelected ? `3px solid ${C.amber}` : "3px solid transparent",
                    transition: "background 0.1s",
                  }}
                >
                  {/* Top row */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ fontSize: 12, lineHeight: 1.4, flex: 1 }}>
                      {m.question || m.market_id.slice(0, 20) + "..."}
                    </div>
                    <div style={{
                      fontSize: 9, letterSpacing: 1, padding: "2px 6px",
                      border: `1px solid ${statusColor(m.status)}`,
                      color: statusColor(m.status),
                      borderRadius: 3, whiteSpace: "nowrap", flexShrink: 0,
                    }}>
                      {statusLabel(m.status)}
                    </div>
                  </div>

                  {/* Bottom row */}
                  <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 10, color: C.muted }}>
                    {m.closes_at && (
                      <span>{until ? `closes in ${until}` : `closed ${fmtDate(m.closes_at)}`}</span>
                    )}
                    {m.sources && m.sources.length > 0 && (
                      <span style={{ color: C.dim }}>
                        {m.sources.slice(0, 2).join(" · ")}
                      </span>
                    )}
                    {m.ipfs_cid && (
                      <span style={{ color: C.green }}>✓ IPFS</span>
                    )}
                    {m.ree_receipt_hash && (
                      <span style={{ color: C.purple }}>✓ REE</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right panel — market detail */}
        {sel && (
          <div ref={detailRef} style={{
            flex: 1, overflowY: "auto", padding: 24,
            background: C.bg1,
          }}>
            {/* Close button */}
            <button onClick={() => setSelected(null)} style={{
              background: "none", border: `1px solid ${C.border}`,
              color: C.muted, cursor: "pointer", padding: "4px 10px",
              fontSize: 11, borderRadius: 4, marginBottom: 20,
              fontFamily: "inherit",
            }}>
              ✕ close
            </button>

            {/* Question */}
            <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.5, marginBottom: 4 }}>
              {sel.question}
            </div>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 20 }}>
              {sel.market_id}
            </div>

            {/* Outcomes */}
            {sel.outcomes && sel.outcomes.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1, marginBottom: 8 }}>
                  OUTCOMES
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {sel.outcomes.map((o, i) => (
                    <span key={i} style={{
                      padding: "4px 10px", fontSize: 11,
                      border: `1px solid ${sel.oracle_result === o ? C.green : C.border}`,
                      color: sel.oracle_result === o ? C.green : C.muted,
                      borderRadius: 4,
                      background: sel.oracle_result === o ? C.greenBg : "transparent",
                    }}>
                      {sel.oracle_result === o ? "✓ " : ""}{o}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Market info */}
            <Section title="MARKET INFO">
              <Row label="Status"     value={statusLabel(sel.status)} color={statusColor(sel.status)} />
              <Row label="Closes at"  value={fmtDate(sel.closes_at)} />
              <Row label="Sources"    value={(sel.sources || []).join(", ") || "—"} />
            </Section>

            {/* Watcher capture */}
            <Section title="WATCHER CAPTURE">
              {sel.captured_at ? (
                <>
                  <Row label="Captured at"    value={fmtDate(sel.captured_at)} color={C.green} />
                  <Row label="Source used"    value={sel.capture_source || "—"} />
                  <Row label="Evidence hash"  value={shortHash(sel.evidence_hash)} mono />
                <Row label="IPFS CID"       value={sel.ipfs_cid ? shortHash(sel.ipfs_cid) : "—"} mono
                    link={sel.ipfs_cid ? `https://gateway.pinata.cloud/ipfs/${sel.ipfs_cid}` : undefined}
                    color={sel.ipfs_cid ? C.green : undefined}
                  />
                  {sel.raw_evidence && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 10, color: C.dim, letterSpacing: 1, marginBottom: 6 }}>
                        CAPTURED EVIDENCE SNAPSHOT
                      </div>
                      <div style={{
                        fontSize: 10, color: C.muted, lineHeight: 1.6,
                        background: C.bg2, border: `1px solid ${C.border}`,
                        borderRadius: 4, padding: "8px 10px",
                        maxHeight: 120, overflowY: "auto",
                        whiteSpace: "pre-wrap", wordBreak: "break-word",
                        fontFamily: "'IBM Plex Mono', monospace",
                      }}>
                        {sel.raw_evidence.slice(0, 500)}
                        {sel.raw_evidence.length > 500 ? "..." : ""}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: 11, color: C.dim, padding: "8px 0" }}>
                  {sel.status === "open"
                    ? "⏳ Watcher will capture at exact close time"
                    : "No watcher capture found"}
                </div>
              )}
            </Section>

            {/* REE proof */}
            <Section title="REE PROOF">
              {sel.ree_receipt_hash ? (
                <>
                  <Row label="Oracle result"   value={sel.oracle_result || "—"} color={C.green} />
                  <Row label="Oracle hash"     value={shortHash(sel.oracle_hash)} mono />
                  <Row label="Receipt hash"    value={shortHash(sel.ree_receipt_hash)} mono />
                  <Row label="Combined hash"   value={shortHash(sel.combined_hash)} mono />
                  <Row label="Submitted at"    value={fmtDate(sel.proof_submitted_at)} />
                  <div style={{
                    marginTop: 12, padding: "8px 12px",
                    border: `1px solid ${C.purple}`,
                    borderRadius: 4, background: "#0a0614",
                    fontSize: 11, color: C.purple,
                  }}>
                    ✓ Oracle data + REE execution cryptographically linked
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 11, color: C.dim, padding: "8px 0" }}>
                  No REE proof yet · Run oracle_ree.py locally to generate
                </div>
              )}
            </Section>
          </div>
        )}
      </div>

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: ${C.bg}; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;700&display=swap');
      `}</style>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        fontSize: 10, letterSpacing: 2, color: "#444240",
        marginBottom: 10, paddingBottom: 6,
        borderBottom: `1px solid #1a1a1a`,
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function Row({ label, value, color, mono, link }: {
  label: string; value: string;
  color?: string; mono?: boolean; link?: string
}) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between",
      alignItems: "center", padding: "5px 0",
      borderBottom: "1px solid #111",
      gap: 12,
    }}>
      <span style={{ fontSize: 11, color: "#444240", flexShrink: 0 }}>{label}</span>
      {link ? (
        <a href={link} target="_blank" rel="noopener" style={{
          fontSize: 11, color: color || "#4a9eff",
          fontFamily: mono ? "'IBM Plex Mono', monospace" : "inherit",
          textDecoration: "none", textAlign: "right",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {value} ↗
        </a>
      ) : (
        <span style={{
          fontSize: 11, color: color || "#e8e4df",
          fontFamily: mono ? "'IBM Plex Mono', monospace" : "inherit",
          textAlign: "right",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {value}
        </span>
      )}
    </div>
  )
}