# Contributing

Thanks for looking. Issues and pull requests are welcome. For anything larger than a fix, open an
issue first so we can agree on the shape before you write it.

## Setup

Node 22 or later, and pnpm (the version is pinned in `package.json`; `corepack enable` picks it up).

```bash
pnpm install
pnpm quicktest     # lint + tests, a few seconds
pnpm example       # render example/shop.json to example/shop.html
```

The Postgres importer has one test against a live database, skipped unless
`SCHEMACASE_TEST_PG` holds a connection string. CI runs it against a Postgres service.

## How the code is written

- Plain ESM `.mjs`, no build step, no TypeScript. JSDoc where a type helps the reader.
- Few dependencies. Runtime dependencies need a good reason; the renderer has two.
- Tests use `node:test` and `node:assert/strict`, one file per area in `test/`.
- Comments say *why*, not what. Test names state the behaviour they protect.
- ESLint enforces the limits (function length, complexity); `pnpm lint` must pass with no warnings.

## Pull requests

- One topic per pull request. Add a test for any behaviour you change.
- Update `README.md` for anything user-visible, and add a line under *Unreleased* in `CHANGELOG.md`.
- Changes to the spec format also update `schema/schemacase.schema.json`.

## Releasing (maintainers)

1. Move *Unreleased* in `CHANGELOG.md` to the new version, and bump `version` in `package.json`.
2. Commit, tag `vX.Y.Z`, push the tag. The release workflow tests, publishes to npm with
   provenance, and moves the `vX` tag the GitHub Action is used by.
