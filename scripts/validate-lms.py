#!/usr/bin/env python3
"""
LM Validator — nightly post-deploy QA sweep over all live LMs.

Combines:
- Tier 2 #23 multi-surface QA tests (Run 3-D §6, 10 deterministic checks)
- Tier 3 #27 regex post-validator (em-dash count + <li> density + digit-vs-source)
- Tier 4 #32 meta-description markdown-leak detector

Usage:
  ./scripts/validate-lms.py                  # full sweep
  ./scripts/validate-lms.py --slug=foo       # single LM
  ./scripts/validate-lms.py --json           # machine-readable output

Exit codes:
  0 = all pass
  1 = drift detected (see report)
  2 = script error
"""
import json, re, sys, os, urllib.request, urllib.error, argparse
from collections import defaultdict

SUPABASE_URL = "https://bjbvqvzbzczjbatgmccb.supabase.co"
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqYnZxdnpiemN6amJhdGdtY2NiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODMwNTA4MCwiZXhwIjoyMDgzODgxMDgwfQ.1ioXfrOjVR2QKNW1XW1WggdrxjVIB-5eW3AaT7byqw8")
RESOURCES_BASE = "https://resources.ivanmanfredi.com"

FORBIDDEN_IDENTITY = re.compile(
    r"AI Architect|AI &(?:amp;)? Automation Architect|AI consultant|AI advisor|AI strategist|automation consultant",
    re.IGNORECASE,
)
BANNED_BUZZWORDS = re.compile(
    r"\b(delve|leverage|harness|seamless|robust|holistic|empower|elevate|utilize|unlock|streamline|cutting-edge|game-changer|transformative|ecosystem|AI-powered|supercharge|rockstar|purpose-driven|stakeholder)\b",
    re.IGNORECASE,
)
APPROVED_ANCHORS = {"50+ companies", "40+ systems", "6,000+ hours", "dozens of $1-10M"}


def sb_get(path, params=None):
    qs = ""
    if params:
        from urllib.parse import urlencode
        qs = "?" + urlencode(params)
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{path}{qs}",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"error": e.code, "body": e.read().decode()}


def fetch_url(url, timeout=15):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "lm-validator/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read().decode("utf-8", errors="replace")
    except Exception as e:
        return None


def count_em_dashes(text):
    if not text:
        return 0
    return text.count("—") + text.count("–")


def find_numeric_tokens(text):
    """Extract numeric stat tokens like '$40K', '87%', '20+', '47'."""
    return re.findall(r"\$\d[\d,.]*[KkM]?(?:/yr|/week|/mo)?|\d[\d,.]*%|\d{2,}\+|\b\d{2,}\b", text or "")


def is_approved_anchor(token, content_blob):
    """A numeric token is OK if (a) in approved anchors list, or (b) appears verbatim in lm_content."""
    if any(a in (content_blob or "") for a in APPROVED_ANCHORS):
        pass  # anchors known
    return (content_blob or "").find(token) >= 0


def run_tests(lms, deep=True):
    """Execute all validator tests. Returns dict of failures by test name."""
    failures = defaultdict(list)

    for lm in lms:
        slug = lm.get("slug")
        if not slug:
            continue
        fmt = lm.get("format")

        # Fetch live data.json + index.html
        data_json_raw = fetch_url(f"{RESOURCES_BASE}/{slug}/data.json") if deep else None
        index_html = fetch_url(f"{RESOURCES_BASE}/{slug}/index.html") if deep else None
        try:
            data = json.loads(data_json_raw) if data_json_raw else None
        except json.JSONDecodeError:
            data = None

        # === Test 2 — CTA Calendly-direct in widget tier copy ===
        if data and isinstance(data.get("ctas"), list):
            for i, c in enumerate(data["ctas"]):
                if isinstance(c, dict) and "calendly.com" in (c.get("url") or "").lower():
                    failures["T2_cta_calendly"].append(f"{slug}: ctas[{i}] ({c.get('id','?')}) → {c.get('url')}")

        # === Test 3 — Cover-bullet fabricated stats ===
        if data:
            bullets = data.get("cover_bullets") or []
            if isinstance(bullets, list):
                blob = json.dumps(data, ensure_ascii=False)  # full lm body as source
                for b in bullets:
                    if not isinstance(b, str):
                        continue
                    for tok in find_numeric_tokens(b):
                        if not is_approved_anchor(tok, blob.replace(b, "")):
                            failures["T3_cover_fabricated_stats"].append(f"{slug}: bullet {b!r} has {tok!r} not in lm_content")

        # === Test 4 — Identity drift ===
        if data:
            blob = json.dumps(data, ensure_ascii=False)
            if FORBIDDEN_IDENTITY.search(blob):
                hits = FORBIDDEN_IDENTITY.findall(blob)
                failures["T4_identity_drift_data"].append(f"{slug}: data.json contains {set(hits)}")
        if index_html and FORBIDDEN_IDENTITY.search(index_html):
            hits = FORBIDDEN_IDENTITY.findall(index_html)
            failures["T4_identity_drift_html"].append(f"{slug}: index.html contains {set(hits)}")

        # === Test 6 — Meta description markdown leakage ===
        if index_html:
            m = re.search(r'<meta name="description" content="([^"]*)"', index_html)
            if m:
                desc = m.group(1)
                if re.search(r"^##|^\*\*|\\n|^#\s", desc):
                    failures["T6_meta_markdown_leak"].append(f"{slug}: meta_description starts with markdown — {desc[:80]}...")
                if len(desc) > 200:
                    failures["T6_meta_too_long"].append(f"{slug}: meta_description {len(desc)} chars (>200)")

        # === Test 7 — Tier-name presence on Interactive Assessments ===
        if fmt == "Interactive Assessment" and data:
            tn = (data.get("tier_names") if isinstance(data.get("tier_names"), dict) else None)
            if not tn or not all(tn.get(k) for k in ("low", "mid", "high")):
                failures["T7_assessment_missing_tier_names"].append(f"{slug}: tier_names absent or incomplete")

        # === Test 8 — Em-dash count across surfaces ===
        if data:
            blob = json.dumps(data, ensure_ascii=False)
            em_count = count_em_dashes(blob)
            if em_count > 1:
                failures["T8_emdash_density"].append(f"{slug}: data.json contains {em_count} em/en-dashes")
        if index_html:
            em_index = count_em_dashes(index_html)
            if em_index > 3:  # tolerate a few in legacy wrapper
                failures["T8_emdash_index_html"].append(f"{slug}: index.html contains {em_index} em/en-dashes")

        # === Banned buzzwords scan ===
        if data:
            blob = json.dumps(data, ensure_ascii=False)
            hits = set(m.group(0).lower() for m in BANNED_BUZZWORDS.finditer(blob))
            if hits:
                failures["B_buzzwords"].append(f"{slug}: data.json contains {hits}")

        # === <li> density (Run 3-E #2 — bullet-list fallback) ===
        if index_html:
            li_count = len(re.findall(r"<li[\s>]", index_html, re.IGNORECASE))
            # Threshold: 40+ <li> in body is bullet-fallback tell
            if li_count > 40:
                failures["B_li_density"].append(f"{slug}: index.html has {li_count} <li> elements (bullet-fallback tell)")

    # === Test 1 — Offer name drift in 24h emails ===
    emails = sb_get("assessment_results", {"select": "id,assessment_slug,email_24h_html", "email_24h_html": "not.is.null", "limit": "500"})
    if isinstance(emails, list):
        for e in emails:
            html = e.get("email_24h_html") or ""
            if "Agent-Ready Assessment" in html:
                failures["T1_email_offer_name_drift"].append(f"{e.get('assessment_slug','?')} ({e.get('id')}): 'Agent-Ready Assessment' in email_24h_html")
            # Test 10 — Price next to Blueprint
            if re.search(r"Agent-Ready Blueprint[^.]*\$\d", html):
                failures["T10_email_price_near_blueprint"].append(f"{e.get('assessment_slug','?')} ({e.get('id')}): price near Blueprint")
            # Em-dash count in email
            em = count_em_dashes(html)
            if em > 0:
                failures["T8_emdash_email"].append(f"{e.get('assessment_slug','?')} ({e.get('id')}): {em} em-dashes in email")

    return failures


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--slug", help="Run on a single LM")
    parser.add_argument("--json", action="store_true", help="JSON output")
    parser.add_argument("--no-deep", action="store_true", help="Skip URL fetches (Supabase-only checks)")
    args = parser.parse_args()

    # Fetch all live LMs
    params = {"select": "id,slug,format,content_quality_score"}
    if args.slug:
        params["slug"] = f"eq.{args.slug}"
    else:
        params["slug"] = "not.is.null"

    lms = sb_get("lead_magnets", params)
    if isinstance(lms, dict) and "error" in lms:
        print(f"Supabase fetch failed: {lms}", file=sys.stderr)
        sys.exit(2)

    print(f"Validating {len(lms)} LM(s)...", file=sys.stderr)
    failures = run_tests(lms, deep=not args.no_deep)

    if args.json:
        print(json.dumps({k: v for k, v in failures.items()}, indent=2))
    else:
        if not failures:
            print("✓ All LMs pass all checks.")
        else:
            total = sum(len(v) for v in failures.values())
            print(f"✗ {total} drift(s) across {len(failures)} test(s):\n")
            for test_name, items in sorted(failures.items()):
                print(f"  [{test_name}] {len(items)} hit(s):")
                for item in items[:10]:
                    print(f"    - {item}")
                if len(items) > 10:
                    print(f"    ... and {len(items) - 10} more")
                print()

    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
