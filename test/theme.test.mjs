import { test } from "node:test";
import assert from "node:assert/strict";
import { renderHtml } from "../src/render.mjs";
import { PALETTE } from "../src/dot.mjs";
import { STYLE } from "../src/style.mjs";
import { readJson } from "./helpers.mjs";

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test("both themes define the same colours", () => {
  assert.deepEqual(Object.keys(PALETTE.dark).sort(), Object.keys(PALETTE.light).sort());
  for (const theme of Object.values(PALETTE)) {
    for (const hex of Object.values(theme)) assert.match(hex, /^#[0-9a-f]{6}$/);
  }
  assert.equal(new Set(Object.values(PALETTE.light)).size, Object.keys(PALETTE.light).length, "the light values map back one to one");
});

test("every colour the diagram paints has a dark counterpart", async () => {
  // Graphviz writes the light hex values into the SVG; the stylesheet swaps each for a variable.
  // A colour missing from the palette would stay light in the dark theme.
  const html = await renderHtml(readJson("../example/shop.json"), readJson("../example/proposed.json"));
  const svg = html.slice(html.indexOf("<svg"), html.indexOf("</svg>"));
  const painted = new Set([...svg.matchAll(/ (?:fill|stroke)="([^"]+)"/g)].map((m) => m[1]));
  const known = new Set([...Object.values(PALETTE.light), "none", "transparent"]);
  for (const paint of painted) assert.ok(known.has(paint), `unthemed paint ${paint}`);
  for (const [name, hex] of Object.entries(PALETTE.light)) {
    assert.ok(STYLE.includes(`[fill="${hex}"]{fill:var(--c-${name})}`), `no fill rule for ${name}`);
    assert.ok(STYLE.includes(`[stroke="${hex}"]{stroke:var(--c-${name})}`), `no stroke rule for ${name}`);
  }
});

test("text stays readable in both themes", () => {
  // WCAG AA for normal text: 4.5. The pairs are the ones the diagram actually draws.
  const pairs = [["ink", "area"], ["ink", "surface"], ["ink", "head"], ["ink", "doc"], ["muted", "area"],
    ["muted", "surface"], ["accent", "area"], ["accent", "surface"], ["warn", "area"], ["warn", "doc"]];
  for (const [theme, colours] of Object.entries(PALETTE)) {
    for (const [fg, bg] of pairs) {
      const ratio = contrast(colours[fg], colours[bg]);
      assert.ok(ratio >= 4.5, `${theme}: ${fg} on ${bg} is ${ratio.toFixed(2)}`);
    }
  }
});

test("the page offers a theme switch and restores the reader's choice before it paints", async () => {
  const html = await renderHtml(readJson("../example/shop.json"));
  assert.match(html, /id="theme"/);
  const head = html.slice(0, html.indexOf("</head>"));
  assert.ok(head.includes("schemacase-theme"), "restored from the head, so there is no flash of the wrong theme");
  assert.ok(STYLE.includes('[data-theme="dark"]') && STYLE.includes("prefers-color-scheme: dark"));
});

test("the page knows each node's id, so names with spaces or dashes still work", async () => {
  const html = await renderHtml({
    schemacase: 1,
    collections: [{ name: "order items", fields: [{ name: "id", type: "uuid" }] }],
    operations: [{ name: "place-order" }],
    groups: [{ name: "Orders", collections: ["order items"], operations: ["place-order"] }],
  });
  assert.ok(html.includes('"id":"t_order_items"') && html.includes('"id":"o_place_order"'));
  assert.ok(html.includes('id="t_order_items"') && html.includes('id="o_place_order"'), "and the diagram uses the same ones");
});
