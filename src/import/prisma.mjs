/**
 * A Prisma schema as a schemacase spec: models become collections, scalar fields become columns,
 * and relation fields that hold the foreign key become links.
 *
 * Like every importer, it leaves `why` and `usedBy` empty on purpose — the schema says what is
 * stored, the work list says what nobody has explained yet.
 *
 * A parser for the subset a data-model picture needs, not a Prisma implementation: blocks, field
 * lines, `@id`, `@@id`, `@relation(fields, references, onDelete)`. Anything else is read past.
 */

/** `model X {`, `enum Y {`, `type Z {` up to the closing brace on a line of its own. */
function blocks(source) {
  const out = [];
  const text = source.replace(/\/\/.*$/gm, "");
  const pattern = /^\s*(model|enum|type|view)\s+(\w+)\s*\{([\s\S]*?)^\s*\}/gm;
  for (const [, kind, name, body] of text.matchAll(pattern)) {
    out.push({ kind, name, lines: body.split("\n").map((l) => l.trim()).filter(Boolean) });
  }
  return out;
}

/** The argument list of `@name(...)`, balanced over nested brackets and parentheses. */
function attributeArgs(line, name) {
  const at = line.search(new RegExp(`@${name}\\(`));
  if (at < 0) return null;
  let depth = 0;
  const start = line.indexOf("(", at);
  for (let i = start; i < line.length; i += 1) {
    if (line[i] === "(" || line[i] === "[") depth += 1;
    if (line[i] === ")" || line[i] === "]") depth -= 1;
    if (depth === 0) return line.slice(start + 1, i);
  }
  return line.slice(start + 1);
}

const listArg = (args, key) =>
  (args?.match(new RegExp(`${key}\\s*:\\s*\\[([^\\]]*)\\]`))?.[1] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

function parseField(line) {
  const match = line.match(/^(\w+)\s+(Unsupported\("[^"]*"\)|\w+)(\[\])?(\?)?(.*)$/);
  if (!match) return null;
  const [, name, type, list, optional, rest] = match;
  return { name, type, list: Boolean(list), optional: Boolean(optional), rest };
}

/** `@@id([a, b])` — the columns of a composite primary key. */
function compositeKey(lines) {
  const names = lines.find((l) => l.startsWith("@@id("))?.match(/\[([^\]]*)\]/)?.[1] ?? "";
  return new Set(names.split(",").map((s) => s.trim().replace(/\(.*$/, "")).filter(Boolean));
}

const typeName = (type) => type.replace(/^Unsupported\("(.*)"\)$/, "$1");

function modelFields(block, kinds) {
  const primary = compositeKey(block.lines);
  const fields = [];
  const relations = [];
  for (const line of block.lines) {
    if (line.startsWith("@@")) continue;
    const field = parseField(line);
    if (!field) continue;
    if (kinds.get(field.type) === "model") {
      relations.push(field);
      continue;
    }
    fields.push({
      name: field.name,
      type: `${typeName(field.type)}${field.list ? "[]" : ""}`,
      key: /@id\b/.test(field.rest) || primary.has(field.name),
      required: !field.optional && !field.list,
      ...(field.type === "Json" || kinds.get(field.type) === "type" ? { document: true } : {}),
      why: "",
      usedBy: [],
    });
  }
  return { fields, relations };
}

/** Only the side that holds `fields:` owns the foreign key; the back-relation is not a column. */
function linkFor(model, relation) {
  const args = attributeArgs(relation.rest, "relation");
  const via = listArg(args, "fields");
  if (!via.length) return null;
  return {
    from: relation.type,
    to: model,
    via: via.join(","),
    strong: /onDelete\s*:\s*Cascade/.test(args ?? ""),
    optional: relation.optional,
  };
}

/**
 * @param {string} source the text of a schema.prisma file
 * @param {{ title?: string }} [options]
 * @returns {object} a schemacase spec
 */
export function importPrisma(source, { title = "Prisma schema" } = {}) {
  const all = blocks(String(source));
  const kinds = new Map(all.map((b) => [b.name, b.kind === "view" ? "model" : b.kind]));
  const models = all.filter((b) => b.kind === "model" || b.kind === "view");
  if (!models.length) throw new Error("import prisma: no models found");

  const collections = [];
  const links = [];
  for (const model of models) {
    const { fields, relations } = modelFields(model, kinds);
    collections.push({ name: model.name, fields });
    for (const relation of relations) {
      const link = linkFor(model.name, relation);
      if (link) links.push(link);
    }
  }
  return { schemacase: 1, title, collectionsLabel: "models", collections, links };
}
