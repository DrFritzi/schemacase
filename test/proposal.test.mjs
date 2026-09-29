import { test } from "node:test";
import assert from "node:assert/strict";
import { renderHtml } from "../src/render.mjs";
import { diffSpecs, unaccounted } from "../src/diff.mjs";
import { normalizeSpec } from "../src/spec.mjs";
import { shop } from "./helpers.mjs";

/** Swap a document field for two scalars, the shape most proposals take. */
function proposeShop() {
  const proposed = shop();
  const orders = proposed.collections.find((c) => c.name === "orders");
  orders.fields = orders.fields.filter((f) => f.name !== "shipping");
  orders.fields.push({ name: "ship_to", type: "text", required: true });
  return {
    ...proposed,
    changes: [
      {
        id: "P1",
        title: "Shipping address as a column",
        why: "A document holding exactly one field.",
        affects: { collections: ["orders"] },
      },
    ],
  };
}

test("a diff names what changed and leaves the rest alone", async () => {
  const d = diffSpecs(normalizeSpec(shop()), normalizeSpec(proposeShop()));
  assert.equal(d.collections.length, 1);
  assert.equal(d.collections[0].name, "orders");
  const byName = new Map(d.collections[0].fields.map((f) => [f.name, f.status]));
  assert.equal(byName.get("shipping"), "removed");
  assert.equal(byName.get("ship_to"), "added");
  assert.equal(byName.has("id"), false, "untouched fields must not appear");
  assert.equal(d.operations.length, 0);
});

test("a change that touches nothing anyone declared is reported, not smuggled", async () => {
  const d = diffSpecs(normalizeSpec(shop()), normalizeSpec(proposeShop()));
  assert.deepEqual(unaccounted(d, [{ affects: { collections: ["orders"] } }]), []);
  assert.deepEqual(unaccounted(d, [{ affects: {} }]), [
    "removed field orders.shipping",
    "added field orders.ship_to",
  ]);
});

test("the page carries the proposal with an id you can answer", async () => {
  const html = await renderHtml(shop(), proposeShop());
  assert.match(html, /Proposals/);
  assert.match(html, /id="P1"/);
  assert.match(html, /Shipping address as a column/);
  assert.match(html, /ship_to/);
});

test("without a proposal there is nothing to open", async () => {
  // The viewer script always carries the word; what must be absent is the way in.
  const html = await renderHtml(shop());
  assert.equal(html.includes('id="show-proposals"'), false);
  assert.equal(html.includes('id="proposals-source"'), false);
  assert.match(await renderHtml(shop(), proposeShop()), /id="show-proposals"/);
});

test("a change that lists fields must list the ones it adds", async () => {
  // The replacement columns have new names, so they cannot appear in a list derived from the
  // current model. Forgetting them once made the card show removals only, reading as data loss.
  const forgot = {
    id: "P1",
    title: "Shipping address as a column",
    affects: { collections: ["orders"], fields: ["orders.shipping"] },
  };
  const diff = diffSpecs(normalizeSpec(shop()), normalizeSpec(proposeShop()));
  assert.deepEqual(unaccounted(diff, [forgot]), ["added field orders.ship_to"]);

  const complete = { ...forgot, affects: { ...forgot.affects, fields: ["orders.shipping", "orders.ship_to"] } };
  assert.deepEqual(unaccounted(diff, [complete]), []);
  const page = await renderHtml(shop(), { ...proposeShop(), changes: [complete] });
  const card = page.split('id="P1"')[1].split("</article>")[0];
  assert.match(card, /shipping/, "the removed column belongs on the card");
  assert.match(card, /ship_to/, "so does the column that replaces it");
});

test("two changes touching one collection do not show each other's rows", async () => {
  const proposed = proposeShop();
  const products = proposed.collections.find((c) => c.name === "products");
  products.fields = products.fields.filter((f) => f.name !== "cents");
  products.fields.push({ name: "price_cents", type: "integer", required: true });
  const changes = [
    { id: "P1", title: "Shipping", affects: { collections: ["orders"], fields: ["orders.shipping", "orders.ship_to"] } },
    { id: "P2", title: "Price", affects: { collections: ["products"], fields: ["products.cents", "products.price_cents"] } },
  ];
  const html = await renderHtml(shop(), { ...proposed, changes });
  const card = (id) => html.split(`id="${id}"`)[1].split("</article>")[0];
  assert.equal(card("P1").includes("price_cents"), false, "P1 must not show P2's rows");
  assert.equal(card("P2").includes("ship_to"), false, "P2 must not show P1's rows");
});

test("field notes justify the proposed model too", async () => {
  const proposed = proposeShop();
  proposed.fieldNotes = { "orders.ship_to": { why: "One line on the delivery note." } };
  const spec = normalizeSpec(proposed);
  const shipTo = spec.collections.find((c) => c.name === "orders").fields.find((f) => f.name === "ship_to");
  assert.equal(shipTo.why, "One line on the delivery note.");
});
