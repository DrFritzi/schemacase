/**
 * A spec in, one self-contained HTML page out. No dependency, no network, nothing to serve:
 * the result is a file you open.
 */
import { normalizeSpec } from "./spec.mjs";
import { toDot, areaId, sysId } from "./dot.mjs";
import { renderDot } from "./graphviz.mjs";
import { viewerScript } from "./viewer.mjs";
import { panZoomSource } from "./bundles.mjs";
import { STYLE } from "./style.mjs";
import { renderProposals } from "./proposal.mjs";

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ESCAPES[c]);

/**
 * A group is authored, so it can name a table or an operation that is not there. The canvas draws
 * what exists and would say nothing about the rest, so the page says it once.
 */
/** Columns with neither a reason nor a requirement behind them. */
function unjustified(spec) {
  return spec.collections.reduce(
    (n, c) => n + c.fields.filter((f) => !f.why && !f.usedBy.length).length,
    0
  );
}

function renderMissing(spec) {
  const tables = new Set(spec.collections.map((c) => c.name));
  const operations = new Set(spec.operations.map((o) => o.name));
  const missing = spec.groups.flatMap((g) => [
    ...g.collections.filter((n) => !tables.has(n)),
    ...g.operations.filter((n) => !operations.has(n)),
  ]);
  if (!missing.length) return "";
  return `<p class="missing">Named but not present: ${[...new Set(missing)]
    .map((n) => `<code>${esc(n)}</code>`)
    .join(", ")}</p>`;
}

/**
 * @param {object} input a schemacase spec
 * @param {object} [proposedInput] a second spec, plus a `changes` list, to review against the first
 * @returns {string} a complete HTML document
 */
export async function renderHtml(input, proposedInput = null) {
  const spec = normalizeSpec(input);
  const proposals = proposedInput
    ? renderProposals(spec, normalizeSpec(proposedInput), proposedInput.changes)
    : "";
  const jumps = [
    ...spec.groups.map((g, i) => ({ id: areaId(i), name: g.name, kind: "area" })),
    ...spec.systems.map((s, i) => ({ id: sysId(i), name: s.name, kind: s.kind })),
  ];
  const graph = await renderDot(toDot(spec));

  const counts = [
    `${spec.collections.length} ${spec.collectionsLabel}`,
    `${spec.links.length} relationships`,
    `${spec.operations.length} ${spec.operationsLabel}`,
    `${spec.collections.reduce((n, c) => n + c.fields.filter((f) => f.document).length, 0)} documents`,
    `${unjustified(spec)} unjustified`,
  ].join(" · ");

  // The page is the diagram. Everything else is either chrome in the rail or one click away in
  // the panel — including the proposals, which stay reachable because they are what you answer.
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(spec.title)}</title>
<style>${STYLE}</style></head>
<body>
  <div class="viewer">
    <nav class="rail" aria-label="Navigation">
      <p class="rail-title">${esc(spec.title)}</p>
      <p class="rail-counts">${esc(counts)}</p>
      <div class="rail-tools">
        <button type="button" id="zoom-fit" class="tool">all</button>
        <button type="button" id="zoom-in" class="tool" aria-label="closer">+</button>
        <button type="button" id="zoom-out" class="tool" aria-label="further">−</button>
      </div>
      ${jumps
        .map(
          (j) =>
            `<button type="button" data-jump="${esc(j.id)}" class="jump ${esc(j.kind)}">${esc(j.name)}</button>`
        )
        .join("")}
      ${proposals ? '<button type="button" id="show-proposals" class="jump proposals-open">Proposals</button>' : ""}
    </nav>
    <div class="canvas" id="canvas">${graph}</div>
    <aside class="detail" id="detail" hidden></aside>
  </div>
  ${renderMissing(spec)}
  ${proposals ? `<template id="proposals-source">${proposals}</template>` : ""}
<script>${panZoomSource()}</script>
<script>${viewerScript(spec)}</script>
</body></html>`;
}
