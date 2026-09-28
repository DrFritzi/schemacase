/**
 * Everything the finished picture needs to be usable: drag to pan, wheel to zoom, a rail that
 * flies to an area or a system, and a click that answers "what is this" for a table, an operation
 * or a system.
 *
 * Written as strings because the page has to stay one self-contained file, which is also why
 * nothing here fetches anything. Split in two only so neither half grows past reading size.
 */

/** Turning a thing in the spec into the panel beside the canvas. */
const PANEL = `
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const tag = (kind, text) => '<span class="tag ' + kind + '">' + esc(text) + '</span>';

  function open(title, body) {
    panel.classList.remove("wide");
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
    if (!source) return;
    panel.classList.add("wide");
    // The section brings its own heading; a second one in the panel header just repeats it.
    panel.innerHTML = '<header><h4></h4>' +
      '<button type="button" id="detail-close" aria-label="close">&times;</button></header>' +
      source.innerHTML;
    panel.hidden = false;
    document.getElementById("detail-close").addEventListener("click", () => { panel.hidden = true; });
  }

  function showSystem(index) {
    const s = SPEC.systems[index];
    if (!s) return;
    open(s.name, '<p>' + esc(s.blurb || "") + '</p><p class="lineage">' + esc(s.kind) + '</p>');
  }
`;

/**
 * Pan, zoom and the rail. The one subtlety is `boxInRoot`: getBBox() answers in the element's own
 * coordinates and every Graphviz node sits under a transform, so the box has to be carried into
 * the space pan and zoom work in. Skipping that is why the rail used to fly to the wrong place.
 */
const NAVIGATION = `
  const byId = (id) => svg.querySelector('[id="' + id + '"]');

  function boxInRoot(el) {
    const root = svg.querySelector(".svg-pan-zoom_viewport") || svg;
    const b = el.getBBox();
    const m = root.getScreenCTM().inverse().multiply(el.getScreenCTM());
    const corners = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]
      .map(([x, y]) => { const p = svg.createSVGPoint(); p.x = x; p.y = y; return p.matrixTransform(m); });
    const xs = corners.map((p) => p.x), ys = corners.map((p) => p.y);
    const x = Math.min.apply(null, xs), y = Math.min.apply(null, ys);
    return { x, y, width: Math.max.apply(null, xs) - x, height: Math.max.apply(null, ys) - y };
  }

  function focus(el) {
    if (!pz || !el) return;
    const box = boxInRoot(el);
    if (!box.width || !box.height) return;
    const sizes = pz.getSizes();
    const unit = sizes.realZoom / pz.getZoom();
    const fit = Math.min(sizes.width / box.width, sizes.height / box.height) / unit;
    pz.zoom(Math.max(0.15, Math.min(fit * 0.85, 6)));
    const after = pz.getSizes();
    pz.pan({
      x: sizes.width / 2 - (box.x + box.width / 2) * after.realZoom,
      y: sizes.height / 2 - (box.y + box.height / 2) * after.realZoom,
    });
  }

  function wire() {
    for (const node of svg.querySelectorAll('g[id^="t_"], g[id^="o_"], g[id^="s"]')) {
      node.style.cursor = "pointer";
      node.addEventListener("click", (e) => {
        e.stopPropagation();
        if (node.id.startsWith("t_")) showTable(node.id.slice(2));
        else if (node.id.startsWith("o_")) showOperation(node.id.slice(2));
        else showSystem(Number(node.id.slice(1)));
      });
    }
    document.getElementById("zoom-in").addEventListener("click", () => pz.zoomIn());
    document.getElementById("zoom-out").addEventListener("click", () => pz.zoomOut());
    document.getElementById("zoom-fit").addEventListener("click", () => {
      pz.reset(); pz.fit(); pz.center(); panel.hidden = true;
    });
    for (const button of document.querySelectorAll("[data-jump]")) {
      button.addEventListener("click", () => focus(byId(button.dataset.jump)));
    }
    const proposals = document.getElementById("show-proposals");
    if (proposals) proposals.addEventListener("click", showProposals);
    window.addEventListener("resize", () => { pz.resize(); pz.fit(); pz.center(); });
  }
`;

/**
 * The rail's buttons carry their target in a data attribute, so this needs the spec only — it
 * reads the jump targets off the page it is already in.
 *
 * @param {object} spec normalized spec, embedded so the panel can answer without a round trip
 */
export const viewerScript = (spec) => `
(() => {
  const SPEC = ${JSON.stringify({
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
  let pz = null;
${PANEL}
${NAVIGATION}
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  pz = svgPanZoom(svg, {
    zoomScaleSensitivity: 0.3, minZoom: 0.1, maxZoom: 14,
    controlIconsEnabled: false, fit: true, center: true,
  });
  wire();
})();
`;
