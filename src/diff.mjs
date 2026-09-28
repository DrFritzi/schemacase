/**
 * What one spec changes about another.
 *
 * A proposal is reviewed as a handful of decisions, not as a hundred field diffs — so the list of
 * changes is authored (each with an id you can say yes or no to) while the before/after under each
 * one is computed here. Same split as the model itself: the judgement is written down, the facts
 * are derived.
 */

const byName = (items) => new Map((items ?? []).map((i) => [i.name, i]));

function diffFields(before, after) {
  const a = byName(before?.fields);
  const b = byName(after?.fields);
  const names = [...new Set([...a.keys(), ...b.keys()])];
  return names
    .map((name) => {
      const from = a.get(name);
      const to = b.get(name);
      if (!from) return { name, status: "added", to };
      if (!to) return { name, status: "removed", from };
      const same =
        from.type === to.type &&
        from.key === to.key &&
        from.required === to.required &&
        from.document === to.document;
      return same ? null : { name, status: "changed", from, to };
    })
    .filter(Boolean);
}

function diffNamed(before, after, compare) {
  const a = byName(before);
  const b = byName(after);
  const names = [...new Set([...a.keys(), ...b.keys()])].sort((x, y) => x.localeCompare(y));
  return names
    .map((name) => {
      const from = a.get(name);
      const to = b.get(name);
      if (!from) return { name, status: "added", to };
      if (!to) return { name, status: "removed", from };
      return compare(from, to, name);
    })
    .filter(Boolean);
}

const linkKey = (l) => `${l.from} → ${l.to}`;

/**
 * @param {object} current a normalized spec
 * @param {object} proposed a normalized spec
 * @returns {{ collections: object[], operations: object[], links: object[] }}
 */
export function diffSpecs(current, proposed) {
  const collections = diffNamed(current.collections, proposed.collections, (from, to, name) => {
    const fields = diffFields(from, to);
    return fields.length ? { name, status: "changed", fields } : null;
  }).map((entry) => (entry.status === "changed" ? entry : { ...entry, fields: diffFields(entry.from, entry.to) }));

  const operations = diffNamed(current.operations, proposed.operations, (from, to, name) => {
    const inputs = diffFields(
      { fields: from.inputs ?? [] },
      { fields: to.inputs ?? [] }
    );
    const summaryChanged = from.summary !== to.summary;
    if (!inputs.length && !summaryChanged) return null;
    return { name, status: "changed", inputs, from, to };
  });

  const before = new Map((current.links ?? []).map((l) => [linkKey(l), l]));
  const after = new Map((proposed.links ?? []).map((l) => [linkKey(l), l]));
  const links = [...new Set([...before.keys(), ...after.keys()])]
    .sort((x, y) => x.localeCompare(y))
    .map((key) => {
      const from = before.get(key);
      const to = after.get(key);
      if (!from) return { name: key, status: "added", to };
      if (!to) return { name: key, status: "removed", from };
      return from.strong === to.strong ? null : { name: key, status: "changed", from, to };
    })
    .filter(Boolean);

  return { collections, operations, links };
}

/**
 * Pick out the part of a diff one authored change is responsible for. A change names the
 * collections and operations it touches; anything it does not name stays out of its card, so a
 * card shows exactly what saying yes to it would do.
 */
export function slice(diff, affects = {}) {
  const wanted = (list) => new Set(list ?? []);
  const collections = wanted(affects.collections);
  const operations = wanted(affects.operations);
  const fields = wanted(affects.fields);

  // A change that lists fields is taken at its word, down to the field — two changes touching one
  // collection must not each show the other's rows. A change that names only collections has not
  // been that precise, so it gets the whole collection. Either way the columns a change *adds*
  // must be listed too, or the card shows only removals and reads as data loss.
  const keepFields = (entry) =>
    fields.size
      ? { ...entry, fields: (entry.fields ?? []).filter((f) => fields.has(`${entry.name}.${f.name}`)) }
      : entry;

  return {
    collections: diff.collections
      .filter((c) => collections.has(c.name) || (c.fields ?? []).some((f) => fields.has(`${c.name}.${f.name}`)))
      .map(keepFields)
      .filter((c) => c.status !== "changed" || c.fields.length),
    operations: diff.operations.filter((o) => operations.has(o.name)),
    links: diff.links.filter((entry) => {
      // The link as it was, or as it will be if it is new. `from` is the parent, `to` the child
      // that holds the foreign key in the columns named by `via`.
      const link = entry.from ?? entry.to;
      if (!fields.size) return collections.has(link.from) || collections.has(link.to);
      // Like the fields above: a change that lists columns owns a link only through its own
      // foreign-key column, not through every collection it happens to touch.
      return String(link.via).split(",").some((column) => fields.has(`${link.to}.${column.trim()}`));
    }),
  };
}

/**
 * Anything the authored change list does not account for — a proposal must not smuggle.
 *
 * Field-precise on purpose. A change that lists fields is held to that list even for a collection
 * it also names, because the alternative lets a forgotten column ride along invisibly: it would be
 * filtered off every card by `slice` and then excused here for belonging to a named collection.
 */
function claims(changes) {
  const whole = new Set();
  const fields = new Set();
  const collections = new Set();
  const operations = new Set();
  for (const change of changes ?? []) {
    const listed = change.affects?.fields ?? [];
    const detailed = new Set(listed.map((f) => f.slice(0, f.lastIndexOf("."))));
    for (const field of listed) fields.add(field);
    for (const name of change.affects?.collections ?? []) {
      collections.add(name);
      if (!detailed.has(name)) whole.add(name);
    }
    for (const name of change.affects?.operations ?? []) operations.add(name);
  }
  return { whole, fields, collections, operations };
}

export function unaccounted(diff, changes) {
  const {
    whole: wholeCollections,
    fields: namedFields,
    collections: namedCollections,
    operations: namedOperations,
  } = claims(changes);

  const loose = [];
  for (const entry of diff.collections) {
    if (entry.status !== "changed") {
      if (!namedCollections.has(entry.name)) loose.push(`${entry.status} collection ${entry.name}`);
      continue;
    }
    if (wholeCollections.has(entry.name)) continue;
    for (const field of entry.fields ?? []) {
      const key = `${entry.name}.${field.name}`;
      if (!namedFields.has(key)) loose.push(`${field.status} field ${key}`);
    }
  }
  for (const operation of diff.operations) {
    if (!namedOperations.has(operation.name)) {
      loose.push(`${operation.status} operation ${operation.name}`);
    }
  }
  return loose;
}
