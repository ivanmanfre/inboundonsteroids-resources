/* LM Edit Mode — lazy-loaded module triggered by ?edit=<token>.
 * Provides inline field/array editing, raw JSON modal, undo, save flow.
 * Public API (set on window.__LM_EDIT_MODE_API):
 *   - attachField(el, path, opts)
 *   - attachArray(el, arrayPath, opts)
 *   - mount({ token, slug, format, data })
 */
(function () {
  "use strict";

  // ── Configuration ─────────────────────────────────────────────────────
  var EDIT_WEBHOOK = "https://n8n.ivanmanfredi.com/webhook/edit-lm";
  var GITHUB_REPO = "ivanmanfredi/resources";
  var GITHUB_API = "https://api.github.com";
  var REWRITE_URL = "https://bjbvqvzbzczjbatgmccb.supabase.co/functions/v1/lm-copy-rewrite";

  // ── State ─────────────────────────────────────────────────────────────
  var state = {
    token: null,
    slug: null,
    format: null,
    data: null,           // working copy (mutated by edits)
    originalData: null,   // pristine snapshot for "discard"
    dirty: false,
    fieldEls: [],         // [{el, path}]
    arrayEls: [],         // [{el, arrayPath}]
    originalIds: new Set(),  // immutable IDs across items/questions/categories
    toolbar: null,
    isPreviewDraft: false,
  };

  // ── Utilities ─────────────────────────────────────────────────────────
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function make(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "class") e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function deepClone(v) { return JSON.parse(JSON.stringify(v)); }
  function getByPath(obj, path) {
    var parts = path.split(".");
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      var p = parts[i];
      var m = p.match(/^(.+)\[(\d+)\]$/);
      if (m) { cur = cur[m[1]]; if (cur != null) cur = cur[Number(m[2])]; }
      else cur = cur[p];
    }
    return cur;
  }
  function setByPath(obj, path, value) {
    var parts = path.split(".");
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      var p = parts[i];
      var m = p.match(/^(.+)\[(\d+)\]$/);
      if (m) cur = cur[m[1]][Number(m[2])];
      else cur = cur[p];
    }
    var last = parts[parts.length - 1];
    var ml = last.match(/^(.+)\[(\d+)\]$/);
    if (ml) cur[ml[1]][Number(ml[2])] = value;
    else cur[last] = value;
  }
  function genId() {
    return Math.random().toString(36).slice(2, 10);
  }
  function markDirty() {
    if (!state.dirty) state.dirty = true;
    updateToolbarLabel();
  }
  function showToast(msg, isError) {
    var t = $(".lme-edit-toast");
    if (!t) { t = make("div", { class: "lme-edit-toast" }); document.body.appendChild(t); }
    t.textContent = msg;
    t.className = "lme-edit-toast" + (isError ? " lme-edit-toast-error" : "");
    t.classList.add("show");
    setTimeout(function () { t.classList.remove("show"); }, 3000);
  }

  // ── Original ID collection (mitigation #3) ─────────────────────────────
  function collectOriginalIds(data) {
    var ids = new Set();
    function walk(node) {
      if (node && typeof node === "object") {
        if (node.id && typeof node.id === "string") ids.add(node.id);
        if (Array.isArray(node)) node.forEach(walk);
        else Object.values(node).forEach(walk);
      }
    }
    walk(data);
    return ids;
  }

  // ── Toolbar ───────────────────────────────────────────────────────────
  function renderToolbar() {
    if (state.toolbar) return state.toolbar;
    var bar = make("div", { class: "lme-toolbar", role: "toolbar" });
    var label = make("span", { class: "lme-toolbar-label" }, "✎ EDIT");
    var slug = make("span", { class: "lme-toolbar-slug" }, state.slug || "");
    var dirty = make("span", { class: "lme-toolbar-dirty", id: "lme-dirty-indicator" }, "");
    var saveDraft = make("button", { class: "lme-toolbar-btn", type: "button" }, "Save draft");
    var publish = make("button", { class: "lme-toolbar-btn lme-toolbar-btn-primary", type: "button" }, "Publish");
    var discard = make("button", { class: "lme-toolbar-btn lme-toolbar-btn-danger", type: "button" }, "Discard");
    var rawJson = make("button", { class: "lme-toolbar-btn", type: "button" }, "Raw JSON");
    var saves = make("button", { class: "lme-toolbar-btn", type: "button" }, "History");
    var exit = make("button", { class: "lme-toolbar-btn", type: "button" }, "Exit");
    saveDraft.addEventListener("click", function () { saveTo("draft"); });
    publish.addEventListener("click", function () { saveTo("publish"); });
    discard.addEventListener("click", discardChanges);
    rawJson.addEventListener("click", openRawJsonModal);
    saves.addEventListener("click", openSavesPanel);
    exit.addEventListener("click", exitEditMode);
    [label, slug, dirty, saveDraft, publish, discard, rawJson, saves, exit].forEach(function (n) { bar.appendChild(n); });
    document.body.appendChild(bar);
    state.toolbar = bar;
    if (state.isPreviewDraft) {
      var draftTag = make("span", {
        class: "lme-toolbar-label",
        style: "color:#ff9800;border-left:1px solid #444;padding-left:12px;",
      }, "DRAFT PREVIEW");
      bar.insertBefore(draftTag, dirty);
    }
    return bar;
  }
  function updateToolbarLabel() {
    var el = $("#lme-dirty-indicator");
    if (el) el.textContent = state.dirty ? "● unsaved" : "";
  }

  function discardChanges() {
    if (!confirm("Discard all unsaved changes?")) return;
    state.data = deepClone(state.originalData);
    location.reload();
  }
  function exitEditMode() {
    try { sessionStorage.removeItem("ivan.lm.edit_session"); } catch (_) {}
    var url = new URL(location.href);
    url.searchParams.delete("edit");
    url.searchParams.delete("preview");
    location.href = url.toString();
  }

  // ── DOMPurify lazy-load (for contenteditable HTML sanitization) ───────
  var _purifyLoading = null;
  function loadPurify() {
    if (window.DOMPurify) return Promise.resolve(window.DOMPurify);
    if (_purifyLoading) return _purifyLoading;
    _purifyLoading = new Promise(function (resolve) {
      var s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/dompurify@3.0.9/dist/purify.min.js";
      s.onload = function () { resolve(window.DOMPurify || null); };
      s.onerror = function () { resolve(null); };
      document.head.appendChild(s);
    });
    return _purifyLoading;
  }
  function sanitizeHtml(html) {
    if (window.DOMPurify) {
      return window.DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ["p", "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "strong", "em", "a", "code", "pre", "hr", "br", "table", "thead", "tbody", "tr", "th", "td", "div", "span"],
        ALLOWED_ATTR: ["href", "target", "rel", "style", "class"],
      });
    }
    // Fallback: strip script/style tags only. DOMPurify lazy-loads on mount
    // so by the time a user blurs a contenteditable field, it should be ready.
    return String(html || "")
      .replace(/<\/?script[^>]*>/gi, "")
      .replace(/<\/?style[^>]*>/gi, "")
      .replace(/\son\w+=("[^"]*"|'[^']*')/gi, "");
  }

  // ── AI rewrite (✨) ───────────────────────────────────────────────────
  // Client-facing proposal loop: hover any unlocked field, click ✨, type or
  // pick an instruction, get a Now/Proposed panel. Nothing touches el or
  // state.data until the user clicks Keep. A single floating chip is reused
  // across all fields (cheaper than wrapping every field's DOM, and safe —
  // it never becomes a child of el, so it can't pollute el.textContent /
  // el.innerHTML, which are the values read back into state.data on commit).
  var AI_PRESETS = ["Punchier", "Shorter", "More specific", "In my voice"];
  var aiChip = null;
  var aiChipTarget = null;
  var aiChipHideTimer = null;

  function ensureAiChip() {
    if (aiChip) return aiChip;
    aiChip = make("button", {
      class: "lme-ai-chip",
      type: "button",
      title: "Rewrite with AI",
      "aria-label": "Rewrite with AI",
    }, "✨");
    document.body.appendChild(aiChip);
    aiChip.addEventListener("mouseenter", function () {
      if (aiChipHideTimer) { clearTimeout(aiChipHideTimer); aiChipHideTimer = null; }
    });
    aiChip.addEventListener("mouseleave", scheduleHideAiChip);
    aiChip.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (!aiChipTarget) return;
      var t = aiChipTarget;
      hideAiChipNow();
      openAiPanel(t.el, t.path, t.opts);
    });
    window.addEventListener("scroll", function () {
      if (aiChipTarget && aiChip.classList.contains("lme-ai-chip-visible")) positionAiChip(aiChipTarget.el);
    }, true);
    return aiChip;
  }
  function positionAiChip(el) {
    var chip = ensureAiChip();
    var r = el.getBoundingClientRect();
    chip.style.top = Math.max(4, r.top + 4) + "px";
    chip.style.left = Math.max(4, r.right - chip.offsetWidth - 4) + "px";
  }
  function showAiChip(el, path, opts) {
    var chip = ensureAiChip();
    aiChipTarget = { el: el, path: path, opts: opts || {} };
    positionAiChip(el);
    chip.classList.add("lme-ai-chip-visible");
    if (aiChipHideTimer) { clearTimeout(aiChipHideTimer); aiChipHideTimer = null; }
  }
  function scheduleHideAiChip() {
    if (aiChipHideTimer) clearTimeout(aiChipHideTimer);
    aiChipHideTimer = setTimeout(hideAiChipNow, 180);
  }
  function hideAiChipNow() {
    if (aiChip) aiChip.classList.remove("lme-ai-chip-visible");
    aiChipTarget = null;
  }
  // Wires hover/focus listeners that surface the shared ✨ chip for one field.
  // Guarded by data-lme-ai so re-running attachField for the same DOM node
  // (engines re-attach across partial re-renders) never double-wires it.
  function wireAiAffordance(el, path, opts) {
    if (!el || (opts && opts.locked)) return;
    if (el.getAttribute("data-lme-ai") === "1") return;
    el.setAttribute("data-lme-ai", "1");
    function maybeShow() {
      if (el.hasAttribute("data-lme-field-editing")) return;
      showAiChip(el, path, opts);
    }
    el.addEventListener("mouseenter", maybeShow);
    el.addEventListener("mouseleave", scheduleHideAiChip);
    el.addEventListener("focus", maybeShow);
    el.addEventListener("blur", scheduleHideAiChip);
  }
  // Opens the prompt → loading → proposal panel for one field. `original` is
  // captured once here and never reassigned, so Try again / Cancel can never
  // drift from the true pre-rewrite value. state.data / el are only ever
  // written inside the Keep handler.
  function openAiPanel(el, path, opts) {
    var isHtml = !!(opts && opts.contenteditable);
    var original = isHtml ? el.innerHTML : el.textContent;
    var lastInstruction = "";
    var closed = false;

    var backdrop = make("div", { class: "lme-ai-backdrop" });
    var panel = make("div", { class: "lme-ai-panel" });
    var header = make("div", { class: "lme-ai-panel-header" });
    header.appendChild(make("span", { class: "lme-ai-panel-title" }, "✨ Rewrite"));
    var closeBtn = make("button", { class: "lme-ai-panel-close", type: "button", "aria-label": "Close" }, "×");
    header.appendChild(closeBtn);
    var body = make("div", { class: "lme-ai-panel-body" });
    panel.appendChild(header);
    panel.appendChild(body);
    backdrop.appendChild(panel);

    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", onKeydown);
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    }
    function onKeydown(e) {
      if (e.key === "Escape") close();
    }
    closeBtn.addEventListener("click", close);
    backdrop.addEventListener("click", function (e) { if (e.target === backdrop) close(); });
    document.addEventListener("keydown", onKeydown);

    function showPrompt() {
      body.innerHTML = "";
      var input = make("input", { type: "text", class: "lme-ai-input", placeholder: "e.g. punchier, shorter, more specific, in my voice" });
      input.value = lastInstruction;
      var chips = make("div", { class: "lme-ai-chips" });
      AI_PRESETS.forEach(function (label) {
        var chip = make("button", { class: "lme-ai-preset", type: "button" }, label);
        chip.addEventListener("click", function () { submit(label.toLowerCase()); });
        chips.appendChild(chip);
      });
      var actions = make("div", { class: "lme-ai-actions" });
      var cancelBtn = make("button", { class: "lme-ai-btn", type: "button" }, "Cancel");
      var submitBtn = make("button", { class: "lme-ai-btn lme-ai-btn-primary", type: "button" }, "Rewrite");
      cancelBtn.addEventListener("click", close);
      submitBtn.addEventListener("click", function () { submit(input.value.trim()); });
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); submit(input.value.trim()); }
      });
      actions.appendChild(cancelBtn);
      actions.appendChild(submitBtn);
      body.appendChild(input);
      body.appendChild(chips);
      body.appendChild(actions);
      input.focus();
    }

    function showLoading() {
      body.innerHTML = "";
      var loading = make("div", { class: "lme-ai-loading" });
      loading.appendChild(make("span", { class: "lme-ai-spinner" }));
      loading.appendChild(make("span", {}, "Rewriting…"));
      body.appendChild(loading);
    }

    function showProposal(rewritten) {
      body.innerHTML = "";
      var nowBlock = make("div", { class: "lme-ai-block" });
      nowBlock.appendChild(make("div", { class: "lme-ai-block-label" }, "Now"));
      var nowPreview = make("div", { class: "lme-ai-block-content" });
      if (isHtml) nowPreview.innerHTML = sanitizeHtml(original); else nowPreview.textContent = original;
      nowBlock.appendChild(nowPreview);

      var proposedBlock = make("div", { class: "lme-ai-block lme-ai-block-proposed" });
      proposedBlock.appendChild(make("div", { class: "lme-ai-block-label" }, "Proposed"));
      var proposedPreview = make("div", { class: "lme-ai-block-content" });
      if (isHtml) proposedPreview.innerHTML = sanitizeHtml(rewritten); else proposedPreview.textContent = rewritten;
      proposedBlock.appendChild(proposedPreview);

      var actions = make("div", { class: "lme-ai-actions" });
      var cancelBtn = make("button", { class: "lme-ai-btn", type: "button" }, "Cancel");
      var retryBtn = make("button", { class: "lme-ai-btn", type: "button" }, "Try again");
      var keepBtn = make("button", { class: "lme-ai-btn lme-ai-btn-primary", type: "button" }, "Keep");
      cancelBtn.addEventListener("click", close);
      retryBtn.addEventListener("click", showPrompt);
      keepBtn.addEventListener("click", function () {
        // The ONLY place this panel writes to el / state.data.
        if (isHtml) {
          var clean = sanitizeHtml(rewritten);
          el.innerHTML = clean;
          setByPath(state.data, path, clean);
        } else {
          el.textContent = rewritten;
          setByPath(state.data, path, rewritten);
        }
        markDirty();
        close();
        showToast("Rewrite applied · Publish to go live");
      });
      actions.appendChild(cancelBtn);
      actions.appendChild(retryBtn);
      actions.appendChild(keepBtn);

      body.appendChild(nowBlock);
      body.appendChild(proposedBlock);
      body.appendChild(actions);
    }

    function submit(instruction) {
      if (!instruction) return;
      lastInstruction = instruction;
      showLoading();
      var context = (state.data && state.data.title) || "";
      fetch(REWRITE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: original, instruction: instruction, context: context, token: state.token, slug: state.slug }),
      })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, body: j }; });
        })
        .then(function (res) {
          if (closed) return;
          if (res.status !== 200 || !res.body || !res.body.rewritten) {
            showToast("Rewrite failed. Original kept.", true);
            showPrompt();
            return;
          }
          showProposal(res.body.rewritten);
        })
        .catch(function () {
          if (closed) return;
          showToast("Rewrite failed. Original kept.", true);
          showPrompt();
        });
    }

    document.body.appendChild(backdrop);
    showPrompt();
  }

  // ── Field attach ──────────────────────────────────────────────────────
  function attachField(el, path, opts) {
    if (!el) return;
    state.fieldEls.push({ el: el, path: path });
    el.setAttribute("data-lme-field", path);
    if (opts && opts.locked) el.classList.add("lme-field-locked");

    // contenteditable path — for rich HTML editing (guide section bodies).
    // Direct contentEditable on the element, sanitize on blur.
    if (opts && opts.contenteditable) {
      el.contentEditable = "true";
      el.spellcheck = true;
      el.classList.add("lme-field-contenteditable");
      el.addEventListener("focus", function () { el.setAttribute("data-lme-field-editing", "true"); hideAiChipNow(); });
      el.addEventListener("blur", function () {
        el.removeAttribute("data-lme-field-editing");
        var raw = el.innerHTML;
        var clean = sanitizeHtml(raw);
        if (clean !== raw) el.innerHTML = clean;
        setByPath(state.data, path, clean);
        markDirty();
      });
      // Plain-text paste so users don't drop styled HTML from Word/Notion.
      el.addEventListener("paste", function (e) {
        e.preventDefault();
        var text = (e.clipboardData || window.clipboardData).getData("text/plain");
        document.execCommand("insertText", false, text);
      });
      wireAiAffordance(el, path, opts);
      return;
    }

    el.addEventListener("click", function (e) {
      // Don't trigger on nested links/buttons
      if (e.target !== el && (e.target.closest("a") || e.target.closest("button"))) return;
      if (el.hasAttribute("data-lme-field-editing")) return;
      if (opts && opts.locked) { showToast("This field is locked (stable ID)", true); return; }
      e.preventDefault(); e.stopPropagation();
      enterEditField(el, path, opts || {});
    });
    wireAiAffordance(el, path, opts);
  }
  function enterEditField(el, path, opts) {
    var original = el.textContent;
    var useTextarea = opts.multiline || original.length > 80;
    var input = make(useTextarea ? "textarea" : "input", {
      class: useTextarea ? "lme-inline-textarea" : "lme-inline-input",
      type: useTextarea ? undefined : "text",
    });
    input.value = original;
    el.setAttribute("data-lme-field-editing", "true");
    hideAiChipNow();
    el.innerHTML = "";
    el.appendChild(input);
    input.focus();
    if (!useTextarea) input.select();
    function commit() {
      var newVal = input.value;
      el.removeAttribute("data-lme-field-editing");
      el.textContent = newVal;
      if (newVal !== original) {
        setByPath(state.data, path, newVal);
        markDirty();
      }
      input.removeEventListener("blur", commit);
    }
    function cancel() {
      el.removeAttribute("data-lme-field-editing");
      el.textContent = original;
    }
    input.addEventListener("blur", commit);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { cancel(); }
      else if (e.key === "Enter" && !useTextarea) { e.preventDefault(); input.blur(); }
    });
  }

  // ── Array attach ──────────────────────────────────────────────────────
  function attachArray(containerEl, arrayPath, opts) {
    if (!containerEl) return;
    state.arrayEls.push({ el: containerEl, arrayPath: arrayPath });
    containerEl.setAttribute("data-lme-array", arrayPath);
    // Decorate each direct child as a sortable item
    var children = Array.prototype.slice.call(containerEl.children);
    children.forEach(function (child, idx) {
      decorateArrayItem(child, arrayPath, idx);
    });
    // Add "+ Add item" button
    var addBtn = make("button", { class: "lme-add-btn", type: "button" }, "+ Add " + (opts.itemLabel || "item"));
    addBtn.addEventListener("click", function () {
      var arr = getByPath(state.data, arrayPath) || [];
      var template = opts.template ? deepClone(opts.template) : {};
      if (!template.id) template.id = genId();
      arr.push(template);
      setByPath(state.data, arrayPath, arr);
      markDirty();
      showToast("Added — refresh to see new item (Save first)");
    });
    // Insert the +Add button. Engines often call registerArray BEFORE appending
    // the container to DOM, so parentNode may be null on first call. Defer to
    // a microtask in that case so the engine can complete its render first.
    function placeAddBtn() {
      if (containerEl.parentNode) {
        containerEl.parentNode.insertBefore(addBtn, containerEl.nextSibling);
      } else {
        // Not yet in DOM — retry on next animation frame (engine still rendering)
        requestAnimationFrame(placeAddBtn);
      }
    }
    placeAddBtn();
  }
  function decorateArrayItem(itemEl, arrayPath, idx) {
    itemEl.setAttribute("data-lme-array-item", idx);
    itemEl.setAttribute("draggable", "true");
    var handle = make("span", { class: "lme-handle", title: "Drag to reorder" }, "≡");
    var remove = make("button", { class: "lme-remove-btn", type: "button", title: "Remove" }, "×");
    itemEl.appendChild(handle);
    itemEl.appendChild(remove);
    remove.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      if (!confirm("Remove this item?")) return;
      var arr = getByPath(state.data, arrayPath);
      arr.splice(idx, 1);
      setByPath(state.data, arrayPath, arr);
      itemEl.parentNode.removeChild(itemEl);
      markDirty();
      showToast("Removed — refresh after save to renumber");
    });
    // Drag handlers — simple swap-on-drop
    itemEl.addEventListener("dragstart", function (e) {
      e.dataTransfer.setData("text/plain", String(idx));
      e.dataTransfer.effectAllowed = "move";
    });
    itemEl.addEventListener("dragover", function (e) { e.preventDefault(); });
    itemEl.addEventListener("drop", function (e) {
      e.preventDefault();
      var fromIdx = Number(e.dataTransfer.getData("text/plain"));
      if (fromIdx === idx) return;
      var arr = getByPath(state.data, arrayPath);
      var moved = arr.splice(fromIdx, 1)[0];
      arr.splice(idx, 0, moved);
      setByPath(state.data, arrayPath, arr);
      markDirty();
      showToast("Reordered — refresh after save");
    });

    // "+ Add between" button — inserts a new item AFTER this item. The
    // trailing "+ Add item" appended by attachArray covers the end-of-list.
    var between = make("button", { class: "lme-add-btn lme-add-between", type: "button" }, "+ Add between");
    between.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      var arr = getByPath(state.data, arrayPath) || [];
      // Infer template shape from a sibling so insertions match the array's element type.
      var sibling = arr[idx] || arr[idx + 1] || arr[idx - 1] || {};
      var template = { id: genId() };
      Object.keys(sibling).forEach(function (k) {
        if (k === "id") return;
        var v = sibling[k];
        if (typeof v === "string") template[k] = "";
        else if (Array.isArray(v)) template[k] = [];
        else if (v && typeof v === "object") template[k] = {};
        else template[k] = v;
      });
      arr.splice(idx + 1, 0, template);
      setByPath(state.data, arrayPath, arr);
      markDirty();
      showToast("Inserted — save and reload to see new item");
    });
    if (itemEl.parentNode) {
      itemEl.parentNode.insertBefore(between, itemEl.nextSibling);
    }
  }

  // ── Save flow ─────────────────────────────────────────────────────────
  function saveTo(mode) {
    if (!state.dirty && mode === "draft") { showToast("No changes to save"); return; }
    if (mode === "publish" && !confirm("Publish to LIVE? (Bypass draft preview.)")) return;
    showToast("Saving…");
    fetch(EDIT_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: state.token,
        slug: state.slug,
        format: state.format,
        mode: mode,
        data: state.data,
      }),
    })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); })
      .then(function (res) {
        if (res.status >= 400 || !res.body.ok) {
          showToast("Save failed: " + (res.body.error || res.status), true);
          return;
        }
        state.dirty = false;
        updateToolbarLabel();
        var msg = mode === "publish"
          ? "✓ Published · commit " + (res.body.sha || "").slice(0, 7) + " · live in ~30s"
          : "✓ Draft saved · commit " + (res.body.sha || "").slice(0, 7);
        showToast(msg);
        // Optimistic save: the edits are already applied in the DOM, so we do
        // NOT reload. A reload here would re-fetch the pre-commit data.json
        // (GitHub Pages takes ~30s to redeploy) and briefly revert the visible
        // edits. Instead show a transient "syncing" note that clears itself.
        if (mode === "publish") {
          var di = $("#lme-dirty-indicator");
          if (di) {
            var syncMsg = "● syncing · live in ~30s";
            di.textContent = syncMsg;
            di.classList.add("lme-syncing");
            setTimeout(function () {
              if (di.textContent === syncMsg) { di.textContent = ""; di.classList.remove("lme-syncing"); }
            }, 30000);
          }
        }
      })
      .catch(function (err) { showToast("Save error: " + err.message, true); });
  }

  // ── Raw JSON modal (mitigation #7) ────────────────────────────────────
  function openRawJsonModal() {
    var backdrop = make("div", { class: "lme-modal-backdrop" });
    var modal = make("div", { class: "lme-modal" });
    var header = make("div", { class: "lme-modal-header" });
    header.appendChild(make("span", { class: "lme-modal-title" }, "Raw data.json — " + state.slug));
    var closeBtn = make("button", { class: "lme-modal-close", type: "button" }, "×");
    header.appendChild(closeBtn);
    var body = make("div", { class: "lme-modal-body" });

    // Honest scoring warning (mitigation #9) — only for assessment/calculator
    if (state.format === "assessment" || state.format === "calculator") {
      var warn = make("div", { class: "lme-modal-warning" },
        "<strong>Scoring change warning:</strong> Editing this data drives scoring/computed outputs for NEW completions. " +
        "Existing rows in <code>assessment_results</code> / <code>lm_events</code> reflect the previous version's logic. " +
        "<code>data_version</code> will increment on save."
      );
      body.appendChild(warn);
    }

    var textarea = make("textarea", { class: "lme-modal-textarea", spellcheck: "false" });
    textarea.value = JSON.stringify(state.data, null, 2);
    var validation = make("div", { class: "lme-modal-validation" });
    function validate() {
      try {
        var parsed = JSON.parse(textarea.value);
        // Stable ID check (mitigation #3)
        var newIds = collectOriginalIds(parsed);
        var removed = [];
        state.originalIds.forEach(function (id) { if (!newIds.has(id)) removed.push(id); });
        if (removed.length > 0) {
          validation.className = "lme-modal-validation lme-modal-validation-error";
          validation.textContent = "❌ Stable IDs removed or renamed: " + removed.join(", ") +
            "\nIDs are immutable — they're referenced by localStorage, nurture sequences, and analytics rows.";
          saveBtn.disabled = true;
          return null;
        }
        validation.className = "lme-modal-validation lme-modal-validation-ok";
        validation.textContent = "✓ Valid JSON. Stable IDs preserved.";
        saveBtn.disabled = false;
        return parsed;
      } catch (e) {
        validation.className = "lme-modal-validation lme-modal-validation-error";
        validation.textContent = "❌ " + e.message;
        saveBtn.disabled = true;
        return null;
      }
    }
    textarea.addEventListener("input", validate);
    body.appendChild(textarea);
    body.appendChild(validation);

    var footer = make("div", { class: "lme-modal-footer" });
    var cancelBtn = make("button", { class: "lme-toolbar-btn", type: "button" }, "Cancel");
    var draftBtn = make("button", { class: "lme-toolbar-btn", type: "button" }, "Save draft");
    var saveBtn = make("button", { class: "lme-toolbar-btn lme-toolbar-btn-primary", type: "button" }, "Publish");
    cancelBtn.addEventListener("click", function () { document.body.removeChild(backdrop); });
    closeBtn.addEventListener("click", function () { document.body.removeChild(backdrop); });
    draftBtn.addEventListener("click", function () {
      var parsed = validate();
      if (!parsed) return;
      state.data = parsed;
      state.dirty = true;
      document.body.removeChild(backdrop);
      saveTo("draft");
    });
    saveBtn.addEventListener("click", function () {
      var parsed = validate();
      if (!parsed) return;
      state.data = parsed;
      state.dirty = true;
      document.body.removeChild(backdrop);
      saveTo("publish");
    });
    footer.appendChild(cancelBtn);
    footer.appendChild(draftBtn);
    footer.appendChild(saveBtn);
    validate();

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    backdrop.appendChild(modal);
    backdrop.addEventListener("click", function (e) { if (e.target === backdrop) document.body.removeChild(backdrop); });
    document.body.appendChild(backdrop);
    textarea.focus();
  }

  // ── Recent saves panel (mitigation #4) ─────────────────────────────────
  function openSavesPanel() {
    var existing = $(".lme-saves-panel");
    if (existing) { existing.parentNode.removeChild(existing); return; }
    var panel = make("div", { class: "lme-saves-panel" });
    panel.innerHTML = '<div style="padding:12px;font-weight:700;border-bottom:1px solid #eee;">Recent saves for ' + state.slug + ' (last 10)</div><div style="padding:14px;color:#888;">Loading…</div>';
    document.body.appendChild(panel);

    // Query GitHub API for last 10 commits touching this slug
    var path = state.slug + "/data.json";
    fetch(GITHUB_API + "/repos/" + GITHUB_REPO + "/commits?path=" + encodeURIComponent(path) + "&per_page=10")
      .then(function (r) { return r.json(); })
      .then(function (commits) {
        panel.innerHTML = '<div style="padding:12px;font-weight:700;border-bottom:1px solid #eee;">Recent saves for ' + state.slug + ' (last 10)</div>';
        if (!Array.isArray(commits) || commits.length === 0) {
          panel.innerHTML += '<div style="padding:14px;color:#888;">No commits found.</div>';
          return;
        }
        commits.forEach(function (c) {
          var row = make("div", { class: "lme-save-row" });
          var msg = make("div", { class: "lme-save-msg" }, escapeText((c.commit && c.commit.message || "").split("\n")[0]));
          var meta = make("div", { class: "lme-save-meta" }, c.sha.slice(0, 7) + " · " + new Date(c.commit.author.date).toLocaleString());
          var revert = make("button", { class: "lme-revert-btn", type: "button" }, "Revert to this");
          revert.addEventListener("click", function () {
            if (!confirm("Revert " + state.slug + " to commit " + c.sha.slice(0, 7) + "? This creates a NEW commit reverting to that state.")) return;
            fetch(EDIT_WEBHOOK, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                token: state.token,
                slug: state.slug,
                format: state.format,
                mode: "revert",
                revert_to_sha: c.sha,
              }),
            }).then(function (r) { return r.json(); }).then(function (j) {
              if (j.ok) { showToast("Reverted · commit " + (j.sha || "").slice(0, 7)); setTimeout(function () { location.reload(); }, 2500); }
              else showToast("Revert failed: " + (j.error || ""), true);
            });
          });
          row.appendChild(msg); row.appendChild(meta); row.appendChild(revert);
          panel.appendChild(row);
        });
      })
      .catch(function (err) {
        panel.innerHTML += '<div style="padding:14px;color:#C8361B;">Failed to load: ' + escapeText(err.message) + '</div>';
      });
  }
  function escapeText(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  // ── Mount entry point ─────────────────────────────────────────────────
  function mount(opts) {
    state.token = opts.token;
    state.slug = opts.slug;
    state.format = opts.format;
    state.data = deepClone(opts.data || {});
    state.originalData = deepClone(opts.data || {});
    state.originalIds = collectOriginalIds(state.originalData);
    var params = new URLSearchParams(location.search);
    state.isPreviewDraft = params.get("preview") === "draft";
    renderToolbar();
    // Pre-edit snapshot for "restore from session" (mitigation #4 part 2)
    try {
      sessionStorage.setItem("ivan.lm.pre_edit." + state.slug, JSON.stringify(state.originalData));
    } catch (_) {}
    // Guides use contenteditable section bodies — warm DOMPurify so the first
    // blur doesn't drop through the unsafe fallback path.
    if (state.format === "guide") loadPurify();
  }

  // ── Re-render (Task A1) ─────────────────────────────────────────────
  // Re-runs the active engine's render() without a full page reload after a
  // structural edit (array add/remove, AI rewrite). Must clear the field/array
  // buffers first, or re-running render() re-pushes onto them and stale
  // entries (pointing at removed DOM nodes) accumulate. Because edit mode is
  // enabled during a live session, each re-pushed registerField/registerArray
  // auto-attaches on push, so no separate flush pass is needed here.
  function rerender() {
    if (window.LM && window.LM.editMode && window.LM.editMode.resetBuffers)
      window.LM.editMode.resetBuffers();
    if (typeof window.__lm_rerender === "function") window.__lm_rerender();
  }

  // ── Expose API ────────────────────────────────────────────────────────
  window.__LM_EDIT_MODE_LOADED = true;
  window.__LM_EDIT_MODE_API = {
    attachField: attachField,
    attachArray: attachArray,
    mount: mount,
    rerender: rerender,
  };
})();
