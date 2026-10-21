#!/usr/bin/env bash
# Adjusts a Playwright HTML report for our docs hosting. Usage: patch_trace_viewer.sh <playwright-report dir>
set -e

REPORT_DIR="$1"

# The report and trace viewer keep their theme in localStorage under "theme", which the docs
# host also uses (with values like "dark") and breaks their styling. Use our own key and
# default to light mode.
sed -i -E 's/([A-Za-z0-9_$]+)=(["`])system\2,([A-Za-z0-9_$]+)=(["`])theme\4/\1=\2light-mode\2,\3=\4playwright-report-theme\4/' \
  "$REPORT_DIR/index.html" "$REPORT_DIR"/trace/assets/*.js 2> /dev/null || true
grep -qE '["`]playwright-report-theme["`]' "$REPORT_DIR/index.html"

# The trace viewer serves trace data through a service worker. The docs hosting requires
# Cross-Origin-Embedder-Policy on these responses, so wrap the worker's fetch handler to add it.
TARGET_FILE="$REPORT_DIR/trace/sw.bundle.js"
# Trace viewer is only bundled when some test kept a trace
[ -f "$TARGET_FILE" ] || exit 0

grep -q '\.respondWith(' "$TARGET_FILE"
sed -i -E 's/\.respondWith\(([A-Za-z_$]+\([A-Za-z_$]+\))\)/.respondWith(addCoep(\1))/' "$TARGET_FILE"
cat >> "$TARGET_FILE" << 'EOF'

async function addCoep(response) {
  response = await response;
  if (response.type === 'opaque') return response;
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  return new Response(await response.blob(), { status: response.status, statusText: response.statusText, headers });
}
EOF
echo "Patched $REPORT_DIR"
