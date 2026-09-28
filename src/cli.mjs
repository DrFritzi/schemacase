#!/usr/bin/env node
/**
 *   schemacase <spec.json> [--proposal <spec.json>] [-o page.html]
 *   schemacase import prisma <schema.prisma> [-o spec.json]
 *   schemacase import postgres <connection-url> [--schema public] [-o spec.json]
 *   schemacase diff <current.json> <proposed.json> [-o review.md] [--fail-on-unaccounted]
 *
 * Rendering without -o puts the page beside the spec, under the same name. Importing without -o
 * prints the spec, so it can be piped or redirected; so does diff, with its Markdown review.
 *
 * Each command loads only what it needs: an import never pulls in the layout engine, and a render
 * never needs a database driver.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs as parse } from "node:util";
import { isMain } from "./entry.mjs";

const USAGE = [
  "usage: schemacase <spec.json> [--proposal <spec.json>] [-o page.html]",
  "       schemacase import prisma <schema.prisma> [-o spec.json]",
  "       schemacase import postgres <connection-url> [--schema public] [-o spec.json]",
  "       schemacase diff <current.json> <proposed.json> [-o review.md] [--fail-on-unaccounted]",
].join("\n");

function scan(argv) {
  try {
    return parse({
      args: argv,
      allowPositionals: true,
      options: {
        out: { type: "string", short: "o" },
        proposal: { type: "string" },
        schema: { type: "string" },
        "fail-on-unaccounted": { type: "boolean" },
      },
    });
  } catch (error) {
    throw new Error(`${error.message}\n${USAGE}`);
  }
}

/** The render command's arguments. */
export function parseArgs(argv) {
  const { values, positionals: [spec] } = scan(argv);
  if (!spec) throw new Error(USAGE);
  return { spec, html: values.out || spec.replace(/\.json$/i, "") + ".html", proposal: values.proposal ?? "" };
}

/** The import command's arguments: `import <source> <input>`. */
export function parseImportArgs(argv) {
  const { values, positionals: [source, input] } = scan(argv);
  if (!["prisma", "postgres"].includes(source) || !input) throw new Error(USAGE);
  return { source, input, out: values.out ?? "", schema: values.schema || "public" };
}

/** The diff command's arguments. */
export function parseDiffArgs(argv) {
  const { values, positionals: [current, proposed] } = scan(argv);
  if (!current || !proposed) throw new Error(USAGE);
  return { current, proposed, out: values.out ?? "", failOnUnaccounted: values["fail-on-unaccounted"] === true };
}

const here = (p) => resolve(process.cwd(), p);
const readJson = (p) => JSON.parse(readFileSync(here(p), "utf8"));

async function render(argv) {
  const { spec, html, proposal } = parseArgs(argv);
  const { renderHtml } = await import("./render.mjs");
  writeFileSync(here(html), await renderHtml(readJson(spec), proposal ? readJson(proposal) : null), "utf8");
  console.log(`wrote ${here(html)}`);
}

async function importSpec(argv) {
  const { source, input, out, schema } = parseImportArgs(argv);
  let spec;
  if (source === "prisma") {
    const { importPrisma } = await import("./import/prisma.mjs");
    spec = importPrisma(readFileSync(here(input), "utf8"));
  } else {
    const { importPostgres } = await import("./import/postgres.mjs");
    spec = await importPostgres({ connectionString: input, schema });
  }
  const json = JSON.stringify(spec, null, 2) + "\n";
  if (!out) {
    process.stdout.write(json);
    return;
  }
  writeFileSync(here(out), json, "utf8");
  const columns = spec.collections.reduce((n, c) => n + c.fields.length, 0);
  console.error(`wrote ${here(out)}: ${spec.collections.length} collections, ${columns} columns to justify`);
}

async function diff(argv) {
  const { current, proposed, out, failOnUnaccounted } = parseDiffArgs(argv);
  const { diffMarkdown } = await import("./markdown.mjs");
  const review = diffMarkdown(readJson(current), readJson(proposed));
  if (out) writeFileSync(here(out), review.markdown, "utf8");
  else process.stdout.write(review.markdown);
  if (failOnUnaccounted && review.unaccounted.length) {
    throw new Error(`${review.unaccounted.length} change(s) unaccounted for`);
  }
}

export async function main(argv) {
  if (argv[0] === "-h" || argv[0] === "--help") {
    console.log(USAGE);
    return;
  }
  if (argv[0] === "import") return importSpec(argv.slice(1));
  if (argv[0] === "diff") return diff(argv.slice(1));
  return render(argv);
}

if (isMain(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
