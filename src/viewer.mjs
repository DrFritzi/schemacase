/**
 * Everything the finished picture needs to be usable: drag to pan, wheel to zoom, a rail that
 * flies to an area or a system, and a click that answers "what is this" for a table, an operation
 * or a system.
 *
 * Written as strings because the page has to stay one self-contained file, which is also why
 * nothing here fetches anything. Split in two only so neither half grows past reading size.
 */

import { esc } from "./esc.mjs";

/** Turning a thing in the spec into the panel beside the canvas. The page gets the same `esc`. */
const PANEL = `
  const esc = ${esc};
  const tag = (kind, text) => '<span class="tag ' + kind + '">' + esc(text) + '</span>';

  function open(title, body, wide) {
    panel.classList.toggle("wide", Boolean(wide));
    panel.innerHTML = '<header><h4>' + esc(title) + '</h4>' +
      '<button type="button" id="detail-close" aria-label="close">&times;</button></header>' + body;
    panel.hidden = false;
    document.getElementById("detail-close").addEventListener("click", () => { panel.hidden = true; });
  }

  function foreignOf(name) {
    const cols = new Set();
    for (const l of SPEC.links) {
      if (l.to !== name) continue;
      for (const c of String(l.via || "").split(",")) if (c.trim()) cols.add(c.trim());
    }
    return cols;
  }

  function showTable(name) {
    const t = tables.get(name);
    if (!t) return;
    const foreign = foreignOf(name);
    const rows = t.fields.map((f) => {
      const marks =
        (f.key ? tag("key", "key") : "") +
        (foreign.has(f.name) ? tag("key", "foreign") : "") +
        (f.required ? tag("req", "required") : "") +
        (f.document ? tag("doc", "document") : "");
      // The case for the column, or the absence of one stated plainly. A row that says nothing
      // here is a row nobody has justified, and that is the point of showing it.
      const why = f.why
        ? '<p class="why">' + esc(f.why) + '</p>'
        : '<p class="why unjustified">No reason recorded for storing this, or for this shape.</p>';
      const used = f.usedBy.length
        ? '<p class="used">' + f.usedBy.map((u) => '<code>' + esc(u) + '</code>').join(", ") + '</p>'
        : '<p class="used unjustified">No requirement recorded.</p>';
      return '<li><div class="fh"><span class="fn">' + esc(f.name) + '</span>' +
        '<span class="ft">' + esc(f.type) + '</span></div>' +
        (marks ? '<div class="fm">' + marks + '</div>' : "") + why + used + '</li>';
    }).join("");
    const rel = (label, names) => names.length
      ? '<p class="lineage">' + label + " " + names.map((n) =>
          '<button type="button" class="link" data-go="' + esc(n) + '">' + esc(n) + '</button>'
        ).join(", ") + '</p>'
      : "";
    open(name,
      rel("belongs to", SPEC.links.filter((l) => l.to === name).map((l) => l.from)) +
      rel("referenced by", SPEC.links.filter((l) => l.from === name).map((l) => l.to)) +
      '<ul class="fields">' + rows + '</ul>');
    for (const b of panel.querySelectorAll("[data-go]")) {
      b.addEventListener("click", () => { showTable(b.dataset.go); focus(byId("t_" + b.dataset.go)); });
    }
  }

  function showOperation(name) {
    const o = operations.get(name);
    if (!o) return;
    const inputs = o.inputs.length
      ? '<div class="inputs">' + o.inputs.map((i) =>
          '<span class="input"><code>' + esc(i.name) + '</code>' + (i.required ? "" : "<i>?</i>") +
          '<em>' + esc(i.type) + '</em></span>').join("") + '</div>'
      : '<p class="none">no inputs</p>';
    open(name, '<p>' + esc(o.summary) + '</p>' + inputs);
  }

  function showProposals() {
    const source = document.getElementById("proposals-source");
    // The section brings its own heading; a second one in the panel header just repeats it.
    if (source) open("", source.innerHTML, true);
  }

  function showSystem(index) {
    const s = SPEC.systems[index];
    if (!s) return;
    open(s.name, '<p>' + esc(s.blurb || "") + '</p><p class="lineage">' + esc(s.kind) + '</p>');
  }
`;

/**
 * Pan, zoom and the rail, on the SVG's own viewBox. The viewBox is kept at the canvas's aspect
 * ratio so it is exactly the visible region: the view is a centre and a zoom, and zooming keeps
 * the point under the cursor where it is. `boxInRoot` carries an element's box into that space,
 * because getBBox() answers in the element's own coordinates and every Graphviz node sits under
 * a transform.
 */
const NAVIGATION = `
  const byId = (id) => svg.querySelector('[id="' + id + '"]');
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  const vb = svg.viewBox.baseVal;
  const home = { cx: vb.x + vb.width / 2, cy: vb.y + vb.height / 2, w: vb.width, h: vb.height };
  let cx = home.cx, cy = home.cy, zoom = 1;

  const size = () => svg.getBoundingClientRect();
  const fitWidth = (r) => Math.max(home.w, home.h * r.width / r.height);

  function draw() {
    const r = size();
    if (!r.width || !r.height) return;
    const w = fitWidth(r) / zoom, h = w * r.height / r.width;
    svg.setAttribute("viewBox", [cx - w / 2, cy - h / 2, w, h].join(" "));
  }

  function toUser(x, y) {
    const p = svg.createSVGPoint();
    p.x = x; p.y = y;
    return p.matrixTransform(svg.getScreenCTM().inverse());
  }

  function zoomBy(factor, x, y) {
    const r = size();
    const px = x ?? r.left + r.width / 2, py = y ?? r.top + r.height / 2;
    const under = toUser(px, py);
    zoom = clamp(zoom * factor, 0.1, 14);
    draw();
    const now = toUser(px, py);
    cx += under.x - now.x; cy += under.y - now.y;
    draw();
  }

  function fit() { cx = home.cx; cy = home.cy; zoom = 1; draw(); }

  function boxInRoot(el) {
    const b = el.getBBox();
    const m = svg.getScreenCTM().inverse().multiply(el.getScreenCTM());
    const at = (x, y) => { const p = svg.createSVGPoint(); p.x = x; p.y = y; return p.matrixTransform(m); };
    const a = at(b.x, b.y), c = at(b.x + b.width, b.y + b.height);
    return { x: Math.min(a.x, c.x), y: Math.min(a.y, c.y), width: Math.abs(c.x - a.x), height: Math.abs(c.y - a.y) };
  }

  function focus(el) {
    if (!el) return;
    const box = boxInRoot(el);
    if (!box.width || !box.height) return;
    const w = fitWidth(size()), h = w * size().height / size().width;
    zoom = clamp(Math.min(w / box.width, h / box.height) * 0.85, 0.15, 6);
    cx = box.x + box.width / 2; cy = box.y + box.height / 2;
    draw();
  }

  // Opening the panel narrows the canvas, so a node near the right edge can end up behind it:
  // when that happens, bring the node to the middle, at the zoom the reader chose.
  function reveal(el) {
    const box = boxInRoot(el), r = size();
    const w = fitWidth(r) / zoom, h = w * r.height / r.width;
    const inside = box.x >= cx - w / 2 && box.x + box.width <= cx + w / 2 &&
      box.y >= cy - h / 2 && box.y + box.height <= cy + h / 2;
    if (inside) return;
    cx = box.x + box.width / 2; cy = box.y + box.height / 2;
    draw();
  }

  // One finger or the mouse pans, two fingers pinch, the wheel zooms. A drag that ends on a node
  // is not a click on it.
  function wireCanvas() {
    const canvas = svg.parentElement;
    const touches = new Map();
    let travelled = 0;
    canvas.addEventListener("pointerdown", (e) => {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      travelled = 0;
    });
    window.addEventListener("pointermove", (e) => {
      const from = touches.get(e.pointerId);
      if (!from) return;
      const to = { x: e.clientX, y: e.clientY };
      travelled += Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
      const other = touches.size === 2 ? [...touches].find(([id]) => id !== e.pointerId)[1] : null;
      if (other) {
        const before = Math.hypot(from.x - other.x, from.y - other.y);
        const after = Math.hypot(to.x - other.x, to.y - other.y);
        if (before && after) zoomBy(after / before, (to.x + other.x) / 2, (to.y + other.y) / 2);
      } else {
        const unit = vb.width / size().width;
        cx -= (to.x - from.x) * unit; cy -= (to.y - from.y) * unit;
        draw();
      }
      touches.set(e.pointerId, to);
    });
    const release = (e) => touches.delete(e.pointerId);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    canvas.addEventListener("click", (e) => { if (travelled > 5) e.stopPropagation(); }, true);
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), e.clientX, e.clientY);
    }, { passive: false });
    canvas.addEventListener("dblclick", (e) => zoomBy(1.5, e.clientX, e.clientY));
  }

  function wire() {
    for (const node of svg.querySelectorAll('g[id^="t_"], g[id^="o_"], g[id^="s"]')) {
      node.style.cursor = "pointer";
      node.addEventListener("click", (e) => {
        e.stopPropagation();
        if (node.id.startsWith("t_")) showTable(node.id.slice(2));
        else if (node.id.startsWith("o_")) showOperation(node.id.slice(2));
        else showSystem(Number(node.id.slice(1)));
        reveal(node);
      });
    }
    wireCanvas();
    document.getElementById("zoom-in").addEventListener("click", () => zoomBy(1.3));
    document.getElementById("zoom-out").addEventListener("click", () => zoomBy(1 / 1.3));
    document.getElementById("zoom-fit").addEventListener("click", () => { fit(); panel.hidden = true; });
    for (const button of document.querySelectorAll("[data-jump]")) {
      button.addEventListener("click", () => focus(byId(button.dataset.jump)));
    }
    const proposals = document.getElementById("show-proposals");
    if (proposals) proposals.addEventListener("click", showProposals);
    // The canvas also changes size when the panel opens or closes, not only with the window.
    new ResizeObserver(draw).observe(svg.parentElement);
  }
`;

/**
 * JSON for a `<script>` body. Spec text is untrusted, and a `</script>` inside a string would end
 * the script element early and let the rest run as page markup; `\u003c` is the same character
 * to JavaScript and nothing to the HTML parser.
 */
const json = (value) => JSON.stringify(value).replace(/</g, "\\u003c");

/**
 * The rail's buttons carry their target in a data attribute, so this needs the spec only — it
 * reads the jump targets off the page it is already in.
 *
 * @param {object} spec normalized spec, embedded so the panel can answer without a round trip
 */
export const viewerScript = (spec) => `
(() => {
  const SPEC = ${json({
    collections: spec.collections,
    links: spec.links,
    operations: spec.operations,
    systems: spec.systems,
  })};
  const tables = new Map(SPEC.collections.map((c) => [c.name, c]));
  const operations = new Map(SPEC.operations.map((o) => [o.name, o]));

  const panel = document.getElementById("detail");
  const svg = document.getElementById("graph");
  if (!svg) return;
${PANEL}
${NAVIGATION}
  fit();
  wire();
})();
`;
