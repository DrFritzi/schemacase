/**
 * Escape text for HTML, and for the HTML-like labels of a DOT file. Self-contained on purpose:
 * the page script embeds this function's source, so the page and the build escape identically.
 */
export function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}
