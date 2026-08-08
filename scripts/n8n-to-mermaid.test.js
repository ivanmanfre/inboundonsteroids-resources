import assert from "node:assert/strict";
import { test } from "node:test";
import { n8nToMermaid } from "./n8n-to-mermaid.js";

const WF = {
  name: "Demo",
  nodes: [
    { name: "Webhook", type: "n8n-nodes-base.webhook" },
    { name: "Enrich", type: "n8n-nodes-base.httpRequest" },
    { name: "Slack Review", type: "n8n-nodes-base.slack" },
    { name: "Generate PDF", type: "n8n-nodes-base.httpRequest" }
  ],
  connections: {
    "Webhook": { main: [[{ node: "Enrich", type: "main", index: 0 }]] },
    "Enrich": { main: [[{ node: "Slack Review", type: "main", index: 0 }]] },
    "Slack Review": { main: [[{ node: "Generate PDF", type: "main", index: 0 }]] }
  }
};

test("emits Mermaid flowchart syntax", () => {
  const out = n8nToMermaid(WF);
  assert.match(out, /^flowchart TD/m);
});

test("includes every node as a graph node", () => {
  const out = n8nToMermaid(WF);
  assert.match(out, /Webhook/);
  assert.match(out, /Enrich/);
  assert.match(out, /Slack Review/);
  assert.match(out, /Generate PDF/);
});

test("includes every connection as an edge", () => {
  const out = n8nToMermaid(WF);
  assert.match(out, /Webhook.*-->.*Enrich/);
  assert.match(out, /Enrich.*-->.*Slack_Review/);
  assert.match(out, /Slack_Review.*-->.*Generate_PDF/);
});

test("handles missing connections gracefully (orphan node)", () => {
  const WF2 = { nodes: [{ name: "Lone", type: "n8n-nodes-base.set" }], connections: {} };
  const out = n8nToMermaid(WF2);
  assert.match(out, /Lone/);
});
