import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSpec, SPEC_VERSION } from "../src/spec.mjs";

const minimal = () => ({
  schemacase: SPEC_VERSION,
  collections: [{ name: "a", fields: [{ name: "id", type: "text", key: true, required: true }] }],
});

test("rejects a spec from a version it cannot read", () => {
  assert.throws(() => normalizeSpec({ ...minimal(), schemacase: 2 }), /unsupported version 2/);
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

describe("fieldNotes", () => {
  const withNotes = (fieldNotes, fields = [{ name: "tenant_id" }, { name: "status" }]) =>
    normalizeSpec({
      ...minimal(),
      fieldNotes,
      collections: [
        { name: "orders", fields },
        { name: "invoices", fields: [{ name: "tenant_id" }, { name: "status" }] },
      ],
    });
  const field = (spec, collection, name) =>
    spec.collections.find((c) => c.name === collection).fields.find((f) => f.name === name);

  test("a wildcard note states the reason once for every collection with the column", () => {
    const spec = withNotes({ "*.tenant_id": { why: "Scopes the row to one shop.", usedBy: ["SHP-TEN-01"] } });
    for (const name of ["orders", "invoices"]) {
      assert.equal(field(spec, name, "tenant_id").why, "Scopes the row to one shop.");
      assert.deepEqual(field(spec, name, "tenant_id").usedBy, ["SHP-TEN-01"]);
    }
    assert.equal(field(spec, "orders", "status").why, "", "other columns are left alone");
  });

  test("an exact key wins over the wildcard", () => {
    const spec = withNotes({
      "*.status": { why: "Generic lifecycle." },
      "orders.status": { why: "Where the parcel is." },
    });
    assert.equal(field(spec, "orders", "status").why, "Where the parcel is.");
    assert.equal(field(spec, "invoices", "status").why, "Generic lifecycle.");
  });

  test("what the field says itself wins over any note", () => {
    const spec = withNotes({ "orders.status": { why: "From the note.", usedBy: ["N-1"] } }, [
      { name: "status", why: "From the field.", usedBy: ["F-1"] },
    ]);
    assert.equal(field(spec, "orders", "status").why, "From the field.");
    assert.deepEqual(field(spec, "orders", "status").usedBy, ["F-1"]);
  });

  test("a note fills in only what the field leaves empty", () => {
    // Importers write "why": "" and "usedBy": [] on every column; that is "not yet", not "none".
    const spec = withNotes({ "orders.status": { why: "From the note.", usedBy: ["N-1"] } }, [
      { name: "status", why: "", usedBy: [] },
      { name: "tenant_id", why: "Own reason." },
    ]);
    assert.equal(field(spec, "orders", "status").why, "From the note.");
    assert.deepEqual(field(spec, "orders", "status").usedBy, ["N-1"]);
    const partial = withNotes({ "orders.tenant_id": { usedBy: ["N-2"] } }, [{ name: "tenant_id", why: "Own reason." }]);
    assert.equal(field(partial, "orders", "tenant_id").why, "Own reason.");
    assert.deepEqual(field(partial, "orders", "tenant_id").usedBy, ["N-2"]);
  });

  test("a note for a column nobody has is ignored", () => {
    const spec = withNotes({ "*.ghost": { why: "Nothing." } });
    assert.equal(spec.collections.flatMap((c) => c.fields).some((f) => f.why), false);
  });

  test("rejects fieldNotes that are not a keyed object", () => {
    assert.throws(() => normalizeSpec({ ...minimal(), fieldNotes: [] }), /"fieldNotes" must be an object/);
  });
});
