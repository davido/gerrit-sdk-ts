# gerrit-sdk-ts

A **generated TypeScript SDK** for the Gerrit Code Review REST API (the `gerrit-client`
npm package), produced from Gerrit's statically generated **OpenAPI 3.1** document. No
hand-written request/response types: every operation and model comes from the spec, so
the client never drifts from the server.

## The pipeline (end to end)

```
  gerrit                     gerrit-sdk-ts                  examples/
  (emit the spec)      -->    (this repo: the SDK)    -->    (consume the SDK)
  parse-only OpenAPI          openapi-generator              tsx, live calls,
  emitter                     (typescript-fetch) + XSSI mw   colored output
```

1. **gerrit emits the spec.** A parse-only emitter reads the server's REST bindings via
   the javac Compiler Tree API — no running server, no reflection — and writes an
   OpenAPI 3.1 JSON.
2. **This repo pins that spec.** `rest-api-openapi.json` is a checked-in snapshot.
3. **`generate.sh` generates the client.** openapi-generator (`typescript-fetch`) turns
   the spec into `src/`.
4. **A consumer reuses it by tag.** `npm install "github:davido/gerrit-sdk-ts#v3.15.0-SNAPSHOT"`,
   or run the bundled example — see [Use it](#use-it).

Demonstrates feasibility for Gerrit issue
[40011133](https://issues.gerritcodereview.com/issues/40011133).

## Version

Generated from **Gerrit 3.15.0-SNAPSHOT** and tagged **`v3.15.0-SNAPSHOT`** — the tag
mirrors the Gerrit version, and `3.15.0-SNAPSHOT` is valid npm semver, so the package
version matches it directly (no PEP 440 munging or `/vN` suffix like Python/Go).

## What's in this repo

- `src/` — the generated client: **341 operations** across **7 API classes** and **277
  models**, over the native `fetch` API (no runtime dependencies).
- `xssi.ts` — a hand-written `Middleware` that strips Gerrit's `)]}'` XSSI guard (the one
  Gerrit-specific step; see below). It lives outside the generated `src/`, so
  regeneration never touches it; `index.ts` re-exports it.
- `examples/get-change-detail.ts` — a runnable example: an anonymous `GET /changes/{id}`
  rendered as a colored, Web-UI-style summary using Gerrit's own palette.
- `rest-api-openapi.json`, `generate.sh` — the pinned spec and the generation script.

## Regenerate

```bash
./generate.sh [path-or-url]      # default: ./rest-api-openapi.json
```

The package version is synced from the spec's `info.version`.

## The Gerrit-specific handling

The spec is consumed as-is, and **no generated code is patched**:

- **XSSI guard** — every Gerrit JSON body starts with `)]}'` on its own line, which is not
  valid JSON and not expressible in OpenAPI. `gerritXssiMiddleware` (a typescript-fetch
  `Middleware`) strips it in a `post` hook; register it via
  `new Configuration({ middleware: [gerritXssiMiddleware] })`. (Unlike Rust's blocking
  reqwest, typescript-fetch exposes a response hook, so no source edit is needed.)

The case-colliding `O`/`o` query params and the enums are handled correctly by the
generator on its own — no query patch (unlike Rust) and no enum flag (unlike Go).

## Build & test

```bash
npm install
npm run build      # tsc -> dist/
npm test           # unit tests (the XSSI strip)
```

## Use it

### Run the example — local, no publish needed

```bash
npm install
npx tsx examples/get-change-detail.ts --change 622261
```

### From GitHub — after publishing

`npm install` the SDK straight from the tag (npm builds it via the `prepare` script):

```bash
npm install "github:davido/gerrit-sdk-ts#v3.15.0-SNAPSHOT"
```

```ts
import { ChangesApi, Configuration, gerritXssiMiddleware } from 'gerrit-client';

const api = new ChangesApi(new Configuration({
  basePath: 'https://gerrit-review.googlesource.com',
  middleware: [gerritXssiMiddleware],   // strips the )]}' guard
}));
const change = await api.getChangesChangeId({ changeId: '621763', o2: ['LABELS'] });
console.log(change.subject);
```

## License

Apache 2.0. See [LICENSE.txt](LICENSE.txt).
