/* JSON Schemas for LM data.json files. Used by:
 *  - edit-mode raw JSON modal (client-side validation hint)
 *  - n8n LM Inline Edit Saver webhook (server-side gate before commit)
 *
 * Format: lightweight JSON Schema subset. Validators check:
 *  - required top-level fields
 *  - type of arrays / objects
 *  - presence of stable IDs on each item
 */
(function () {
  "use strict";
  var schemas = {
    checklist: {
      required: ["slug", "title", "sections"],
      properties: {
        slug: "string",
        title: "string",
        subtitle: "string?",
        estimated_minutes: "number?",
        sections: {
          type: "array",
          items: {
            required: ["id", "title", "items"],
            properties: {
              id: "string",
              title: "string",
              description: "string?",
              items: {
                type: "array",
                items: {
                  required: ["id", "text"],
                  properties: {
                    id: "string",
                    text: "string",
                    tip: "string?",
                    impact: "string?",
                  },
                },
              },
            },
          },
        },
        ctas: { type: "array?" },
      },
    },
    calculator: {
      required: ["slug", "title", "inputs", "outputs"],
      properties: {
        slug: "string",
        title: "string",
        subtitle: "string?",
        inputs: {
          type: "array",
          items: {
            required: ["id", "label"],
            properties: { id: "string", label: "string", type: "string?", default: "any?", min: "number?", max: "number?" },
          },
        },
        outputs: {
          type: "array",
          items: {
            required: ["id", "label", "formula"],
            properties: { id: "string", label: "string", formula: "string", format: "string?" },
          },
        },
        recommendations: { type: "array?" },
        ctas: { type: "array?" },
      },
    },
    assessment: {
      required: ["slug", "title", "categories"],
      properties: {
        slug: "string",
        title: "string",
        subtitle: "string?",
        categories: {
          type: "array",
          items: {
            required: ["id", "name", "questions"],
            properties: {
              id: "string",
              name: "string",
              questions: {
                type: "array",
                items: {
                  required: ["id", "text"],
                  properties: { id: "string", text: "string", type: "string?", weight: "number?" },
                },
              },
            },
          },
        },
        ctas: { type: "array?" },
        computed_outputs: { type: "array?" },
      },
    },
    architecture: {
      required: ["slug", "title", "diagram"],
      properties: {
        slug: "string",
        data_version: "number?",
        title: "string",
        subtitle: "string?",
        // diagram is validated by the architecture-specific custom hook below
        ctas: { type: "array?" },
      },
    },
  };

  // Architecture has nested arrays that the lightweight validator above can't
  // express directly. Provide a custom hook that runs after the generic checks.
  var customValidators = {
    architecture: function (data) {
      var errs = [];
      if (!data || typeof data !== "object") return errs;
      var d = data.diagram;
      if (!d || typeof d !== "object") { errs.push("Missing required field: $.diagram"); return errs; }
      if (!Array.isArray(d.nodes)) { errs.push("diagram.nodes must be an array"); }
      else {
        var ids = {};
        d.nodes.forEach(function (n, i) {
          var p = "diagram.nodes[" + i + "]";
          ["id", "type", "x", "y", "width", "height", "label"].forEach(function (k) {
            if (n == null || n[k] == null) errs.push("Missing " + p + "." + k);
          });
          if (n && n.id) {
            if (ids[n.id]) errs.push("Duplicate node id: " + n.id);
            ids[n.id] = true;
          }
          if (n && n.type && ["trigger", "transform", "output", "decision", "storage"].indexOf(n.type) === -1) {
            errs.push(p + ".type must be one of trigger|transform|output|decision|storage");
          }
        });
        if (Array.isArray(d.edges)) {
          d.edges.forEach(function (e, i) {
            var p = "diagram.edges[" + i + "]";
            if (!e || !e.from) errs.push("Missing " + p + ".from");
            if (!e || !e.to) errs.push("Missing " + p + ".to");
            if (e && e.from && !ids[e.from]) errs.push(p + ".from references unknown node id: " + e.from);
            if (e && e.to && !ids[e.to]) errs.push(p + ".to references unknown node id: " + e.to);
          });
        }
      }
      return errs;
    }
  };

  function typeOf(v) {
    if (v === null) return "null";
    if (Array.isArray(v)) return "array";
    return typeof v;
  }

  function validateAgainst(schema, value, path) {
    var errors = [];
    path = path || "$";
    if (schema.required) {
      schema.required.forEach(function (k) {
        if (value == null || value[k] == null) errors.push("Missing required field: " + path + "." + k);
      });
    }
    if (schema.properties) {
      Object.keys(schema.properties).forEach(function (k) {
        var spec = schema.properties[k];
        var v = value && value[k];
        if (v == null) return;  // optional or already flagged above
        if (typeof spec === "string") {
          var optional = spec.endsWith("?");
          var expectedType = optional ? spec.slice(0, -1) : spec;
          if (expectedType === "any") return;
          if (typeOf(v) !== expectedType) errors.push("Wrong type at " + path + "." + k + ": expected " + expectedType + ", got " + typeOf(v));
        } else if (spec.type === "array" || spec.type === "array?") {
          if (typeOf(v) !== "array") { errors.push("Expected array at " + path + "." + k); return; }
          if (spec.items) v.forEach(function (item, i) { errors = errors.concat(validateAgainst(spec.items, item, path + "." + k + "[" + i + "]")); });
        }
      });
    }
    return errors;
  }

  function validate(format, data) {
    var schema = schemas[format];
    if (!schema) return ["Unknown format: " + format];
    var errs = validateAgainst(schema, data);
    if (customValidators[format]) errs = errs.concat(customValidators[format](data));
    return errs;
  }

  window.LM_SCHEMAS = { schemas: schemas, validate: validate };
})();
