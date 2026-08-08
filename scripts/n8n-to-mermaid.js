// Convert an n8n workflow JSON into Mermaid flowchart syntax.
// Each node becomes a labeled rect; each connection becomes a directed edge.

function nodeId(name) {
  return name.replace(/[^a-zA-Z0-9]/g, "_") || "N";
}

function nodeLabel(name) {
  return name.replace(/"/g, "\\\"");
}

export function n8nToMermaid(workflow) {
  const lines = ["flowchart TD"];
  const nodes = workflow.nodes || [];
  nodes.forEach((n) => {
    lines.push(`  ${nodeId(n.name)}["${nodeLabel(n.name)}"]`);
  });
  const conns = workflow.connections || {};
  Object.keys(conns).forEach((from) => {
    const outputs = conns[from].main || [];
    outputs.forEach((targets) => {
      (targets || []).forEach((t) => {
        if (t && t.node) {
          lines.push(`  ${nodeId(from)} --> ${nodeId(t.node)}`);
        }
      });
    });
  });
  return lines.join("\n");
}
