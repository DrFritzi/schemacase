import { test } from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import { renderHtml } from "../src/render.mjs";
import { toDot } from "../src/dot.mjs";
import { normalizeSpec } from "../src/spec.mjs";
import { parseArgs } from "../src/cli.mjs";
import { shop } from "./helpers.mjs";

test("the page says what the spec says, not what the renderer thinks", async () => {
  const html = await renderHtml(shop());
  assert.match(html, /<title>Orders<\/title>/);
  assert.match(html, /class="rail-title">Orders</);
  assert.match(html, /4 tables · 3 relationships · 3 endpoints/);
});

test("carries no trace of any particular project or stack", async () => {
  const html = (await renderHtml(shop())).toLowerCase();
  for (const word of ["acme", "postgres", "prisma", "npm run"]) {
    assert.equal(html.includes(word), false, `renderer leaks "${word}"`);
  }
});

test("a foreign key is drawn from the column that holds it to the one it points at", async () => {
  const spec = normalizeSpec({
    ...shop(),
    links: shop().links.map((l) => ({ ...l, via: l.to === "orders" ? "customer_id" : "sku" })),
  });
  const dot = toDot(spec);
  // Table-to-table lines cannot say which column; ports are the whole reason for Graphviz here.
  assert.match(dot, /t_orders:p_customer_id:w -> t_customers:p_id:e/);
  assert.match(dot, /arrowtail=crow/);
});

test("a nullable foreign key gets the zero-or-one end", async () => {
  const links = shop().links.map((l) =>
    l.from === "products" ? { ...l, via: "sku", optional: true } : { ...l, via: "customer_id" }
  );
  const dot = toDot(normalizeSpec({ ...shop(), links }));
  assert.match(dot, /t_order_items:p_sku:w -> t_products:p_sku:e \[dir=both, arrowtail=crow, arrowhead=odottee/);
  assert.match(dot, /arrowhead=tee,/);
});

test("every column is on the canvas, marked PK or FK", async () => {
  const spec = normalizeSpec({
    ...shop(),
    links: shop().links.map((l) => ({ ...l, via: l.to === "orders" ? "customer_id" : "sku" })),
  });
  const dot = toDot(spec);
  assert.match(dot, /PORT="p_placed_at"/, "a plain column still gets an anchor");
  assert.match(dot, /PORT="p_customer_id"[\s\S]{0,200}?FK/);
  assert.match(dot, /PORT="p_id"[\s\S]{0,200}?PK/);
});

test("areas become clusters and systems get a shape of their own", async () => {
  const dot = toDot(
    normalizeSpec({
      ...shop(),
      systems: [{ name: "Till", kind: "external" }, { name: "Postgres", kind: "store" }],
      flows: [{ from: "Till", to: "Orders", label: "new order" }],
    })
  );
  assert.match(dot, /subgraph cluster_g2 \{/);
  assert.match(dot, /id="g2"; label="Orders"/);
  assert.match(dot, /s0 \[id="s0", label="Till".*shape=cds/);
  assert.match(dot, /s1 \[id="s1", label="Postgres".*shape=cylinder/);
  assert.match(dot, /s0 -> t_orders \[label="new order".*lhead=cluster_g2/);
});

test("a collection nobody placed still appears, in its own cluster", async () => {
  const spec = shop();
  spec.groups = spec.groups.filter((g) => g.name !== "Catalogue");
  const dot = toDot(normalizeSpec(spec));
  assert.match(dot, /subgraph cluster_gx \{/);
  assert.match(dot, /t_products \[id="t_products"/);
});

test("escapes what it writes into the page", async () => {
  const html = await renderHtml({
    schemacase: 1,
    title: "</title><script>x</script>",
    collectionsLabel: "<b>Tables</b>",
    collections: [{ name: "t", fields: [{ name: "c", type: "text" }] }],
  });
  const page = html.split("<script>")[0];
  assert.equal(page.includes("<b>Tables</b>"), false);
  assert.match(page, /&lt;\/title&gt;/);
  assert.match(page, /&lt;b&gt;Tables&lt;\/b&gt;/);
});

test("a name that would break the diagram source is escaped, not emitted", async () => {
  const dot = toDot(
    normalizeSpec({
      schemacase: 1,
      collections: [{ name: "t", fields: [{ name: '</TD><TD>evil', type: "text" }] }],
    })
  );
  assert.equal(dot.includes("</TD><TD>evil"), false);
  assert.match(dot, /&lt;\/TD&gt;/);
});

test("a collection nobody grouped is still drawn, in its own area", async () => {
  const spec = shop();
  assert.equal((await renderHtml(spec)).includes("Unplaced"), false, "shop groups all");

  spec.groups = spec.groups.filter((g) => g.name !== "Catalogue");
  assert.match(await renderHtml(spec), /Unplaced/);
});

test("a group naming something absent says so rather than dropping it", async () => {
  const spec = shop();
  spec.groups[0].collections.push("nowhere");
  const html = await renderHtml(spec);
  assert.match(html, /Named but not present.*nowhere/s);
});

test("the output path defaults to the spec's name", async () => {
  assert.deepEqual(parseArgs(["docs/model.json"]), {
    spec: "docs/model.json",
    html: "docs/model.html",
    proposal: "",
  });
  assert.deepEqual(parseArgs(["a.json", "-o", "b.html"]), {
    spec: "a.json",
    html: "b.html",
    proposal: "",
  });
  assert.equal(parseArgs(["a.json", "--proposal", "p.json"]).proposal, "p.json");
  assert.throws(() => parseArgs([]), /usage:/);
});

test("spec text cannot end the page script and run as markup", async () => {
  const payload = "</script><img src=x onerror=alert(1)>";
  const html = await renderHtml({
    schemacase: 1,
    title: payload,
    collections: [{ name: payload, fields: [{ name: "c", type: "text", why: payload, usedBy: [payload] }] }],
    operations: [{ name: payload, summary: payload, inputs: [{ name: payload, type: payload }] }],
    systems: [{ name: payload, blurb: payload }],
  });
  assert.equal(html.includes(payload), false, "the payload must not appear verbatim anywhere");
  // Counted by splitting rather than a regexp: this is a check on our own output, not a filter.
  const opened = html.split("<script>").length - 1;
  const closed = html.split("</script>").length - 1;
  assert.equal(closed, opened, "no script element may be closed early");
});

test("every script in the page is valid JavaScript", async () => {
  // Nothing else here runs the page's own code, so a stray quote in a template would go unseen.
  const html = await renderHtml(shop(), shop());
  const scripts = html.split("<script>").slice(1).map((part) => part.split("</script>")[0]);
  assert.ok(scripts.length > 0);
  for (const code of scripts) assert.doesNotThrow(() => new Script(code));
});

test("a column without a type still gets its table drawn", async () => {
  // type is optional in the format, and an empty label cell used to make Graphviz drop the table.
  const html = await renderHtml({
    schemacase: 1,
    collections: [{ name: "t", fields: [{ name: "id", key: true }, { name: "note" }] }],
  });
  const table = html.split('id="t_t"')[1].split("</g>")[0];
  assert.match(table, /<polygon/, "the table has cells");
  assert.match(table, />note\s*</, "and its columns are on it");
});
