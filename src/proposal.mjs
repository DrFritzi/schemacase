/**
 * The proposal section: one card per authored change, each showing exactly what saying yes to it
 * would do to the model.
 *
 * The page is static — there is no server to record a verdict — so every card carries a short,
 * stable id. Reviewing is then a sentence: "P1 ja, P3 nein". That is deliberately lower-tech than
 * a form, and it works in a file you can mail to someone.
 */
import { diffSpecs, slice, unaccounted } from "./diff.mjs";

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ESCAPES[c]);

const MARK = { added: "+", removed: "−", changed: "~" };
const WORD = { added: "added", removed: "removed", changed: "changed" };

function fieldShape(field) {
  if (!field) return "";
  const marks = [
    field.key ? "key" : "",
    field.required ? "required" : "",
    field.document ? "document" : "",
  ].filter(Boolean);
  return `${field.type}${marks.length ? ` (${marks.join(", ")})` : ""}`;
}

function fieldRow(collection, field) {
  const shape =
    field.status === "changed"
      ? `<span class="was">${esc(fieldShape(field.from))}</span>` +
        `<span class="arrow">→</span><span class="now">${esc(fieldShape(field.to))}</span>`
      : `<span class="now">${esc(fieldShape(field.to ?? field.from))}</span>`;
  return `<tr class="d-${field.status}">
      <td class="mark">${MARK[field.status]}</td>
      <td class="fn">${esc(collection)}.${esc(field.name)}</td>
      <td class="shape">${shape}</td>
    </tr>`;
}

/** A whole collection arriving or leaving is a headline, not a list of rows. */
function collectionHeadline(entry) {
  const fields = (entry.to ?? entry.from)?.fields ?? [];
  return `<p class="d-head d-${entry.status}"><b>${MARK[entry.status]}</b> collection
    <code>${esc(entry.name)}</code> <i>${WORD[entry.status]}</i>, ${fields.length} fields</p>`;
}

function operationBlock(entry) {
  if (entry.status !== "changed") {
    return `<p class="d-head d-${entry.status}"><b>${MARK[entry.status]}</b> operation
      <code>${esc(entry.name)}</code> <i>${WORD[entry.status]}</i></p>`;
  }
  const rows = entry.inputs.map((i) => fieldRow(entry.name, i)).join("");
  const summary =
    entry.from.summary === entry.to.summary
      ? ""
      : `<p class="d-summary"><span class="was">${esc(entry.from.summary)}</span>
         <span class="arrow">→</span><span class="now">${esc(entry.to.summary)}</span></p>`;
  return `${summary}${rows ? `<table class="d-table"><tbody>${rows}</tbody></table>` : ""}`;
}

function linkBlock(entry) {
  return `<p class="d-head d-${entry.status}"><b>${MARK[entry.status]}</b> relationship
    <code>${esc(entry.name)}</code> <i>${WORD[entry.status]}</i></p>`;
}

function card(change, diff) {
  const part = slice(diff, change.affects);
  // One table for the whole card, not one per collection: separate tables size their columns
  // separately, and the field names then fail to line up down the card.
  const rows = part.collections
    .filter((c) => c.status === "changed")
    .flatMap((c) => (c.fields ?? []).map((f) => fieldRow(c.name, f)))
    .join("");
  const body = [
    ...part.collections.filter((c) => c.status !== "changed").map(collectionHeadline),
    rows ? `<table class="d-table"><tbody>${rows}</tbody></table>` : "",
    ...part.operations.map(operationBlock),
    ...part.links.map(linkBlock),
  ].join("");
  const counts = [
    part.collections.length ? `${part.collections.length} collections` : "",
    part.operations.length ? `${part.operations.length} operations` : "",
    part.links.length ? `${part.links.length} relationships` : "",
  ].filter(Boolean).join(" · ");
  return `<article class="proposal" id="${esc(change.id)}">
      <header>
        <span class="pid">${esc(change.id)}</span>
        <h3>${esc(change.title)}</h3>
      </header>
      ${change.why ? `<p class="why">${esc(change.why)}</p>` : ""}
      ${change.cost ? `<p class="cost"><b>Costs:</b> ${esc(change.cost)}</p>` : ""}
      <p class="counts">${esc(counts || "no change to the model")}</p>
      ${body || '<p class="none">nothing</p>'}
    </article>`;
}

/**
 * @param {object} current normalized current spec
 * @param {object} proposed normalized proposed spec
 * @param {{ id: string, title: string, why?: string, cost?: string, affects?: object }[]} changes
 */
export function renderProposals(current, proposed, changes) {
  if (!changes?.length) return "";
  const diff = diffSpecs(current, proposed);
  const loose = unaccounted(diff, changes);
  const cards = changes.map((c) => card(c, diff)).join("");
  const ids = changes.map((c) => c.id).join(", ");
  return `<section class="proposals">
    <div class="group-head">
      <h2>Proposals</h2>
      <p>Each card is one decision on its own. Answer with the ids, for example
        <code>${esc(ids.split(",")[0]?.trim() ?? "P1")} yes, ${esc(
          ids.split(",")[1]?.trim() ?? "P2"
        )} no</code> — left open means nothing happens.</p>
    </div>
    ${cards}
    ${
      loose.length
        ? `<p class="missing"><b>Unaccounted for:</b> ${loose
            .map((l) => `<code>${esc(l)}</code>`)
            .join(", ")}. That belongs on a card, or it would arrive unasked.</p>`
        : ""
    }
  </section>`;
}
