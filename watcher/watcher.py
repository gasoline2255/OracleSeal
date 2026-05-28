#!/usr/bin/env python3
"""
OracleSeal Watcher — Captures market data at exact close time.
Rules:
  1. Only fetch from creator's listed data sources
  2. Tavily restricted to same domain if direct fetch fails
  3. General Tavily only as last resort (flagged)
  4. Understand WHEN to capture (event time vs close time)
  5. Lock evidence to IPFS + save to oracle_markets table
"""
import hashlib, json, os, time, re, requests
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

DELPHI_API_KEY = os.environ.get("DELPHI_API_ACCESS_KEY", "")
PINATA_JWT     = os.environ.get("PINATA_JWT", "")
TAVILY_API_KEY = os.environ.get("TAVILY_API_KEY", "")
GROQ_API_KEY   = os.environ.get("GROQ_API_KEY", "")
SUPABASE_URL   = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY   = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

def now_utc(): return datetime.now(timezone.utc)
def now_iso(): return now_utc().isoformat()
def sha256(t): return "sha256:" + hashlib.sha256(t.encode()).hexdigest()

# ─── Source domain mapping ────────────────────────────────────────────────────

SOURCE_DOMAINS = {
    "espn": "espn.com", "espncricinfo": "espncricinfo.com",
    "cricinfo": "espncricinfo.com", "x": "x.com", "twitter": "x.com",
    "coinmarketcap": "coinmarketcap.com", "cmc": "coinmarketcap.com",
    "coingecko": "coingecko.com", "uefa": "uefa.com", "nba": "nba.com",
    "nfl": "nfl.com", "ipl": "iplt20.com", "bbc": "bbc.com",
    "sky sports": "skysports.com", "skysports": "skysports.com",
    "bloomberg": "bloomberg.com", "reuters": "reuters.com",
    "cnn": "cnn.com", "yahoo finance": "finance.yahoo.com",
    "yahoo": "finance.yahoo.com", "binance": "binance.com",
    "wikipedia": "wikipedia.org", "psa": "psacard.com",
}

SOURCE_BASE_URLS = {
    "espn": "https://www.espn.com",
    "espncricinfo": "https://www.espncricinfo.com",
    "cricinfo": "https://www.espncricinfo.com",
    "coinmarketcap": "https://coinmarketcap.com",
    "cmc": "https://coinmarketcap.com",
    "coingecko": "https://www.coingecko.com",
    "uefa": "https://www.uefa.com",
    "nba": "https://www.nba.com",
    "nfl": "https://www.nfl.com",
    "ipl": "https://www.iplt20.com",
    "bbc": "https://www.bbc.com/sport",
    "skysports": "https://www.skysports.com",
    "sky sports": "https://www.skysports.com",
    "bloomberg": "https://www.bloomberg.com",
    "reuters": "https://www.reuters.com",
    "cnn": "https://www.cnn.com",
    "yahoo finance": "https://finance.yahoo.com",
    "yahoo": "https://finance.yahoo.com",
    "wikipedia": "https://www.wikipedia.org",
}


SKIP_GROQ_SOURCES = {"twitter", "x (", "x.com", "reddit", "instagram", "tiktok"}

# ─── Helpers ──────────────────────────────────────────────────────────────────

def extract_domain(source: str) -> str:
    source = source.lower().strip()
    if source.startswith("http"):
        m = re.search(r"https?://(?:www\.)?([^/]+)", source)
        return m.group(1) if m else source
    for key, domain in SOURCE_DOMAINS.items():
        if key in source:
            return domain
    return source.replace(" ", "") + ".com"

def resolve_base_url(source: str) -> str:
    src_lower = source.lower().strip()
    if src_lower.startswith("http"):
        return source
    for key, url in SOURCE_BASE_URLS.items():
        if key in src_lower:
            return url
    return f"https://{source.strip()}"

# ─── Groq ─────────────────────────────────────────────────────────────────────

def call_groq(system_prompt: str, user_prompt: str) -> Optional[str]:
    if not GROQ_API_KEY:
        return None
    try:
        r = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}",
                     "Content-Type": "application/json"},
            json={"model": "llama-3.3-70b-versatile", "temperature": 0.1,
                  "max_tokens": 1000,
                  "messages": [{"role": "system", "content": system_prompt},
                                {"role": "user", "content": user_prompt}]},
            timeout=20,
        )
        return r.json()["choices"][0]["message"]["content"]
    except Exception as e:
        print(f"[watcher] Groq failed: {e}")
        return None

# ─── Data fetchers ────────────────────────────────────────────────────────────

def fetch_from_source(source: str, question: str, close_time: str) -> dict:
    src_lower = source.lower().strip()
    skip_direct = any(x in src_lower for x in ["twitter", "x (", "x.com", "reddit", "instagram"])
    base_url = resolve_base_url(source)
    domain = extract_domain(source)

    result = {
        "source_name": source, "domain": domain, "base_url": base_url,
        "fetch_method": None, "text_snippet": None, "sha256": None,
        "status_code": None, "error": None, "fetched_at": now_iso(),
    }

    if not skip_direct:
        user_agents = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
            "Googlebot/2.1 (+http://www.google.com/bot.html)",
        ]
        fetch_url = base_url
        if GROQ_API_KEY and not any(x in src_lower for x in SKIP_GROQ_SOURCES):
            raw = call_groq(
                "You are a URL resolver. Return ONLY a single full URL, nothing else.",
                f"Source: {source}\nBase: {base_url}\nQuestion: {question}\n"
                f"Event date: {close_time[:10]}\nFind the exact URL for this result."
            )
            if raw:
                candidate = raw.strip().strip('"\'').split()[0]
                if candidate.startswith("http") and len(candidate) > 20:
                    fetch_url = candidate
                    print(f"[watcher] Resolved {source} → {fetch_url}")

        for ua in user_agents:
            try:
                r = requests.get(fetch_url, headers={
                    "User-Agent": ua,
                    "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
                }, timeout=15)
                if r.status_code == 200 and len(r.text) > 500:
                    text = re.sub(r"<script[^>]*>.*?</script>", " ", r.text, flags=re.S)
                    text = re.sub(r"<style[^>]*>.*?</style>", " ", text, flags=re.S)
                    text = re.sub(r"<[^>]+>", " ", text)
                    text = re.sub(r"\s+", " ", text).strip()
                    result.update({
                        "fetch_method": "direct", "text_snippet": text[:6000],
                        "sha256": sha256(r.text), "status_code": r.status_code,
                        "fetched_url": fetch_url,
                    })
                    print(f"[watcher] ✓ Direct fetch from {source} ({len(text)} chars)")
                    return result
            except Exception:
                continue

    if TAVILY_API_KEY:
        print(f"[watcher] Tavily within {domain}")
        try:
            query = f"site:{domain} {question} {close_time[:10]}"
            r = requests.post("https://api.tavily.com/search", json={
                "api_key": TAVILY_API_KEY, "query": query,
                "search_depth": "basic", "max_results": 5, "include_answer": True,
            }, timeout=15)
            data = r.json()
            answer = data.get("answer", "")
            parts = [f"SUMMARY: {answer}"] if answer else []
            for res in data.get("results", [])[:3]:
                url = res.get("url", "")
                if domain in url:
                    parts.append(f"[{url}]\n{res.get('content','')[:800]}")
            combined = "\n\n".join(parts)
            if combined.strip():
                result.update({
                    "fetch_method": "tavily_site_restricted",
                    "text_snippet": combined, "sha256": sha256(combined),
                })
                print(f"[watcher] ✓ Tavily site:{domain} found content")
                return result
        except Exception as e:
            print(f"[watcher] Tavily site-restricted failed: {e}")

    result["error"] = f"Could not fetch from {source}"
    print(f"[watcher] ✗ All fetch attempts failed for {source}")
    return result

def search_tavily_general(question: str, close_time: str) -> str:
    if not TAVILY_API_KEY:
        return ""
    try:
        r = requests.post("https://api.tavily.com/search", json={
            "api_key": TAVILY_API_KEY,
            "query": f"{question} result {close_time[:10]}",
            "search_depth": "basic", "max_results": 5, "include_answer": True,
        }, timeout=15)
        data = r.json()
        answer = data.get("answer", "")
        parts = [f"SUMMARY: {answer}"] if answer else []
        for res in data.get("results", [])[:3]:
            parts.append(f"[{res.get('url','')}]\n{res.get('content','')[:800]}")
        return "\n\n".join(parts)
    except Exception as e:
        print(f"[watcher] General Tavily failed: {e}")
        return ""

def extract_verdict(question: str, outcomes: list, evidence_text: str,
                    data_sources: list, source_method: str) -> dict:
    if not GROQ_API_KEY or not evidence_text.strip():
        return {"matchedOutcome": None, "confidence": 0,
                "explanation": "No evidence available."}
    confidence_note = ""
    if source_method == "general_tavily":
        confidence_note = "\nWARNING: Evidence from general web search. Cap confidence at 0.5."
    raw = call_groq(
        "You are OracleSeal's settlement judge. Use ONLY the provided evidence. "
        "Return ONLY valid JSON: matchedOutcome, confidence (0-1), explanation." + confidence_note,
        f'Question: "{question}"\nValid outcomes: {", ".join(outcomes)}\n'
        f'Evidence source: {source_method}\n\nEVIDENCE:\n{evidence_text[:4000]}'
    )
    if not raw:
        return {"matchedOutcome": None, "confidence": 0, "explanation": "Groq failed."}
    try:
        clean = raw.replace("```json", "").replace("```", "").strip()
        result = json.loads(re.search(r"\{[\s\S]*\}", clean).group(0))
        if source_method == "general_tavily":
            result["confidence"] = min(float(result.get("confidence", 0)), 0.5)
        return result
    except Exception:
        return {"matchedOutcome": None, "confidence": 0, "explanation": "Parse failed."}

# ─── Supabase ─────────────────────────────────────────────────────────────────

def fetch_open_markets():
    """Fetch open + recently settled markets from Delphi."""
    if not DELPHI_API_KEY:
        print("[watcher] No DELPHI_API_ACCESS_KEY")
        return []
    markets = []
    try:
        # Open markets
        r = requests.get("https://api.delphi.fyi/markets",
            headers={"x-api-key": DELPHI_API_KEY},
            params={"limit": 100, "status": "open"}, timeout=15)
        if r.ok:
            markets += r.json().get("markets", [])
        # Recently settled markets (catch missed closes)
        r2 = requests.get("https://api.delphi.fyi/markets",
            headers={"x-api-key": DELPHI_API_KEY},
            params={"limit": 50, "status": "settled"}, timeout=15)
        if r2.ok:
            markets += r2.json().get("markets", [])
        print(f"[watcher] {len(markets)} markets fetched (open + recently settled)")
        return markets
    except Exception as e:
        print(f"[watcher] fetch failed: {e}")
        return []

def already_captured(market_id: str) -> bool:
    """Check oracle_markets table — not the old oracle_snapshots."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return False
    try:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/oracle_markets",
            headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
            params={"market_id": f"eq.{market_id}", "select": "market_id"},
            timeout=10,
        )
        return r.ok and len(r.json()) > 0
    except Exception:
        return False

def save_to_supabase(market: dict, capture: dict) -> bool:
    """Save capture to oracle_markets table."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("[watcher] No Supabase config — skipping")
        return False

    meta        = market.get("metadata") or {}
    market_id   = market.get("id", "")
    question    = meta.get("question", "")
    outcomes    = meta.get("outcomes") or []
    sources     = market.get("dataSources") or []
    closes_at   = market.get("resolvesAt") or ""

capture_source = capture.get("best_source") or (
        (capture.get("data_sources_fetched") or [{}])[0].get("domain")
    )
    capture_method = capture.get("capture_strategy") or "at_close"

    row = {
        "market_id":      market_id,
        "question":       question,
        "outcomes":       outcomes,
        "sources":        sources,
        "closes_at":      closes_at or None,
        "status":         "captured",
        "captured_at":    capture.get("captured_at"),
        "capture_source": capture_source,
        "capture_method": capture_method,
        "ipfs_cid":       capture.get("ipfs_cid"),
        "evidence_hash":  capture.get("capture_hash"),
        "raw_evidence":   capture.get("raw_evidence"),
        "updated_at":     now_iso(),
    }

    try:
        r = requests.post(
            f"{SUPABASE_URL}/rest/v1/oracle_markets",
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates",
            },
            json=row, timeout=15,
        )
        if r.ok:
            print(f"[watcher] ✓ Saved to oracle_markets: {market_id[:10]}")
            return True
        print(f"[watcher] Supabase save failed: {r.status_code} {r.text[:200]}")
        return False
    except Exception as e:
        print(f"[watcher] Supabase error: {e}")
        return False

def parse_close_time(market) -> Optional[datetime]:
    raw = market.get("resolvesAt") or market.get("closeTime") or ""
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except Exception:
        return None

def pin_to_ipfs(data: dict, name: str) -> Optional[str]:
    if not PINATA_JWT:
        return None
    try:
        r = requests.post(
            "https://uploads.pinata.cloud/v3/files",
            headers={"Authorization": f"Bearer {PINATA_JWT}"},
            files={"file": (f"{name}.json", json.dumps(data), "application/json")},
            timeout=30,
        )
        print(f"[watcher] Pinata response: {r.status_code} {r.text[:200]}")
        resp = r.json()
        cid = (
            resp.get("data", {}).get("cid") or
            resp.get("IpfsHash") or
            resp.get("cid")
        )
        if cid:
            print(f"[watcher] IPFS pinned: {cid}")
            return cid
        print("[watcher] IPFS pin failed — no CID in response")
        return None
    except Exception as e:
        print(f"[watcher] IPFS failed: {e}")
        return None

# ─── Main capture function ────────────────────────────────────────────────────

def capture_market(market: dict, close_time: datetime) -> dict:
    meta         = market.get("metadata") or {}
    question     = meta.get("question", "Unknown")
    market_id    = market.get("id", "unknown")
    data_sources = market.get("dataSources") or []
    outcomes     = meta.get("outcomes") or []

    print(f"\n[watcher] ═══════════════════════════════════════")
    print(f"[watcher] Capturing: {question[:70]}")
    print(f"[watcher] Sources: {data_sources}")
    print(f"[watcher] Outcomes: {outcomes}")

# Step 1: Fetch from creator's listed sources ONLY.
    # Sort sources — try non-social media first for better evidence quality
    print("[watcher] Step 1: Fetching from creator sources...")
    source_snapshots = []
    combined_evidence = ""
    best_method = None
    best_source = None

    social = {"x.com", "twitter", "x (twitter)", "x (", "reddit", "instagram"}
    sorted_sources = sorted(
        data_sources[:3],
        key=lambda s: any(x in s.lower() for x in social)
    )

    for source in sorted_sources:
        snap = fetch_from_source(source, question, close_time.isoformat())
        source_snapshots.append(snap)
        if snap.get("text_snippet") and not combined_evidence:
            combined_evidence = snap["text_snippet"]
            best_method = snap.get("fetch_method", "direct")
            best_source = snap.get("domain", source)
            print(f"[watcher] Got evidence from {source} via {best_method}")

    # Step 2: Last resort general Tavily, clearly flagged.
    source_warning = None
    if not combined_evidence:
        print("[watcher] All sources failed — trying general Tavily")
        combined_evidence = search_tavily_general(question, close_time.isoformat())
        if combined_evidence:
            best_method = "general_tavily"
            source_warning = "WARNING: general web search used — source integrity not guaranteed"
            print("[watcher] ⚠ Using general Tavily")

    # Step 3: Extract verdict.
    if combined_evidence and outcomes:
        print("[watcher] Step 3: Extracting verdict...")
        verdict = extract_verdict(
            question, outcomes, combined_evidence,
            data_sources, best_method or "unknown",
        )
        print(f"[watcher] Verdict: {verdict.get('matchedOutcome')} ({verdict.get('confidence')})")
    else:
        verdict = {
            "matchedOutcome": None,
            "confidence": 0,
            "explanation": f"Could not fetch: {data_sources}",
        }
        print("[watcher] ✗ INCONCLUSIVE")

# Step 4: Build + save.
    capture = {
        "market_id":            market_id,
        "market_question":      question,
        "close_time":           close_time.isoformat(),
        "captured_at":          now_iso(),
        "capture_strategy":     "creator_sources",
        "data_sources_listed":  data_sources,
        "data_sources_fetched": source_snapshots,
        "best_source":          best_source,
        "verdict":              verdict,
        "raw_evidence":         combined_evidence[:2000] if combined_evidence else None,
        "capture_hash":         sha256(json.dumps(source_snapshots, sort_keys=True)),
    }
    if source_warning:
        capture["source_warning"] = source_warning

    capture["ipfs_cid"] = pin_to_ipfs(capture, f"oracle-seal-{market_id[:10]}")
    save_to_supabase(market, capture)
    print(f"[watcher] Done: {market_id[:10]} → IPFS: {capture.get('ipfs_cid')}")
    print("[watcher] ═══════════════════════════════════════\n")
    return capture

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print(f"[watcher] Starting at {now_iso()}")
    markets = fetch_open_markets()
    now = now_utc()

    # Wide window: 15 min back (catch missed) + 6 min forward
    window_start = now - timedelta(minutes=15)
    window_end   = now + timedelta(minutes=6)

    to_capture = []
    captured_count = 0

    for market in markets:
        mid        = market.get("id", "")
        close_time = parse_close_time(market)
        if not close_time:
            continue
        if already_captured(mid):
            captured_count += 1
            continue
        if window_start <= close_time <= window_end:
            q = (market.get("metadata") or {}).get("question", "")[:60]
            print(f"[watcher] In window: {q}")
            to_capture.append((market, close_time))

    print(f"[watcher] {captured_count} already captured | {len(to_capture)} to capture now")

    if not to_capture:
        print("[watcher] No markets closing in this window")
        return

    for market, close_time in to_capture:
        wait = (close_time - now_utc()).total_seconds()
        if wait > 0:
            print(f"[watcher] Waiting {wait:.1f}s until exact close time...")
            time.sleep(wait)
        capture_market(market, close_time)

    print(f"[watcher] Done.")

if __name__ == "__main__":
    main()
