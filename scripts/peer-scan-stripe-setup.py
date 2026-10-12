#!/usr/bin/env python3
"""LinkedIn Peer Scan: Stripe TEST-mode setup (2026-10-12).

Reads the Stripe test secret key from the macOS keychain (service "stripe-test-secret-key", account "ivan"),
refuses anything that is not an sk_test_/rk_test_ key, then (idempotent, safe to re-run):
  1. product "LinkedIn Peer Scan" + one-off $99 USD price
  2. Payment Link (redirects to /peer-scan/thanks/) -> integration_config.peer_scan_payment_link
  3. webhook endpoint -> peer-scan-stripe-webhook (checkout.session.completed + async_payment_succeeded);
     its signing secret goes to the keychain ("stripe-test-webhook-secret") and to the edge secret STRIPE_WEBHOOK_SECRET
  4. edge secret STRIPE_SECRET_KEY (test key)

Store the key first:   security add-generic-password -s stripe-test-secret-key -a ivan -w 'sk_test_...'
Run:                   python3 scripts/peer-scan-stripe-setup.py [--check]
Never prints a key.
--live (2026-10-12, test key expired): uses keychain "stripe-live-secret-key" and "stripe-live-webhook-secret" instead.
Live setup does not open orders: the page stays closed until integration_config.peer_scan_orders_open = 'true'.
"""
import base64, json, subprocess, sys, urllib.parse, urllib.request

REF = "bjbvqvzbzczjbatgmccb"
FN = f"https://{REF}.supabase.co/functions/v1/peer-scan-stripe-webhook"
THANKS = "https://resources.inboundonsteroids.com/peer-scan/thanks/"
EVENTS = ["checkout.session.completed", "checkout.session.async_payment_succeeded"]


def keychain(service, account="ivan"):
    r = subprocess.run(["security", "find-generic-password", "-s", service, "-a", account, "-w"], capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else None


def keychain_set(service, value, account="ivan"):
    subprocess.run(["security", "add-generic-password", "-U", "-s", service, "-a", account, "-w", value], check=True, capture_output=True)


def sbp_token():
    raw = subprocess.run(["security", "find-generic-password", "-s", "Supabase CLI", "-w"], capture_output=True, text=True, check=True).stdout.strip()
    return base64.b64decode(raw.replace("go-keyring-base64:", "")).decode()


def sql(q):
    req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{REF}/database/query", data=json.dumps({"query": q}).encode(),
                                 headers={"Authorization": "Bearer " + sbp_token(), "Content-Type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(req).read() or b"[]")


def edge_secret(name, value):
    req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{REF}/secrets", data=json.dumps([{"name": name, "value": value}]).encode(),
                                 headers={"Authorization": "Bearer " + sbp_token(), "Content-Type": "application/json"}, method="POST")
    urllib.request.urlopen(req).read()


def stripe(key, method, path, params=None):
    data = urllib.parse.urlencode(params or {}, doseq=True).encode() if method == "POST" else None
    url = "https://api.stripe.com/v1/" + path + ("?" + urllib.parse.urlencode(params, doseq=True) if params and method == "GET" else "")
    req = urllib.request.Request(url, data=data, method=method, headers={"Authorization": "Bearer " + key})
    try:
        return json.loads(urllib.request.urlopen(req).read())
    except urllib.error.HTTPError as e:
        raise SystemExit(f"stripe {method} {path} {e.code}: {e.read()[:300].decode(errors='replace')}")


def main():
    mode = "live" if "--live" in sys.argv else "test"
    key = keychain(f"stripe-{mode}-secret-key")
    if not key:
        print(f"MISSING: no keychain item service=stripe-{mode}-secret-key account=ivan")
        return 2
    if not key.startswith((f"sk_{mode}_", f"rk_{mode}_")):
        print(f"REFUSED: the stored key is not a {mode} key")
        return 3
    acct = stripe(key, "GET", "account")
    print(f"stripe {mode} account ok:", acct.get("id"), "| charges_enabled:", acct.get("charges_enabled"))
    if "--check" in sys.argv:
        return 0

    prods = [p for p in stripe(key, "GET", "products", {"limit": 100, "active": "true"})["data"] if (p.get("metadata") or {}).get("peer_scan") == "1"]
    prod = prods[0] if prods else stripe(key, "POST", "products", {"name": "LinkedIn Peer Scan", "metadata[peer_scan]": "1",
                                                                     "description": "Your LinkedIn ranked against creators your size in your niche, with a 4-week plan."})
    prices = [p for p in stripe(key, "GET", "prices", {"product": prod["id"], "active": "true", "limit": 10})["data"] if p["unit_amount"] == 9900 and p["currency"] == "usd"]
    price = prices[0] if prices else stripe(key, "POST", "prices", {"product": prod["id"], "unit_amount": 9900, "currency": "usd"})
    links = [l for l in stripe(key, "GET", "payment_links", {"limit": 100, "active": "true"})["data"] if (l.get("metadata") or {}).get("peer_scan") == "1"]
    link = links[0] if links else stripe(key, "POST", "payment_links", {
        "line_items[0][price]": price["id"], "line_items[0][quantity]": 1, "metadata[peer_scan]": "1",
        "after_completion[type]": "redirect", "after_completion[redirect][url]": THANKS,
        "allow_promotion_codes": "false", "billing_address_collection": "auto"})
    print("payment link:", link["url"], "| product", prod["id"], "| price", price["id"])
    sql("insert into integration_config(key,value) values ('peer_scan_payment_link', '\"%s\"') "
        "on conflict (key) do update set value = excluded.value" % link["url"].replace("'", "").replace('"', ""))

    eps = [e for e in stripe(key, "GET", "webhook_endpoints", {"limit": 100})["data"] if e["url"] == FN]
    whsec = keychain(f"stripe-{mode}-webhook-secret")
    if eps and not whsec:  # the signing secret is only shown at creation: recreate so we hold it
        for e in eps:
            stripe(key, "DELETE", "webhook_endpoints/" + e["id"])
        eps = []
    if not eps:
        params = {"url": FN, "description": "LinkedIn Peer Scan orders"}
        for i, ev in enumerate(EVENTS):
            params[f"enabled_events[{i}]"] = ev
        ep = stripe(key, "POST", "webhook_endpoints", params)
        whsec = ep["secret"]
        keychain_set(f"stripe-{mode}-webhook-secret", whsec)
        print("webhook endpoint created:", ep["id"])
    else:
        print("webhook endpoint exists:", eps[0]["id"])
    edge_secret("STRIPE_WEBHOOK_SECRET", whsec)
    edge_secret("STRIPE_SECRET_KEY", key)
    print(f"edge secrets set: STRIPE_WEBHOOK_SECRET, STRIPE_SECRET_KEY ({mode})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
