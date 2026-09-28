/**
 * The spec is the whole input. schemacase never reads a database, calls a server or knows which
 * project it is describing — everything it draws arrives in one file, the way a renderer for an
 * OpenAPI document only ever sees the document.
 *
 * Vocabulary is deliberately domain-free: a *collection* holds *fields*, a *link* joins two
 * collections, an *operation* takes *inputs*, and a *group* is the editorial grouping of those.
 * Whether a collection is a Postgres table or something else is the emitter's business.
 */

export const SPEC_VERSION = 1;

/**
 * The page is the diagram, so the only prose it can carry is its own name and what to call the
 * two kinds of thing on it. A lede and a footer had nowhere left to go.
 */
const TEXT = {
  title: "Data model",
  collectionsLabel: "Collections",
  operationsLabel: "Operations",
};

function fail(message) {
  throw new Error(`spec: ${message}`);
}

function requireArray(spec, key) {
  const value = spec[key];
  if (!Array.isArray(value)) fail(`"${key}" must be an array`);
  return value;
}

/**
 * A note keyed by column name applies to every collection that has one (`*.project_id`), an exact
 * key wins over it (`orders.status`). Structural columns carry the same reason in every table, and
 * writing it once is the difference between one statement and one chance per table to disagree.
 */
function noteFor(notes, collection, field) {
  return notes[`${collection}.${field}`] ?? notes[`*.${field}`] ?? null;
}

function normalizeNotes(notes) {
  if (notes === undefined) return {};
  if (!notes || typeof notes !== "object" || Array.isArray(notes)) {
    fail('"fieldNotes" must be an object keyed "collection.field" or "*.field"');
  }
  return notes;
}

/**
 * `why` and `usedBy` are the case for a column existing: why the value is kept at all and in this
 * shape, and which requirement needs it. Both are optional in the format and deliberately not
 * defaulted to anything reassuring — a column with neither is reported as unjustified rather than
 * quietly passing, because that report is the work list.
 *
 * An empty value on the field falls through to the note rather than blocking it: an importer
 * writes `"why": ""` on every column, and that means "not yet", not "deliberately nothing".
 */
function normalizeField(field, where, notes = {}, collection = "") {
  if (!field?.name) fail(`${where} has a field without a name`);
  const note = noteFor(notes, collection, field.name);
  const usedBy = field.usedBy?.length ? field.usedBy : note?.usedBy ?? [];
  return {
    name: String(field.name),
    type: String(field.type ?? ""),
    key: field.key === true,
    required: field.required === true,
    document: field.document === true,
    why: String(field.why || note?.why || ""),
    usedBy: usedBy.map(String),
  };
}

function normalizeCollection(collection, notes) {
  if (!collection?.name) fail("a collection has no name");
  const where = `collection "${collection.name}"`;
  return {
    name: String(collection.name),
    fields: (collection.fields ?? []).map((f) => normalizeField(f, where, notes, collection.name)),
  };
}

function normalizeOperation(operation) {
  if (!operation?.name) fail("an operation has no name");
  return {
    name: String(operation.name),
    summary: String(operation.summary ?? ""),
    inputs: (operation.inputs ?? []).map((input) => {
      if (!input?.name) fail(`operation "${operation.name}" has an input without a name`);
      return {
        name: String(input.name),
        type: String(input.type ?? ""),
        required: input.required === true,
      };
    }),
  };
}

function normalizeLink(link) {
  if (!link?.from || !link?.to) fail("a link needs both from and to");
  return {
    from: String(link.from),
    to: String(link.to),
    strong: link.strong === true,
    // Whether the child may exist without the parent — the difference between "exactly one" and
    // "zero or one" where the relationship meets the parent in crow's foot notation.
    optional: link.optional === true,
    via: String(link.via ?? ""),
  };
}

const SYSTEM_KINDS = new Set(["external", "internal", "store"]);

/** A system is anything that is not a store of this model: a client, a service, a database. */
function normalizeSystem(system) {
  if (!system?.name) fail("a system has no name");
  const kind = String(system.kind ?? "internal");
  if (!SYSTEM_KINDS.has(kind)) {
    fail(`system "${system.name}" has kind "${kind}", expected one of ${[...SYSTEM_KINDS].join(", ")}`);
  }
  return { name: String(system.name), kind, blurb: String(system.blurb ?? "") };
}

/** Data crossing between a system and an area, or between two systems. */
function normalizeFlow(flow) {
  if (!flow?.from || !flow?.to) fail("a flow needs both from and to");
  return { from: String(flow.from), to: String(flow.to), label: String(flow.label ?? "") };
}

function normalizeGroup(group) {
  if (!group?.name) fail("a group has no name");
  return {
    name: String(group.name),
    blurb: String(group.blurb ?? ""),
    collections: (group.collections ?? []).map(String),
    operations: (group.operations ?? []).map(String),
  };
}

/**
 * Reject a spec that cannot be drawn, and fill in what the emitter left out, so the renderer
 * downstream can assume every field exists.
 *
 * @param {object} spec
 * @returns {object} the same shape with defaults applied
 */
export function normalizeSpec(spec) {
  if (!spec || typeof spec !== "object") fail("expected an object");
  if (spec.schemacase !== SPEC_VERSION) {
    fail(`unsupported version ${JSON.stringify(spec.schemacase)}, expected ${SPEC_VERSION}`);
  }

  const notes = normalizeNotes(spec.fieldNotes);
  const collections = requireArray(spec, "collections").map((c) => normalizeCollection(c, notes));
  const known = new Set(collections.map((c) => c.name));
  const links = (spec.links ?? []).map(normalizeLink);
  for (const link of links) {
    if (!known.has(link.from)) fail(`link points from unknown collection "${link.from}"`);
    if (!known.has(link.to)) fail(`link points to unknown collection "${link.to}"`);
  }

  const text = Object.fromEntries(
    Object.entries(TEXT).map(([key, fallback]) => [key, String(spec[key] ?? fallback)])
  );

  return {
    ...text,
    collections,
    links,
    operations: (spec.operations ?? []).map(normalizeOperation),
    groups: (spec.groups ?? []).map(normalizeGroup),
    systems: (spec.systems ?? []).map(normalizeSystem),
    flows: (spec.flows ?? []).map(normalizeFlow),
  };
}
