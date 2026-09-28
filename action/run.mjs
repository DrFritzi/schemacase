/**
 * The GitHub Action: review a pull request's change to a spec and post it as one comment.
 *
 * Reads the spec as it is on the base commit and as the pull request proposes it, renders the
 * Markdown review, writes it to the job summary, and keeps one pull-request comment current: a
 * later run edits the comment it finds by marker instead of adding another, so a busy pull
 * request carries one review, not a scroll of stale ones.
 *
 * Plain Node with fetch and git, nothing to install, so the step is fast on any runner.
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { isMain } from "../src/entry.mjs";
import { MARKER, diffMarkdown } from "../src/markdown.mjs";

/**
 * @param {{ body: string, repo: string, issue: number, token: string, api?: string,
 *           skipWhenAbsent?: boolean, fetchImpl?: typeof fetch }} options
 * @returns {Promise<"created" | "updated" | "skipped">}
 */
export async function upsertComment({ body, repo, issue, token, api = "https://api.github.com", skipWhenAbsent = false, fetchImpl = fetch }) {
  const call = async (method, path, payload) => {
    const response = await fetchImpl(`${api}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
      },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    if (!response.ok) throw new Error(`GitHub ${method} ${path}: ${response.status} ${await response.text()}`);
    return response.json();
  };

  let existing = null;
  for (let page = 1; !existing; page += 1) {
    const comments = await call("GET", `/repos/${repo}/issues/${issue}/comments?per_page=100&page=${page}`);
    // Only a bot's comment is ours to edit: anyone can post a comment that starts with the marker.
    existing = comments.find((c) => c.user?.type === "Bot" && String(c.body ?? "").startsWith(MARKER)) ?? null;
    if (comments.length < 100) break;
  }
  if (existing) {
    await call("PATCH", `/repos/${repo}/issues/comments/${existing.id}`, { body });
    return "updated";
  }
  if (skipWhenAbsent) return "skipped";
  await call("POST", `/repos/${repo}/issues/${issue}/comments`, { body });
  return "created";
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

/** The spec at the base commit; a spec the pull request creates is compared against nothing. */
export function specAt(ref, path, run = git) {
  // Passed to git as an argument, so it must not be able to read as an option.
  if (!/^[\w./^~-]+$/.test(ref) || ref.startsWith("-")) throw new Error(`schemacase: not a commit: ${ref}`);
  const file = path.replace(/\\/g, "/").replace(/^\.\//, "");
  try {
    run("cat-file", "-e", `${ref}^{commit}`);
  } catch {
    run("fetch", "--no-tags", "--depth=1", "origin", ref);
  }
  try {
    return JSON.parse(run("show", `${ref}:${file}`));
  } catch (error) {
    if (/does not exist|exists on disk, but not in/.test(String(error.stderr ?? error.message))) {
      return { schemacase: 1, collections: [] };
    }
    throw error;
  }
}

/**
 * A pull request from a fork runs with a read-only token, so the comment is refused; the review is
 * already in the job summary, so that is a warning, not a failed check.
 */
async function comment(options) {
  try {
    console.log(`schemacase: comment ${await upsertComment(options)}`);
  } catch (error) {
    if (!/: 403 /.test(error.message)) throw error;
    console.log(`::warning::schemacase: no permission to comment (a fork?); the review is in the job summary`);
  }
}

const input = (name, fallback = "") => process.env[`INPUT_${name.toUpperCase().replace(/-/g, "_")}`]?.trim() || fallback;

function output(name, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

async function main() {
  const env = process.env;
  const event = env.GITHUB_EVENT_PATH ? JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8")) : {};
  const pr = event.pull_request;
  const spec = input("spec");
  if (!spec) throw new Error("schemacase: the spec input is required");
  const base = input("base", pr?.base?.sha ?? "");
  if (!base) throw new Error("schemacase: no base commit; set the base input outside pull_request events");

  const current = specAt(base, spec);
  const proposed = JSON.parse(readFileSync(input("proposal", spec), "utf8"));
  const review = diffMarkdown(current, proposed);

  const file = join(env.RUNNER_TEMP ?? ".", "schemacase-review.md");
  writeFileSync(file, review.markdown, "utf8");
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, review.markdown);
  output("changed", review.changed);
  output("unaccounted", review.unaccounted.length);
  output("review-file", file);

  if (input("comment", "true") === "true" && pr) {
    await comment({
      body: review.markdown,
      repo: env.GITHUB_REPOSITORY,
      issue: pr.number,
      token: input("token", env.GITHUB_TOKEN),
      api: env.GITHUB_API_URL,
      // A pull request that does not touch the model gets no comment, unless it once had one.
      skipWhenAbsent: !review.changed,
    });
  }
  if (input("fail-on-unaccounted", "false") === "true" && review.unaccounted.length) {
    throw new Error(`schemacase: ${review.unaccounted.length} change(s) unaccounted for:\n  ${review.unaccounted.join("\n  ")}`);
  }
}

if (isMain(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
