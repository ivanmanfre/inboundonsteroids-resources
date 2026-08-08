import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-key");
Deno.env.set("N8N_PROMOTER_WEBHOOK_URL", "https://n8n.example.com/webhook/lm-curator-promote");

const { default: handler } = await import("./index.ts");

Deno.test("rejects non-POST", async () => {
  const r = await handler(new Request("http://localhost/", { method: "GET" }));
  assertEquals(r.status, 405);
});

Deno.test("requires candidate_id and decision", async () => {
  const r = await handler(new Request("http://localhost/", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision: "approve" }),
  }));
  assertEquals(r.status, 400);
});

Deno.test("rejects invalid decision", async () => {
  const r = await handler(new Request("http://localhost/", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidate_id: "abc", decision: "explode" }),
  }));
  assertEquals(r.status, 400);
  const body = await r.json();
  assertEquals(body.error, "invalid_decision");
});

Deno.test("accepts valid approve shape (network call will fail in test, shape-only)", async () => {
  const r = await handler(new Request("http://localhost/", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      candidate_id: "00000000-0000-0000-0000-000000000000",
      decision: "approve",
      reason: "looks good",
    }),
  }));
  assert([200, 502].includes(r.status));
});
