#!/bin/bash
# Minify LM engine sources for production. Writes .min.js / .min.css NEXT TO
# the source files — sources are NEVER overwritten in place.
#
# Previously this script wrote the minified output BACK to the source path
# (assessment.js, architecture.js, ai-walkthrough.js) then deleted the .bak
# copy. Net effect: a single run silently destroyed the source. Recovered
# via commit aa902ec on 2026-05-17.
#
# Usage: ./minify.sh                    # minify every engine
#        ./minify.sh assessment guide   # minify just these engines
#
# Outputs:
#   _engine/X.js      ← stays the readable, editable source
#   _engine/X.min.js  ← minified output for production over-the-wire
#   _engine/X.css     ← readable source
#   _engine/X.min.css ← minified output

set -euo pipefail
cd "$(dirname "$0")"

# Engines with a .js source that benefit from minification.
ALL_ENGINES=(
  assessment
  assessment-v2
  architecture
  ai-walkthrough
  calculator
  checklist
  guide
  n8n-workflow
  stack-picker
  swipe
  template
  shared
  edit-mode
)

# Allow caller to pass a subset on the command line.
if [ "$#" -gt 0 ]; then
  ENGINES=("$@")
else
  ENGINES=("${ALL_ENGINES[@]}")
fi

minify_one() {
  local name="$1"
  local src_js="${name}.js"
  local src_css="${name}.css"
  local out_js="${name}.min.js"
  local out_css="${name}.min.css"

  # Refuse to operate if it looks like the source has already been minified
  # in place (e.g. starts with `!function` and is single-line / >120 chars
  # on its first line). Prevents re-minifying a destroyed source.
  if [ -f "$src_js" ]; then
    first_line_len=$(head -n 1 "$src_js" | wc -c | tr -d ' ')
    if [ "$first_line_len" -gt 500 ] && head -n 1 "$src_js" | grep -qE '^(!|\(|var |\(function)'; then
      echo "  ✗ $name: source looks already-minified (first line $first_line_len chars). Refusing to minify a minified file. Restore source from git history."
      return 1
    fi
  fi

  if [ ! -f "$src_js" ]; then
    echo "  skip $name (no .js source)"
    return 0
  fi

  # JS via terser. Read SOURCE, write to .min.js. Source untouched.
  npx -y terser "$src_js" -c -m -o "$out_js"
  node --check "$out_js"

  local css_msg=""
  if [ -f "$src_css" ]; then
    npx -y lightningcss-cli --minify -o "$out_css" "$src_css"
    css_msg=", CSS $(wc -c < "$out_css" | tr -d ' ') B"
  fi

  echo "  ✓ $name → $out_js ($(wc -c < "$out_js" | tr -d ' ') B${css_msg})"
}

echo "Minifying ${#ENGINES[@]} engine(s)…"
for engine in "${ENGINES[@]}"; do
  minify_one "$engine" || true
done
echo "Done. Sources untouched. Reference *.min.js / *.min.css from LM pages for production."
