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

echo "4/4 sync the Gerrit version tokens in README (protected by .openapi-generator-ignore)"
# README is NOT rewritten by the generator (.openapi-generator-ignore), so keep its
# Gerrit-version references in step with the spec here. Each substitution is anchored to
# its Gerrit-version context so it can never touch an unrelated version number (the
# openapi-generator-cli pin, package deps, etc.) -- we rewrite only the four known tokens:
#   - the `github:...#v<VER>` install tags
#   - "Generated from Gerrit <VER>"
#   - the tagged **`v<VER>`**
#   - the `<VER>` is valid npm semver note
sed -E -i.bak \
  -e "s|(gerrit-sdk-ts#v)[0-9]+\.[0-9]+\.[0-9]+(-SNAPSHOT)?|\1${VERSION}|g" \
  -e "s|(Gerrit )[0-9]+\.[0-9]+\.[0-9]+(-SNAPSHOT)?|\1${VERSION}|g" \
  -e "s|(tagged \*\*\`v)[0-9]+\.[0-9]+\.[0-9]+(-SNAPSHOT)?|\1${VERSION}|g" \
  -e "s|(\`)[0-9]+\.[0-9]+\.[0-9]+(-SNAPSHOT)?(\` is valid npm semver)|\1${VERSION}\3|g" \
  README.md
rm -f README.md.bak

echo "5/5 sync the surface counts in README (operations / API classes / models)"
# Derived straight from the freshly generated src/: one *Raw method per operation, one
# non-index *.ts per API class and per model. Anchored to the "N operations ... N API
# classes ... N models" phrasing so no unrelated number is touched.
OPS=$(grep -hE '^    async [a-zA-Z]+Raw\(' src/apis/*.ts | wc -l | tr -d ' ')
APIS=$(ls src/apis/*.ts | grep -v '/index\.ts$' | wc -l | tr -d ' ')
MODELS=$(ls src/models/*.ts | grep -v '/index\.ts$' | wc -l | tr -d ' ')
# The models count can wrap to the next line (**279\n  models**), so rewrite the number
# where it sits -- right after "operations** across **N API classes** and **" -- rather
# than anchoring on the word "models". Each count is anchored to its own context.
sed -E -i.bak \
  -e "s|\*\*[0-9]+ operations\*\*|**${OPS} operations**|g" \
  -e "s|\*\*[0-9]+ API classes\*\*|**${APIS} API classes**|g" \
  -e "s|(and )\*\*[0-9]+\$|\1**${MODELS}|g" \
  -e "s|\*\*[0-9]+ models\*\*|**${MODELS} models**|g" \
  README.md
rm -f README.md.bak

echo "done: src/ regenerated from $SPEC; XSSI handled by xssi.ts middleware (no source patch)"
