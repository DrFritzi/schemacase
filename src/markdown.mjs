/**
 * The proposal review as Markdown, for places that are not a page: a pull-request comment, a job
 * summary, a terminal. Same split as the page — one section per authored change with the rows it
 * accounts for, and whatever no change accounts for listed on its own, loudly.
 *
 * Kept free of the renderer's imports so it runs with no dependencies installed.
 */
import { normalizeSpec } from "./spec.mjs";
import { diffSpecs, slice, unaccounted } from "./diff.mjs";
import { fieldShape } from "./proposal.mjs";

/** Marks the comment as ours, so a later run edits it instead of adding another. */
export const MARKER = "<!-- schemacase-diff -->";

const MARK = { added: "+", removed: "−", changed: "~" };
const code = (s) => "`" + String(s).replace(/`/g, "ˋ") + "`";
// Spec text comes from the pull request, and the bot posts it: an @name in it must not notify anyone.
const line = (s) =>
  String(s ?? "")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\|/g, "\\|")
    .replace(/@(?=[\w-])/g, "@\u200b");

function shape(entry) {
  if (entry.status !== "changed") return line(fieldShape(entry.to ?? entry.from));
  return `${line(fieldShape(entry.from))} → ${line(fieldShape(entry.to))}`;
}

function rows(part) {
  const out = [];
  for (const c of part.collections) {
    if (c.status !== "changed") {
      out.push(`| ${MARK[c.status]} | collection ${code(c.name)} | ${(c.to ?? c.from).fields.length} fields |`);
      continue;
    }
    for (const f of c.fields) out.push(`| ${MARK[f.status]} | ${code(`${c.name}.${f.name}`)} | ${shape(f)} |`);
  }
  for (const o of part.operations) out.push(`| ${MARK[o.status]} | operation ${code(o.name)} | |`);
  for (const l of part.links) out.push(`| ${MARK[l.status]} | relationship ${code(l.name)} | |`);
  return out.length ? ["| | what | shape |", "|---|---|---|", ...out].join("\n") : "_No change to the model._";
}

function section(change, diff) {
  return [
    `### ${line(change.id)} · ${line(change.title)}`,
    change.why ? line(change.why) : "",
    change.cost ? `**Costs:** ${line(change.cost)}` : "",
    rows(slice(diff, change.affects)),
  ].filter(Boolean).join("\n\n");
}

const unjustified = (spec) =>
  spec.collections.reduce((n, c) => n + c.fields.filter((f) => !f.why && !f.usedBy.length).length, 0);

/**
 * @param {object} currentInput the spec as it is
 * @param {object} proposedInput the spec as proposed, optionally with a `changes` list
 * @returns {{ markdown: string, unaccounted: string[], changed: boolean }}
 */
export function diffMarkdown(currentInput, proposedInput) {
  const current = normalizeSpec(currentInput);
  const proposed = normalizeSpec(proposedInput);
  // A spec that keeps its `changes` list carries last month's decisions too; those are settled.
  const settled = new Set((currentInput.changes ?? []).map((c) => c.id));
  const changes = (proposedInput.changes ?? []).filter((c) => !settled.has(c.id));
  const diff = diffSpecs(current, proposed);
  const loose = unaccounted(diff, changes);
  const changed = Boolean(diff.collections.length || diff.operations.length || diff.links.length);
  const [before, after] = [unjustified(current), unjustified(proposed)];

  const summary = changed
    ? [
        `${changes.length} ${changes.length === 1 ? "change" : "changes"} proposed`,
        loose.length ? `**${loose.length} unaccounted for**` : "all accounted for",
        `unjustified columns: ${before === after ? after : `${before} → ${after}`}`,
      ].join(" · ")
    : "No change to the model.";
  const unaccountedSection = loose.length
    ? [
        "### ⚠️ Unaccounted for",
        "No change in the list claims these. They belong on a card, or they arrive unasked.",
        loose.map((l) => `- ${l}`).join("\n"),
      ].join("\n\n")
    : "";

  const markdown = [
    MARKER,
    `## ${line(proposed.title)}: proposed model changes`,
    summary,
    ...(changed ? changes.map((c) => section(c, diff)) : []),
    unaccountedSection,
  ].filter(Boolean).join("\n\n") + "\n";
  return { markdown, unaccounted: loose, changed };
}
