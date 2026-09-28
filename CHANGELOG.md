# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/). Before 1.0, a minor version may change the spec format.

## [Unreleased]

### Changed

- Pan and zoom are built in instead of coming from the `svg-pan-zoom` library. Pages are about 40% smaller (70 KB to 42 KB) and the package has one runtime dependency, Graphviz. Wheel, drag, pinch, the zoom buttons and the rail behave as before; the view now also follows the canvas when the detail panel opens or closes.
- Flows are drawn without taking part in the layout, which is left to the foreign keys.
- The command line rejects a flag it does not know instead of taking it for a file name.
- The example is a larger webshop with a proposal, and is what the live demo shows. The small one the tests used lives in `test/fixtures`.

### Fixed

- A column without a `type` made Graphviz reject the whole table, so it silently vanished from the diagram. `type` is optional in the format; importers always set it, which is why this went unseen.
- Only the text and borders of a table were clickable; a click in the middle of a cell fell through to the area behind it.
- A table clicked near the edge is brought into view instead of ending up behind the detail panel.
- A proposal card listed a removed relationship that belonged to another change. A change that lists columns now owns a relationship through its foreign-key column only.

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
