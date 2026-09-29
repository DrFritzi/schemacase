import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * True when the module at `metaUrl` (its import.meta.url) is the program being run, not imported.
 * Installed, the program is reached through a symlink in node_modules/.bin, so the resolved path
 * is compared.
 */
export function isMain(metaUrl) {
  try {
    return metaUrl === pathToFileURL(realpathSync(process.argv[1] ?? "")).href;
  } catch {
    return false;
  }
}
