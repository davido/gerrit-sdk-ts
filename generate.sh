#!/usr/bin/env bash
# Regenerate the Gerrit TypeScript SDK from the OpenAPI document.
#
#   openapi-generator (typescript-fetch)  ->  no source patching
#
# No generated-code patches: the one Gerrit-specific concern (the )]}' XSSI guard) is
# handled by the hand-written xssi.ts middleware, plugged in via Configuration.middleware
# -- not by editing output. The typescript-fetch generator also maps the case-colliding
# query params O (scalar) / o (array) to distinct params on its own, so unlike the Rust
# SDK there is no query patch.
#
# Usage: ./generate.sh [path-or-url]   (default: ./rest-api-openapi.json)
set -euo pipefail
cd "$(dirname "$0")"
SPEC="${1:-rest-api-openapi.json}"

if [[ "$SPEC" == http://* || "$SPEC" == https://* ]]; then
  echo "0/3 fetch spec from $SPEC"
  curl -fsSL "$SPEC" -o rest-api-openapi.json
  SPEC=rest-api-openapi.json
fi

VERSION=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["info"]["version"])' "$SPEC")

echo "1/3 clean generated sources"
rm -rf src docs

echo "2/3 generate typescript-fetch client (Gerrit $VERSION)"
# package.json / tsconfig / index.ts / xssi.ts are protected by .openapi-generator-ignore.
npx --yes @openapitools/openapi-generator-cli@2.41.0 generate \
  -g typescript-fetch -i "$SPEC" -o . \
  --additional-properties=npmName=gerrit-client,supportsES6=true,typescriptThreePlus=true \
  >/dev/null

echo "3/3 sync version into the hand-written package.json (npm semver == Gerrit version)"
node -e '
const fs = require("fs");
const j = JSON.parse(fs.readFileSync("package.json", "utf8"));
j.version = process.argv[1];
fs.writeFileSync("package.json", JSON.stringify(j, null, 2) + "\n");
' "$VERSION"

echo "done: src/ regenerated from $SPEC; XSSI handled by xssi.ts middleware (no source patch)"
