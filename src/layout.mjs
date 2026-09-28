/**
 * The relationship map, drawn here rather than handed to a diagram library.
 *
 * A data model is usually a star around one or two roots, and depth-from-root layering reads
 * better for that shape than a generic force or hierarchy layout — and it costs no dependency
 * and no network, which is what keeps the output a single openable file.
 */

export const BOX_W = 190;
export const BOX_H = 34;
const GAP_Y = 12;
const GAP_X = 92;
const PAD = 16;

function parentIndex(links) {
  const parents = new Map();
  for (const link of links) {
    if (!parents.has(link.to)) parents.set(link.to, []);
    parents.get(link.to).push(link.from);
  }
  return parents;
}

function depths(collections, parents) {
  const depth = new Map();
  const depthOf = (name, seen = new Set()) => {
    if (depth.has(name)) return depth.get(name);
    if (seen.has(name)) return 0;
    seen.add(name);
    const above = parents.get(name) ?? [];
    const d = above.length ? Math.max(...above.map((p) => depthOf(p, seen))) + 1 : 0;
    depth.set(name, d);
    return d;
  };
  for (const collection of collections) depthOf(collection.name);
  return depth;
}

/** Within a column, keep children beside the parent they hang off: fewer crossing lines. */
function sortColumns(columns, order, parents) {
  for (const d of order) {
    if (d === 0) continue;
    const rank = new Map((columns.get(d - 1) ?? []).map((name, i) => [name, i]));
    columns.get(d).sort((a, b) => {
      const ra = Math.min(...(parents.get(a) ?? []).map((p) => rank.get(p) ?? 99), 99);
      const rb = Math.min(...(parents.get(b) ?? []).map((p) => rank.get(p) ?? 99), 99);
      return ra - rb || a.localeCompare(b);
    });
  }
}

/**
 * @returns {{ pos: Map<string, {x: number, y: number}>, width: number, height: number,
 *             parents: Map<string, string[]> }}
 */
export function layout(collections, links) {
  const parents = parentIndex(links);
  const depth = depths(collections, parents);

  const columns = new Map();
  for (const collection of collections) {
    const d = depth.get(collection.name) ?? 0;
    if (!columns.has(d)) columns.set(d, []);
    columns.get(d).push(collection.name);
  }
  const order = [...columns.keys()].sort((a, b) => a - b);
  sortColumns(columns, order, parents);

  const pos = new Map();
  let height = 0;
  for (const d of order) {
    const names = columns.get(d);
    height = Math.max(height, names.length * (BOX_H + GAP_Y) - GAP_Y);
    names.forEach((name, i) => {
      pos.set(name, { x: PAD + d * (BOX_W + GAP_X), y: PAD + i * (BOX_H + GAP_Y) });
    });
  }
  // Centre shorter columns against the tallest, so the map does not read as top-aligned ragged.
  for (const d of order) {
    const names = columns.get(d);
    const offset = (height - (names.length * (BOX_H + GAP_Y) - GAP_Y)) / 2;
    for (const name of names) pos.get(name).y += offset;
  }

  const width = PAD + order.length * (BOX_W + GAP_X) - GAP_X + PAD;
  return { pos, width, height: height + PAD * 2, parents };
}

export function edgePath(from, to) {
  const x1 = from.x + BOX_W;
  const y1 = from.y + BOX_H / 2;
  const y2 = to.y + BOX_H / 2;
  const mid = x1 + (to.x - x1) / 2;
  return `M ${x1} ${y1} H ${mid} V ${y2} H ${to.x}`;
}
