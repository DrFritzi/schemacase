/**
 * The model as Graphviz DOT — one diagram holding every store with every column, the operations
 * that reach them, the systems around them, and the data crossing between.
 *
 * Graphviz rather than a diagram-as-text format, for one reason: ports. A table is drawn as an
 * HTML label whose every row is an anchor, so a foreign key is an edge from the column that holds
 * it to the column it points at. Table-to-table lines cannot say *which* column, which is most of
 * what a reader wants from a schema picture. Crow's foot comes from Graphviz's own arrow shapes.
 *
 * Rendered to SVG when the page is built, not in the browser: the reader gets a picture, not a
 * megabyte of layout engine.
 */
import { esc } from "./esc.mjs";
import { isUnjustified } from "./spec.mjs";

/** DOT ids must be plain, and must survive round-tripping back to a name on click. */
const plain = (prefix) => (name) => `${prefix}_${String(name).replace(/[^A-Za-z0-9_]/g, "_")}`;
export const tableId = plain("t");
export const portId = plain("p");
export const opId = plain("o");
export const areaId = (i) => `g${i}`;
export const sysId = (i) => `s${i}`;
const COLORS = {
  line: "#c9d2dc",
  ink: "#16202c",
  muted: "#5a6875",
  head: "#e6eef4",
  headKey: "#dceef0",
  accent: "#0e7c86",
  warn: "#9a6a15",
  doc: "#f6ecd8",
  area: "#f7f9fb",
};

// Graphviz rejects a label with an empty <FONT>, and then draws no table at all, so a cell that may
// be empty (a column without a type, a row without marks) always holds at least a space.
function fieldRow(field, foreign) {
  const marks = [field.key ? "PK" : "", foreign.has(field.name) ? "FK" : ""].filter(Boolean).join(",");
  const bg = field.document ? ` BGCOLOR="${COLORS.doc}"` : "";
  const nameColor = field.required ? COLORS.ink : COLORS.muted;
  return (
    `<TR><TD PORT="${portId(field.name)}" ALIGN="LEFT"${bg}>` +
    `<FONT COLOR="${COLORS.accent}" POINT-SIZE="9">${esc(marks || " ")}</FONT></TD>` +
    `<TD ALIGN="LEFT"${bg}><FONT COLOR="${nameColor}">${esc(field.name)}` +
    `${isUnjustified(field) ? ` <FONT COLOR="${COLORS.warn}">?</FONT>` : ""}</FONT></TD>` +
    `<TD ALIGN="LEFT"${bg}><FONT COLOR="${COLORS.muted}" POINT-SIZE="9">${esc(field.type || " ")}</FONT></TD></TR>`
  );
}

function tableNode(collection, foreign) {
  const rows = collection.fields.map((f) => fieldRow(f, foreign)).join("");
  const label =
    `<<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" CELLPADDING="3" COLOR="${COLORS.line}">` +
    `<TR><TD COLSPAN="3" BGCOLOR="${COLORS.headKey}" ALIGN="CENTER">` +
    `<B>${esc(collection.name)}</B></TD></TR>${rows}</TABLE>>`;
  return `    ${tableId(collection.name)} [id="${tableId(collection.name)}", label=${label}];`;
}

/** Foreign-key column names per table, so a row can be marked FK. */
function foreignColumns(links) {
  const byChild = new Map();
  for (const link of links) {
    if (!byChild.has(link.to)) byChild.set(link.to, new Set());
    for (const column of String(link.via ?? "").split(",")) {
      const name = column.trim();
      if (name) byChild.get(link.to).add(name);
    }
  }
  return byChild;
}

/**
 * A foreign key is drawn from the column holding it to the column it references. Only the first
 * column of a composite key is anchored, skipping a leading tenant column such as project_id:
 * every composite key in a multi-tenant schema starts with it, so anchoring on it would draw the
 * same line many times into one row.
 */
function edgeFor(link, byName) {
  const child = byName.get(link.to);
  const parent = byName.get(link.from);
  if (!child || !parent) return "";
  const columns = String(link.via ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  const column = columns.find((c) => c !== "project_id") ?? columns[0];
  const parentKey = parent.fields.find((f) => f.key && f.name !== "project_id") ?? parent.fields[0];
  if (!column || !parentKey) return "";
  // crow at the child (many), bar at the parent (exactly one), circle too where it may be absent.
  const head = link.optional ? "odottee" : "tee";
  const style = link.strong ? `color="${COLORS.accent}"` : `color="${COLORS.muted}"`;
  return (
    `  ${tableId(link.to)}:${portId(column)}:w -> ${tableId(link.from)}:${portId(parentKey.name)}:e ` +
    `[dir=both, arrowtail=crow, arrowhead=${head}, ${style}];`
  );
}

const SYSTEM_SHAPE = {
  external: `shape=cds, fillcolor="${COLORS.doc}", color="${COLORS.warn}"`,
  store: `shape=cylinder, fillcolor="${COLORS.headKey}", color="${COLORS.accent}"`,
  internal: `shape=box, style="rounded,filled", fillcolor="#eef1f5", color="${COLORS.muted}"`,
};

function operationNode(operation) {
  return (
    `    ${opId(operation.name)} [id="${opId(operation.name)}", label="${esc(operation.name)}", ` +
    `shape=box, style="rounded,filled", fillcolor="#ffffff", color="${COLORS.accent}", ` +
    `fontcolor="${COLORS.accent}", fontsize=10, margin="0.08,0.04"];`
  );
}

function cluster(id, label, color, body, out) {
  out.push(
    `  subgraph cluster_${id} {`,
    `    id="${id}"; label="${esc(label)}"; labelloc="t"; labeljust="l";`,
    `    style="filled,rounded"; fillcolor="${COLORS.area}"; color="${color}";`,
    `    fontsize=13; fontcolor="${COLORS.muted}"; margin=14;`,
    ...body,
    "  }"
  );
}

/** One cluster per group, and a warning-coloured one for any collection nobody grouped. */
function areas(spec, out) {
  const foreign = foreignColumns(spec.links);
  const find = (list, names) => names.map((n) => list.find((x) => x.name === n)).filter(Boolean);
  const node = (table) => tableNode(table, foreign.get(table.name) ?? new Set());
  const placed = new Set();
  spec.groups.forEach((group, i) => {
    const tables = find(spec.collections, group.collections);
    const operations = find(spec.operations, group.operations);
    if (!tables.length && !operations.length) return;
    for (const table of tables) placed.add(table.name);
    cluster(areaId(i), group.name, COLORS.line, [...tables.map(node), ...operations.map(operationNode)], out);
  });
  const loose = spec.collections.filter((c) => !placed.has(c.name));
  if (loose.length) cluster("gx", "Unplaced", COLORS.warn, loose.map(node), out);
}

/** Flows may name an area, a system or a single table; resolve all three to a node to point at. */
function flowTargets(spec) {
  const byName = new Map();
  spec.groups.forEach((group, i) => {
    const anchor = group.collections[0] ?? group.operations[0];
    if (!anchor) return;
    const isTable = spec.collections.some((c) => c.name === anchor);
    byName.set(group.name, {
      node: isTable ? tableId(anchor) : opId(anchor),
      cluster: `cluster_${areaId(i)}`,
    });
  });
  spec.systems.forEach((system, i) => byName.set(system.name, { node: sysId(i), cluster: null }));
  for (const c of spec.collections) byName.set(c.name, { node: tableId(c.name), cluster: null });
  return byName;
}

/**
 * @param {object} spec a normalized spec
 * @returns {string} DOT source
 */
export function toDot(spec) {
  const out = [
    "digraph model {",
    "  compound=true; rankdir=LR; splines=spline; overlap=false;",
    '  graph [bgcolor="transparent", fontname="Helvetica", nodesep=0.35, ranksep=1.1, pad=0.3];',
    `  node [shape=plaintext, fontname="Helvetica", fontsize=11, fontcolor="${COLORS.ink}"];`,
    `  edge [fontname="Helvetica", fontsize=9, fontcolor="${COLORS.muted}"];`,
  ];
  areas(spec, out);

  spec.systems.forEach((system, i) => {
    const shape = SYSTEM_SHAPE[system.kind] ?? SYSTEM_SHAPE.internal;
    out.push(
      `  ${sysId(i)} [id="${sysId(i)}", label="${esc(system.name)}", style=filled, ${shape}, fontsize=12];`
    );
  });

  const byName = new Map(spec.collections.map((c) => [c.name, c]));
  for (const link of spec.links) {
    const edge = edgeFor(link, byName);
    if (edge) out.push(edge);
  }

  const targets = flowTargets(spec);
  for (const flow of spec.flows) {
    const from = targets.get(flow.from);
    const to = targets.get(flow.to);
    if (!from || !to) continue;
    const ends = [
      from.cluster ? `ltail=${from.cluster}` : "",
      to.cluster ? `lhead=${to.cluster}` : "",
    ].filter(Boolean).join(", ");
    out.push(
      `  ${from.node} -> ${to.node} [label="${esc(flow.label)}", style=dashed, constraint=false, ` +
        `color="${COLORS.warn}", fontcolor="${COLORS.warn}", penwidth=1.2${ends ? ", " + ends : ""}];`
    );
  }

  out.push("}");
  return out.join("\n");
}
