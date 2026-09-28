# dataplaner

Turns a **data-model spec** into one self-contained HTML page: a single diagram of the whole
model — every store with every column, the operations that reach them, the systems around them,
and the data crossing between — that you can pan, zoom and click through.

This repository holds the renderer and nothing else. It has no database driver, no server client
and no knowledge of any particular project; everything it draws arrives in a single JSON file,
the same way a renderer for an OpenAPI document only ever sees the document. The spec lives in
the project it describes, the picture is made here.

```
project (owns the data)          dataplaner (owns the picture)
  introspect  ──►  model.json  ──►  render  ──►  model.html
```

## Use

```bash
node path/to/dataplaner/src/cli.mjs docs/model.json            # writes docs/model.html
node path/to/dataplaner/src/cli.mjs docs/model.json -o out.html
node path/to/dataplaner/src/cli.mjs docs/model.json --proposal docs/proposed.json
```

Not published to a registry, so there is no `npx dataplaner` — point node at the checkout, or
`npm link` it once if you use it daily.

Or as a library — note it is async, because Graphviz lays the diagram out while the page is
built rather than in the reader's browser:

```js
import { renderHtml } from "dataplaner";
writeFileSync("model.html", await renderHtml(JSON.parse(readFileSync("model.json", "utf8"))));
```

See [`example/shop.json`](example/shop.json) for a complete spec, and `pnpm example` to render it.

## The page

The page *is* the diagram: it fills the window, and everything else is chrome. Drag to pan, the
wheel zooms, and the rail on the left flies to an area or a system. Clicking a store, an
operation or a system opens it in the panel beside the canvas; a store's relationships are
clickable there too, so you can walk the model without hunting for the next box.

Relationships are drawn column to column — a foreign key runs from the column that holds it to
the column it references, with crow's foot at the many end and a bar, or a circle for "may be
absent", at the one end.

Graphviz does the layout when the page is written, so the output carries a finished picture
rather than a layout engine: a few hundred KB, and no network at any point.

## The spec

One JSON object. `dataplaner: 1` is the version and is required; everything else is optional and
falls back to a neutral default, so a spec can start small and grow.

| key | what it is |
|---|---|
| `title` | the window's name and the first line of the rail |
| `collectionsLabel`, `operationsLabel` | what you call the two kinds of thing — *tables*, *endpoints*, whatever fits |
| `collections[]` | `{ name, fields: [{ name, type, key, required, document, why, usedBy }] }` |
| `links[]` | `{ from, to, via, strong, optional }` — `via` names the foreign-key columns, `strong` means the child does not outlive its parent, `optional` that it may exist without one |
| `operations[]` | `{ name, summary, inputs: [{ name, type, required }] }` |
| `groups[]` | `{ name, blurb, collections: [], operations: [] }` — the editorial grouping |
| `systems[]` | `{ name, kind, blurb }` — `kind` is `external`, `internal` or `store` |
| `flows[]` | `{ from, to, label }` — either end may name a system, a group or a single collection |

`groups` becomes the areas on the canvas. A collection nobody groups is still drawn, in an area
of its own called out as unplaced — grouping is a judgement, and the page says when one is
missing rather than hiding the table.

`systems` and `flows` are the half nothing can introspect: a database cannot say who calls it.
They are written by hand, and they are what turns a schema picture into a system picture.

### The case for a column

`why` and `usedBy` on a field are the case for it existing: why the value is kept at all and in
this shape, and which requirement needs it. Neither is defaulted to anything reassuring — a column
with neither is marked `?` on the canvas, says so in the panel, and is counted in the rail. That
count is the work list. A schema nobody can justify column by column is a schema nobody decided.

A spec that cannot be drawn is rejected with the reason (`unknown collection "x"`,
`unsupported version 2`) rather than rendered half-way.

### Vocabulary

*Collection*, *field*, *link*, *operation*, *group*, *system*, *flow* — deliberately domain-free.
A collection is often a database table and an operation often an API endpoint, but nothing here
assumes it, which is what lets one renderer serve several projects. Use `collectionsLabel` /
`operationsLabel` to put your own words on the page.

## Reviewing a proposed change

Pass a second spec with `--proposal` and the page gains a **Proposals** button in the rail. The
second file carries a `changes` list — one entry per decision, each with an id, a title, why, and
the collections, fields and operations it touches:

```json
{
  "dataplaner": 1,
  "changes": [
    {
      "id": "P1",
      "title": "Provenance as columns",
      "why": "The same stamp in nine places, and the time inside it is already a column.",
      "cost": "A migration across five tables.",
      "affects": { "collections": ["bugs"], "fields": ["bugs.created_by", "bugs.created_by_type"] }
    }
  ],
  "collections": [ "…the proposed model…" ]
}
```

The change list is authored; the before-and-after under each card is computed by diffing the two
specs. Anything in that diff no card accounts for is printed as **Unaccounted for**, so a
proposal cannot carry along what nobody agreed to. A change that lists fields must list the ones
it *adds* as well as the ones it removes — otherwise its card shows deletions only and reads as
data loss.

## Develop

```bash
pnpm install
pnpm quicktest     # lint + tests, a few seconds
pnpm example       # render example/shop.json
```
