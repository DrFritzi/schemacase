import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importPrisma } from "../src/import/prisma.mjs";
import { importPostgres, rowsToSpec } from "../src/import/postgres.mjs";
import { normalizeSpec } from "../src/spec.mjs";
import { parseImportArgs } from "../src/cli.mjs";

const prisma = () =>
  importPrisma(readFileSync(new URL("./fixtures/shop.prisma", import.meta.url), "utf8"));
const fields = (spec, name) =>
  Object.fromEntries(spec.collections.find((c) => c.name === name).fields.map((f) => [f.name, f]));

test("prisma: models become collections, scalar fields become columns", () => {
  const spec = prisma();
  assert.deepEqual(spec.collections.map((c) => c.name), ["Customer", "Product", "Order", "OrderItem"]);
  const customer = fields(spec, "Customer");
  assert.deepEqual(Object.keys(customer), ["id", "email", "name", "prefs"], "relation fields are not columns");
  assert.equal(customer.id.key, true);
  assert.equal(customer.id.required, true);
  assert.equal(customer.prefs.required, false);
  assert.equal(customer.prefs.document, true, "Json is a document");
  assert.equal(fields(spec, "Order").shipping.document, true, "so is a composite type");
  assert.equal(fields(spec, "Order").state.type, "OrderState");
  assert.equal(fields(spec, "Product").tags.type, "String[]");
  assert.equal(fields(spec, "Product").geo.type, "point");
});

test("prisma: the side holding the foreign key becomes a link from parent to child", () => {
  assert.deepEqual(prisma().links, [
    { from: "Customer", to: "Order", via: "customerId", strong: true, optional: false },
    { from: "Order", to: "OrderItem", via: "orderId", strong: true, optional: false },
    { from: "Product", to: "OrderItem", via: "sku", strong: false, optional: true },
  ]);
});

test("prisma: a composite primary key marks each of its columns", () => {
  const item = fields(prisma(), "OrderItem");
  assert.equal(item.orderId.key, true);
  assert.equal(item.sku.key, true);
  assert.equal(item.qty.key, false);
});

test("every imported column starts unjustified, and the result is a valid spec", () => {
  for (const spec of [prisma(), rowsToSpec(catalogue())]) {
    const all = spec.collections.flatMap((c) => c.fields);
    assert.ok(all.every((f) => f.why === "" && f.usedBy.length === 0), "the work list is the point");
    assert.doesNotThrow(() => normalizeSpec(spec));
  }
});

test("prisma: a file without models is refused", () => {
  assert.throws(() => importPrisma("enum A { B }"), /no models found/);
});

/** What the two catalogue queries return for a two-table shop. */
function catalogue() {
  const col = (table_name, column_name, data_type, is_nullable = "NO", udt_name = data_type) =>
    ({ table_name, column_name, data_type, udt_name, is_nullable });
  return {
    columns: [
      col("customers", "id", "uuid"),
      col("customers", "prefs", "jsonb", "YES"),
      col("orders", "id", "uuid"),
      col("orders", "customer_id", "uuid", "YES"),
      col("orders", "state", "USER-DEFINED", "NO", "order_state"),
      col("orders", "tags", "ARRAY", "NO", "_text"),
      col("orders", "audit_id", "integer", "YES"),
    ],
    constraints: [
      { kind: "p", table_name: "customers", columns: ["id"] },
      { kind: "p", table_name: "orders", columns: ["id"] },
      { kind: "f", table_name: "orders", columns: ["customer_id"], ref_table: "customers", ref_schema: "public", on_delete: "c" },
      { kind: "f", table_name: "orders", columns: ["audit_id"], ref_table: "audit", ref_schema: "other", on_delete: "a" },
    ],
  };
}

test("postgres: catalogue rows become collections, keys and links", () => {
  const spec = rowsToSpec(catalogue());
  const orders = fields(spec, "orders");
  assert.equal(orders.id.key, true);
  assert.equal(orders.customer_id.required, false);
  assert.equal(orders.state.type, "order_state", "an enum keeps its own name");
  assert.equal(orders.tags.type, "text[]");
  assert.equal(fields(spec, "customers").prefs.document, true, "jsonb is a document");
  // A nullable foreign key may be absent; a cascading one means the child does not outlive it.
  // The key into another schema is left out, since that table is not in the spec.
  assert.deepEqual(spec.links, [
    { from: "customers", to: "orders", via: "customer_id", strong: true, optional: true },
  ]);
});

test("postgres: a composite foreign key keeps its columns in key order", () => {
  const col = (table_name, column_name, is_nullable = "NO") =>
    ({ table_name, column_name, data_type: "integer", udt_name: "int4", is_nullable });
  const spec = rowsToSpec({
    columns: [col("orders", "shop_id"), col("orders", "id"), col("items", "shop_id"), col("items", "order_id", "YES")],
    constraints: [
      { kind: "p", table_name: "orders", columns: ["shop_id", "id"] },
      { kind: "f", table_name: "items", columns: ["shop_id", "order_id"], ref_table: "orders", ref_schema: "public", on_delete: "a" },
    ],
  });
  assert.equal(fields(spec, "orders").shop_id.key, true);
  assert.equal(fields(spec, "orders").id.key, true);
  // One nullable column is enough for the child to exist without a parent.
  assert.deepEqual(spec.links, [{ from: "orders", to: "items", via: "shop_id,order_id", strong: false, optional: true }]);
});

test("postgres: runs both queries for the requested schema on the client it is given", async () => {
  const seen = [];
  const rows = catalogue();
  const client = {
    query: async (sql, params) => {
      seen.push(params);
      return { rows: sql.includes("information_schema.columns") ? rows.columns : rows.constraints };
    },
  };
  const spec = await importPostgres({ client, schema: "shop" });
  assert.deepEqual(seen, [["shop"], ["shop"]]);
  assert.equal(spec.title, "shop schema");
  await assert.rejects(importPostgres({ client: { query: async () => ({ rows: [] }) } }), /no tables in schema "public"/);
});

test("postgres: against a live database when SCHEMACASE_TEST_PG is set", { skip: !process.env.SCHEMACASE_TEST_PG }, async () => {
  const spec = await importPostgres({ connectionString: process.env.SCHEMACASE_TEST_PG });
  assert.doesNotThrow(() => normalizeSpec(spec));
});

test("import arguments", () => {
  assert.deepEqual(parseImportArgs(["prisma", "schema.prisma"]), {
    source: "prisma", input: "schema.prisma", out: "", schema: "public",
  });
  assert.equal(parseImportArgs(["postgres", "postgres://x", "--schema", "shop", "-o", "m.json"]).schema, "shop");
  assert.throws(() => parseImportArgs(["mysql", "x"]), /usage:/);
  assert.throws(() => parseImportArgs(["prisma"]), /usage:/);
});
