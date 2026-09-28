/**
 * The one script the page still ships, inlined.
 *
 * Graphviz runs at build time, so no layout engine is sent to the reader. What cannot be done
 * ahead of time is pan and zoom, and that is 66 KB — read off disk at render time and written
 * into a script tag, because the output has to open anywhere with no network.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const cache = new Map();

function bundle(specifier) {
  if (!cache.has(specifier)) cache.set(specifier, readFileSync(require.resolve(specifier), "utf8"));
  return cache.get(specifier);
}

/** Pan and zoom for the rendered SVG; exposes window.svgPanZoom. */
export function panZoomSource() {
  return bundle("svg-pan-zoom/dist/svg-pan-zoom.min.js");
}
