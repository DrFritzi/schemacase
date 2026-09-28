/**
 * DOT to SVG, at build time.
 *
 * Graphviz runs here rather than in the page, so the reader downloads a finished picture instead
 * of a layout engine — which also means the diagram is identical everywhere and needs no script
 * to appear at all. Only pan and zoom stay client-side, and that is 66 KB.
 */
import { instance } from "@viz-js/viz";

let viz = null;

/**
 * @param {string} dot
 * @returns {Promise<string>} an `<svg>` element, ready to inline
 */
export async function renderDot(dot) {
  if (!viz) viz = await instance();
  const svg = viz.renderString(dot, { format: "svg" });
  // Graphviz emits a standalone document; the page wants the element, sized by its container.
  return svg
    .slice(svg.indexOf("<svg"))
    .replace(/<svg width="[^"]*" height="[^"]*"/, '<svg id="graph"');
}
