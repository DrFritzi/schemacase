# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/). Before 1.0, a minor version may change the spec format.

## [Unreleased]

### Fixed

- A `</script>` inside any spec text (a column's `why`, a system's blurb, …) ended the page script early and ran the rest as markup. The embedded spec is now escaped so it cannot leave its script element.

## [0.1.0]

First public release.

### Added

- `schemacase <spec.json>`: renders a data-model spec as one self-contained HTML page (Graphviz
  layout at build time, pan and zoom, column-to-column foreign keys, systems and flows).
- `why` and `usedBy` on every column. Columns with neither are counted as unjustified: the work list.
- `fieldNotes`: state a column's case once, keyed `collection.field` or `*.field`.
- `--proposal`: review a proposed model as authored change cards, with anything no card accounts
  for listed as *Unaccounted for*.
- `schemacase diff`: the same review as Markdown, and a GitHub Action that posts it on pull requests.
- `schemacase import postgres` and `schemacase import prisma`: start a spec from an existing schema.
- A JSON Schema for the spec format, `schema/schemacase.schema.json`.

[Unreleased]: https://github.com/DrFritzi/schemacase/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/DrFritzi/schemacase/releases/tag/v0.1.0
