// Sanitize an n8n workflow JSON export for public publishing.
// Strips:
//   - credentials block on every node (these reference n8n credential IDs)
//   - parameter values that look like API keys, bearer tokens, secrets
//   - webhook IDs (auto-regenerated on import)
//   - active flag (always start inactive)

const SECRET_VALUE_PATTERNS = [
  /^Bearer\s+[A-Za-z0-9_\-.]{8,}/i,
  /^sk[_-][A-Za-z0-9]{8,}/,        // OpenAI, Stripe-like
  /^pk_[A-Za-z0-9_]{8,}/,            // public-ish keys
  /^eyJ[A-Za-z0-9_\-]{20,}\./,       // JWTs
  /^[A-Za-z0-9_-]{32,}$/,            // long opaque tokens
];

function isSecretValue(v) {
  if (typeof v !== "string") return false;
  return SECRET_VALUE_PATTERNS.some((re) => re.test(v));
}

function scrubValue(v) {
  if (typeof v === "string" && isSecretValue(v)) return "YOUR_API_KEY";
  if (Array.isArray(v)) return v.map(scrubValue);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v)) out[k] = scrubValue(v[k]);
    return out;
  }
  return v;
}

export function sanitizeN8nExport(workflow) {
  const out = JSON.parse(JSON.stringify(workflow));
  delete out.active;
  delete out.id;
  delete out.versionId;
  delete out.meta;
  if (Array.isArray(out.nodes)) {
    out.nodes = out.nodes.map((node) => {
      const n = { ...node };
      delete n.credentials;
      delete n.webhookId;
      if (n.parameters) n.parameters = scrubValue(n.parameters);
      return n;
    });
  }
  return out;
}
