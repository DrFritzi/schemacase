import { test } from "node:test";
import assert from "node:assert/strict";
import { renderHtml } from "../src/render.mjs";
import { normalizeSpec, countUnjustified } from "../src/spec.mjs";
import { diffSpecs, unaccounted } from "../src/diff.mjs";
import { readJson } from "./helpers.mjs";

// The example is the live demo and the README's screenshot, so it has to keep showing what the
// tool is for: a work list, notes stated once, a proposal with something nobody asked for.
const shop = () => readJson("../example/shop.json");
const proposed = () => readJson("../example/proposed.json");

test("the demo shows a work list, not a clean bill of health", () => {
  const spec = normalizeSpec(shop());
  const columns = spec.collections.flatMap((c) => c.fields);
  const bare = countUnjustified(spec);
  assert.ok(bare >= 5, `only ${bare} unexplained columns`);
  assert.ok(bare < columns.length / 2, "and most columns are explained");
  assert.ok(columns.some((f) => f.document), "a document column");
});

test("the demo states structural columns once, in fieldNotes", () => {
  const raw = shop();
  assert.ok(Object.keys(raw.fieldNotes).some((k) => k.startsWith("*.")), "a wildcard note");
  assert.ok(Object.keys(raw.fieldNotes).some((k) => !k.startsWith("*.")), "an exact note");
  const orders = normalizeSpec(raw).collections.find((c) => c.name === "orders");
  const id = orders.fields.find((f) => f.name === "id");
  assert.ok(id.why && id.usedBy.length, "orders.id got its case from the note");
  assert.equal(raw.collections.find((c) => c.name === "orders").fields.find((f) => f.name === "id").why, undefined);
});

test("the demo uses every kind of thing the page can draw", () => {
  const spec = normalizeSpec(shop());
  assert.deepEqual([...new Set(spec.systems.map((s) => s.kind))].sort(), ["external", "internal", "store"]);
  assert.ok(spec.links.some((l) => l.strong) && spec.links.some((l) => l.optional));
  assert.ok(spec.operations.some((o) => o.inputs.length) && spec.flows.length && spec.groups.length);
});

test("everything the demo refers to exists, so nothing is silently left out", async () => {
  const spec = normalizeSpec(shop());
  const names = new Set([
    ...spec.collections.map((c) => c.name),
    ...spec.systems.map((s) => s.name),
    ...spec.groups.map((g) => g.name),
  ]);
  // The renderer skips a flow whose end it cannot find, so a typo would only show as a gap.
  for (const flow of spec.flows) {
    assert.ok(names.has(flow.from) && names.has(flow.to), `flow ${flow.from} -> ${flow.to}`);
  }
  const placed = spec.groups.flatMap((g) => g.collections);
  assert.deepEqual([...placed].sort(), spec.collections.map((c) => c.name).sort(), "every table is grouped once");
  const html = await renderHtml(shop(), proposed());
  assert.equal(html.includes("Unplaced"), false);
  assert.equal(html.includes("Named but not present"), false);
});

test("the demo's proposal is reviewable and leaves exactly one column unaccounted for", async () => {
  const diff = diffSpecs(normalizeSpec(shop()), normalizeSpec(proposed()));
  assert.deepEqual(unaccounted(diff, proposed().changes), ["added field products.weight_grams"]);
  const html = await renderHtml(shop(), proposed());
  assert.match(html, /Unaccounted for:/);
  const card = (id) => html.split(`id="${id}"`)[1].split("</article>")[0];
  assert.equal(card("P1").includes("relationship"), false, "P1 only drops a column");
  assert.match(card("P2"), /addresses → orders/, "P2 owns the relationship it replaces");
  assert.match(card("P3"), /customers\.legacy_id/);
});
