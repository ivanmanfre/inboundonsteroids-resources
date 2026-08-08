import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeN8nExport } from "./sanitize-n8n-export.js";

const SAMPLE = {
  name: "Test",
  nodes: [
    {
      name: "HTTP",
      parameters: {
        url: "https://api.example.com",
        authentication: "headerAuth",
        headerParameters: { parameters: [{ name: "Authorization", value: "Bearer secret_token_xyz_abcdefg" }] }
      },
      credentials: { httpHeaderAuth: { id: "abc123", name: "My API Key" } }
    },
    {
      name: "Postgres",
      parameters: { query: "SELECT * FROM users" },
      credentials: { postgres: { id: "pg-001", name: "Production DB" } }
    }
  ]
};

test("removes top-level credentials block from every node", () => {
  const out = sanitizeN8nExport(SAMPLE);
  assert.equal(out.nodes[0].credentials, undefined);
  assert.equal(out.nodes[1].credentials, undefined);
});

test("scrubs Bearer-token-like values in header parameters", () => {
  const out = sanitizeN8nExport(SAMPLE);
  const auth = out.nodes[0].parameters.headerParameters.parameters[0].value;
  assert.match(auth, /YOUR_API_KEY/i);
});

test("preserves node structure and counts", () => {
  const out = sanitizeN8nExport(SAMPLE);
  assert.equal(out.nodes.length, 2);
  assert.equal(out.nodes[0].name, "HTTP");
  assert.equal(out.nodes[1].name, "Postgres");
});

test("preserves workflow name", () => {
  const out = sanitizeN8nExport(SAMPLE);
  assert.equal(out.name, "Test");
});
