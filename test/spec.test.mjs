import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSpec, SPEC_VERSION } from "../src/spec.mjs";

const minimal = () => ({
  dataplaner: SPEC_VERSION,
  collections: [{ name: "a", fields: [{ name: "id", type: "text", key: true, required: true }] }],
});

test("rejects a spec from a version it cannot read", () => {
  assert.throws(() => normalizeSpec({ ...minimal(), dataplaner: 2 }), /unsupported version 2/);
  assert.throws(() => normalizeSpec({ collections: [] }), /unsupported version undefined/);
});

test("rejects a link to a collection that is not in the spec", () => {
  const spec = { ...minimal(), links: [{ from: "a", to: "ghost" }] };
  assert.throws(() => normalizeSpec(spec), /unknown collection "ghost"/);
});

test("rejects anything without a name, naming where it was", () => {
  assert.throws(() => normalizeSpec({ ...minimal(), collections: [{ fields: [] }] }), /no name/);
  assert.throws(
    () => normalizeSpec({ ...minimal(), collections: [{ name: "a", fields: [{ type: "text" }] }] }),
    /collection "a" has a field without a name/
  );
});

test("fills in the text the emitter left out", () => {
  const spec = normalizeSpec(minimal());
  assert.equal(spec.title, "Data model");
  assert.equal(spec.collectionsLabel, "Collections");
  assert.equal(spec.operationsLabel, "Operations");
  assert.deepEqual(spec.links, []);
  assert.deepEqual(spec.groups, []);
});

test("flags default to false rather than undefined", () => {
  const [field] = normalizeSpec({
    ...minimal(),
    collections: [{ name: "a", fields: [{ name: "x" }] }],
  }).collections[0].fields;
  assert.deepEqual(field, {
    name: "x", type: "", key: false, required: false, document: false, why: "", usedBy: [],
  });
});

test("a column keeps the case made for it, and says so when there is none", () => {
  const [justified, bare] = normalizeSpec({
    ...minimal(),
    collections: [
      {
        name: "a",
        fields: [
          { name: "id", why: "Addresses one row.", usedBy: ["SHP-CUS-01", "SHP-ORD-02"] },
          { name: "x" },
        ],
      },
    ],
  }).collections[0].fields;
  assert.equal(justified.why, "Addresses one row.");
  assert.deepEqual(justified.usedBy, ["SHP-CUS-01", "SHP-ORD-02"]);
  // Not defaulted to anything reassuring: an empty case is what the page reports as work.
  assert.equal(bare.why, "");
  assert.deepEqual(bare.usedBy, []);
});
