#!/usr/bin/env node
/**
 *   schemacase <spec.json> [-o page.html]
 *
 * Without -o the page lands beside the spec, under the same name.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderHtml } from "./render.mjs";

const USAGE = "usage: schemacase <spec.json> [--proposal <spec.json>] [-o page.html]";

export function parseArgs(argv) {
  const out = { spec: "", html: "", proposal: "" };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "-o" || argv[i] === "--out") {
      out.html = argv[i + 1] ?? "";
      i += 1;
    } else if (argv[i] === "--proposal") {
      out.proposal = argv[i + 1] ?? "";
      i += 1;
    } else if (!out.spec) {
      out.spec = argv[i];
    }
  }
  if (!out.spec) throw new Error(USAGE);
  if (!out.html) out.html = out.spec.replace(/\.json$/i, "") + ".html";
  return out;
}

async function main(argv) {
  const { spec, html, proposal } = parseArgs(argv);
  const read = (p) => JSON.parse(readFileSync(resolve(process.cwd(), p), "utf8"));
  const target = resolve(process.cwd(), html);
  writeFileSync(target, await renderHtml(read(spec), proposal ? read(proposal) : null), "utf8");
  console.log(`wrote ${target}`);
}

if (import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1] ?? "").href) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
