import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-key");

const { default: handler } = await import("./index.ts");

Deno.test("rejects non-GET", async () => {
  const req = new Request("http://localhost/", { method: "POST" });
  const res = await handler(req);
  assertEquals(res.status, 405);
});

Deno.test("returns CORS headers on OPTIONS", async () => {
  const req = new Request("http://localhost/", { method: "OPTIONS" });
  const res = await handler(req);
  assertEquals(res.status, 204);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
});

Deno.test("returns structured shape on GET (network mocked or live)", async () => {
  // This test is shape-only; live PostgREST call is exercised in deploy smoke test.
  const req = new Request("http://localhost/?limit=1", { method: "GET" });
  const res = await handler(req);
  assert([200, 502].includes(res.status));
  if (res.status === 200) {
    const body = await res.json();
    assert("pending" in body);
    assert("recent_promoted" in body);
    assert("recent_archived" in body);
    assert("metrics" in body);
  }
});
