import { test } from "node:test";
import assert from "node:assert/strict";
import Ajv from "ajv/dist/2020.js";
import { importPrisma } from "../src/import/prisma.mjs";
import { rowsToSpec } from "../src/import/postgres.mjs";
import { read, readJson } from "./helpers.mjs";

const validate = new Ajv({ allErrors: true }).compile(readJson("../schema/schemacase.schema.json"));
const check = (spec) => (validate(spec) ? [] : validate.errors.map((e) => `${e.instancePath} ${e.message}`));

test("the example, its proposal and the test fixture pass the published JSON Schema", () => {
  for (const file of ["../example/shop.json", "../example/proposed.json", "./fixtures/shop.json"]) {
    assert.deepEqual(check(readJson(file)), [], file);
  }
});

test("what the importers write passes it too", () => {
  const prisma = importPrisma(read("./fixtures/shop.prisma"));
  assert.deepEqual(check(prisma), []);
  const pg = rowsToSpec({
    columns: [{ table_name: "t", column_name: "id", data_type: "jsonb", udt_name: "jsonb", is_nullable: "NO" }],
    constraints: [],
  });
  assert.deepEqual(check(pg), []);
});

test("a proposal with changes and field notes passes", () => {
  const spec = {
    ...readJson("./fixtures/shop.json"),
    fieldNotes: { "*.id": { why: "Addresses one row." }, "orders.shipping": { usedBy: ["SHP-ORD-04"] } },
    changes: [{ id: "P1", title: "t", why: "w", cost: "c", affects: { collections: ["orders"], fields: ["orders.x"] } }],
  };
  assert.deepEqual(check(spec), []);
});

test("it catches what the renderer would reject or silently ignore", () => {
  const base = readJson("./fixtures/shop.json");
  assert.notDeepEqual(check({ ...base, schemacase: 2 }), [], "wrong version");
  assert.notDeepEqual(check({ ...base, fieldNotes: { status: { why: "x" } } }), [], "note key without a dot");
  const typo = structuredClone(base);
  typo.collections[0].fields[0].usedby = ["x"];
  assert.notDeepEqual(check(typo), [], "a misspelled key is not quietly dropped");
});
