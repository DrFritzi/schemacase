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
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const USAGE = [
  "usage: schemacase <spec.json> [--proposal <spec.json>] [-o page.html]",
  "       schemacase import prisma <schema.prisma> [-o spec.json]",
  "       schemacase import postgres <connection-url> [--schema public] [-o spec.json]",
  "       schemacase diff <current.json> <proposed.json> [-o review.md] [--fail-on-unaccounted]",
].join("\n");

/** Flags that take a value, and the key each one fills. */
const FLAGS = { "-o": "out", "--out": "out", "--proposal": "proposal", "--schema": "schema" };
/** Flags that stand alone. */
const SWITCHES = { "--fail-on-unaccounted": "failOnUnaccounted" };

function scan(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (SWITCHES[argv[i]]) {
      flags[SWITCHES[argv[i]]] = true;
    } else if (FLAGS[argv[i]]) {
      flags[FLAGS[argv[i]]] = argv[i + 1] ?? "";
      i += 1;
    } else {
      positional.push(argv[i]);
    }
  }
  return { flags, positional };
}

/** The render command's arguments. */
export function parseArgs(argv) {
  const { flags, positional } = scan(argv);
  const spec = positional[0] ?? "";
  if (!spec) throw new Error(USAGE);
  return {
    spec,
    html: flags.out || spec.replace(/\.json$/i, "") + ".html",
    proposal: flags.proposal ?? "",
  };
}

/** The import command's arguments: `import <source> <input>`. */
export function parseImportArgs(argv) {
  const { flags, positional } = scan(argv);
  const [source, input] = positional;
  if (!["prisma", "postgres"].includes(source) || !input) throw new Error(USAGE);
  return { source, input, out: flags.out ?? "", schema: flags.schema || "public" };
}

/** The diff command's arguments. */
export function parseDiffArgs(argv) {
  const { flags, positional } = scan(argv);
  const [current, proposed] = positional;
  if (!current || !proposed) throw new Error(USAGE);
  return { current, proposed, out: flags.out ?? "", failOnUnaccounted: flags.failOnUnaccounted === true };
}

const here = (p) => resolve(process.cwd(), p);

async function render(argv) {
  const { spec, html, proposal } = parseArgs(argv);
  const { renderHtml } = await import("./render.mjs");
  const read = (p) => JSON.parse(readFileSync(here(p), "utf8"));
  writeFileSync(here(html), await renderHtml(read(spec), proposal ? read(proposal) : null), "utf8");
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
  const read = (p) => JSON.parse(readFileSync(here(p), "utf8"));
  const review = diffMarkdown(read(current), read(proposed));
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

/**
 * Run only when started as a program, not when imported by the tests. Installed, the program is
 * reached through a symlink in node_modules/.bin, so compare the resolved path.
 */
function isEntryPoint() {
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1] ?? "")).href;
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
