# OracleSeal

**Close-time evidence capture and public settlement transparency for Gensyn Delphi prediction markets.**

OracleSeal is one half of a two-part product. It handles the evidence layer — capturing, hashing, and freezing market data at the exact moment a market closes, before any external source can update or revise it.

The other half is [OracleREE](https://github.com/gasoline2255/oracle-ree), the settlement verification engine that uses OracleSeal's frozen snapshots to produce cryptographic settlement proofs.

> OracleSeal proves the judge had correct data. OracleREE proves the judge ran correctly. Together they make Delphi trustless.

---

## What It Does

When a Delphi market closes, OracleSeal's watcher immediately fetches evidence from the creator's approved data sources at that exact timestamp. The evidence is hashed and pinned to IPFS — immutable from that point forward. No post-close data revisions can affect it.

This solves a real problem: some external data providers silently update historical values after market close. Without a frozen snapshot, there is no way to prove what the data said at the moment trading ended.

OracleSeal creates that proof.

---

## How It Works

```
Market closes
    │
    ├── Watcher fires (every 5 min via GitHub Actions)
    │   ├── Fetches from creator-specified sources only
    │   ├── Timestamps and hashes the evidence
    │   └── Pins to IPFS (public network)
    │       → Saved to Supabase
    │       → status: captured
    │
    └── OracleREE picks up the frozen snapshot
        └── Uses it for verified settlement
            → status: ree_verified
```

---

## Dashboard

**[oracle-seal.vercel.app](https://oracle-seal.vercel.app)**

Public view of all captured markets. Every record shows:

- Capture timestamp
- Source used
- Evidence hash
- IPFS CID (immutable, publicly accessible)
- Oracle result
- REE receipt hash and combined proof (once REE verified)

| Status | Description |
|---|---|
| `OPEN` | Market active, watcher monitoring |
| `CAPTURED` | Evidence frozen at close time |
| `REE VERIFIED` | Settlement proof anchored to Gensyn REE |
| `INCONCLUSIVE` | Evidence unavailable or unresolvable |

---

## Stack

```
Watcher      Python · GitHub Actions (every 5 min) · Tavily · Pinata IPFS
Dashboard    Next.js · TypeScript · Vercel
Storage      Supabase · Pinata IPFS
```

---

## Links

- OracleSeal Dashboard: [oracle-seal.vercel.app](https://oracle-seal.vercel.app)
- OracleREE (settlement engine): [github.com/gasoline2255/oracle-ree](https://github.com/gasoline2255/oracle-ree)
- Gensyn Delphi: [app.delphi.fyi](https://app.delphi.fyi)
- Built by [gasoline](https://x.com/gasoline2255) · Gensyn community · Built on Gensyn REE
