import { test } from "node:test";
import assert from "node:assert/strict";
import { diffMarkdown, MARKER } from "../src/markdown.mjs";
import { upsertComment, specAt } from "../action/run.mjs";
import { parseDiffArgs } from "../src/cli.mjs";
import { shop } from "./helpers.mjs";

function proposed() {
  const spec = shop();
  const orders = spec.collections.find((c) => c.name === "orders");
  orders.fields = orders.fields.filter((f) => f.name !== "shipping");
  orders.fields.push({ name: "ship_to", type: "text", required: true, why: "The delivery note." });
  orders.fields.push({ name: "notes", type: "text" });
  spec.changes = [
    {
      id: "P1",
      title: "Shipping address as a column",
      why: "A document holding exactly one field.",
      affects: { collections: ["orders"], fields: ["orders.shipping", "orders.ship_to"] },
    },
  ];
  return spec;
}

test("the review has one section per change and calls out what none accounts for", () => {
  const review = diffMarkdown(shop(), proposed());
  assert.ok(review.markdown.startsWith(MARKER));
  assert.equal(review.changed, true);
  assert.deepEqual(review.unaccounted, ["added field orders.notes"]);
  assert.match(review.markdown, /### P1 · Shipping address as a column/);
  assert.match(review.markdown, /\| − \| `orders.shipping` \|/);
  assert.match(review.markdown, /\| \+ \| `orders.ship_to` \| text \(required\) \|/);
  const card = review.markdown.split("### P1")[1].split("###")[0];
  assert.equal(card.includes("orders.notes"), false, "the loose column is not on the card");
  assert.match(review.markdown, /Unaccounted for[\s\S]*- added field orders\.notes/);
  // shop has one bare column, orders.shipping; the proposal removes it and adds orders.notes, bare.
  assert.match(review.markdown, /unjustified columns: 1 ·|unjustified columns: 1$/m);
  const worse = proposed();
  worse.collections.find((c) => c.name === "orders").fields.push({ name: "gift", type: "boolean" });
  assert.match(diffMarkdown(shop(), worse).markdown, /unjustified columns: 1 → 2/);
});

test("no change to the model says so and claims nothing", () => {
  const review = diffMarkdown(shop(), shop());
  assert.equal(review.changed, false);
  assert.deepEqual(review.unaccounted, []);
  assert.match(review.markdown, /No change to the model\./);
});

test("changes already in the base spec are settled, not reviewed again", () => {
  const base = { ...shop(), changes: [{ id: "P0", title: "Last month" }] };
  const next = { ...proposed(), changes: [{ id: "P0", title: "Last month" }, ...proposed().changes] };
  const review = diffMarkdown(base, next);
  assert.equal(review.markdown.includes("P0"), false);
  assert.match(review.markdown, /1 change proposed/);
});

test("an @name in spec text does not notify anyone", () => {
  const spec = proposed();
  spec.changes[0].why = "Ask @someone or @org/team.";
  const text = diffMarkdown(shop(), spec).markdown;
  assert.equal(/@[\w]/.test(text), false);
  assert.match(text, /@\u200bsomeone/);
});

test("text from the spec cannot break the table", () => {
  const spec = proposed();
  spec.changes[0].title = "a | b\nc";
  assert.match(diffMarkdown(shop(), spec).markdown, /### P1 · a \\\| b c/);
});

function fakeGitHub(comments) {
  const calls = [];
  const fetchImpl = async (url, { method, body }) => {
    calls.push({ method, url, body: body && JSON.parse(body).body });
    return { ok: true, json: async () => (method === "GET" ? comments : {}) };
  };
  return { calls, fetchImpl };
}

test("the comment is created once, then edited in place", async () => {
  const options = { body: `${MARKER}\nnew`, repo: "o/r", issue: 7, token: "t", api: "https://gh" };
  const fresh = fakeGitHub([{ id: 1, body: "someone else" }]);
  assert.equal(await upsertComment({ ...options, fetchImpl: fresh.fetchImpl }), "created");
  assert.deepEqual(fresh.calls.at(-1), { method: "POST", url: "https://gh/repos/o/r/issues/7/comments", body: `${MARKER}\nnew` });

  const bot = { type: "Bot" };
  const again = fakeGitHub([{ id: 1, body: "someone else" }, { id: 2, body: `${MARKER}\nold`, user: bot }]);
  assert.equal(await upsertComment({ ...options, fetchImpl: again.fetchImpl }), "updated");
  assert.equal(again.calls.at(-1).method, "PATCH");
  assert.equal(again.calls.at(-1).url, "https://gh/repos/o/r/issues/comments/2");

  // Anyone can start a comment with the marker; only the bot's own comment is edited.
  const spoof = fakeGitHub([{ id: 3, body: `${MARKER}\nfake`, user: { type: "User" } }]);
  assert.equal(await upsertComment({ ...options, fetchImpl: spoof.fetchImpl }), "created");
  assert.equal(spoof.calls.some((c) => c.method === "PATCH"), false);

  const quiet = fakeGitHub([]);
  assert.equal(await upsertComment({ ...options, skipWhenAbsent: true, fetchImpl: quiet.fetchImpl }), "skipped");
  assert.equal(quiet.calls.length, 1, "only looked, never posted");
});

test("a spec the pull request creates is compared against an empty one", () => {
  const missing = (...args) => {
    if (args[0] === "show") throw Object.assign(new Error("x"), { stderr: "path 'docs/m.json' does not exist in 'abc'" });
    return "";
  };
  assert.deepEqual(specAt("abc", "./docs/m.json", missing), { schemacase: 1, collections: [] });
  const present = (...args) => (args[0] === "show" ? `{"schemacase":1,"collections":[],"seen":"${args[1]}"}` : "");
  assert.equal(specAt("abc", "docs\\m.json", present).seen, "abc:docs/m.json");
  assert.throws(() => specAt("--output=/tmp/x", "m.json", present), /not a commit/, "a ref must not read as an option");
});

test("diff arguments", () => {
  assert.deepEqual(parseDiffArgs(["a.json", "b.json", "--fail-on-unaccounted"]), {
    current: "a.json", proposed: "b.json", out: "", failOnUnaccounted: true,
  });
  assert.throws(() => parseDiffArgs(["a.json"]), /usage:/);
});
