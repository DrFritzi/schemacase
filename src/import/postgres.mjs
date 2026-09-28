/**
 * A Postgres schema as a schemacase spec: tables, columns, primary keys and foreign keys, read from
 * the catalogue of a live database.
 *
 * Every column arrives with an empty `why` and `usedBy`. That is the point rather than a gap: the
 * database can say what is stored, never why, so an imported spec opens as the full work list —
 * every column unjustified until someone writes its case, in the spec or in `fieldNotes`.
 *
 * `pg` is an optional peer dependency, loaded only when this runs, so rendering never needs it.
 */

/** Base tables and their columns, in the order they were declared. */
export const COLUMNS_SQL = `
  select c.table_name, c.column_name, c.data_type, c.udt_name, c.is_nullable
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema and t.table_name = c.table_name
  where c.table_schema = $1 and t.table_type = 'BASE TABLE'
  order by c.table_name, c.ordinal_position`;

/**
 * Primary and foreign keys with their columns in key order. Read from pg_constraint rather than
 * information_schema because only the catalogue says reliably which table a foreign key points at
 * and what happens on delete.
 */
export const CONSTRAINTS_SQL = `
  select con.contype::text as kind, cl.relname::text as table_name,
    array(
      select a.attname::text
      from unnest(con.conkey) with ordinality k(num, ord)
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.num
      order by k.ord
    ) as columns,
    ref.relname::text as ref_table, refns.nspname::text as ref_schema,
    con.confdeltype::text as on_delete
  from pg_constraint con
  join pg_class cl on cl.oid = con.conrelid
  join pg_namespace ns on ns.oid = cl.relnamespace
  left join pg_class ref on ref.oid = con.confrelid
  left join pg_namespace refns on refns.oid = ref.relnamespace
  where ns.nspname = $1 and con.contype in ('p', 'f')
  order by cl.relname, con.conname`;

const DOCUMENT_TYPES = new Set(["json", "jsonb"]);

function columnType(row) {
  if (row.data_type === "ARRAY") return `${String(row.udt_name).replace(/^_/, "")}[]`;
  if (row.data_type === "USER-DEFINED") return String(row.udt_name);
  return String(row.data_type);
}

/**
 * The pure half: catalogue rows in, spec out. Kept apart from the query so it can be tested
 * without a database.
 *
 * @param {{ columns: object[], constraints: object[] }} rows
 * @param {{ schema?: string, title?: string }} [options]
 */
export function rowsToSpec({ columns, constraints }, { schema = "public", title } = {}) {
  const keys = new Map();
  for (const c of constraints.filter((row) => row.kind === "p")) keys.set(c.table_name, new Set(c.columns));

  const tables = new Map();
  for (const row of columns) {
    if (!tables.has(row.table_name)) tables.set(row.table_name, []);
    const type = columnType(row);
    tables.get(row.table_name).push({
      name: row.column_name,
      type,
      key: keys.get(row.table_name)?.has(row.column_name) ?? false,
      required: row.is_nullable === "NO",
      ...(DOCUMENT_TYPES.has(row.udt_name) ? { document: true } : {}),
      why: "",
      usedBy: [],
    });
  }

  const links = constraints
    .filter((c) => c.kind === "f" && c.ref_schema === schema && tables.has(c.ref_table))
    .map((c) => {
      const fields = tables.get(c.table_name) ?? [];
      const nullable = c.columns.some((name) => !fields.find((f) => f.name === name)?.required);
      return {
        from: c.ref_table,
        to: c.table_name,
        via: c.columns.join(","),
        strong: c.on_delete === "c",
        optional: nullable,
      };
    });

  return {
    schemacase: 1,
    title: title ?? `${schema} schema`,
    collectionsLabel: "tables",
    collections: [...tables].map(([name, fields]) => ({ name, fields })),
    links,
  };
}

async function loadPg() {
  try {
    return (await import("pg")).default;
  } catch {
    throw new Error('import postgres: the "pg" package is needed for this, install it with `npm i -D pg`');
  }
}

/**
 * @param {{ connectionString?: string, schema?: string, title?: string, client?: object }} options
 *   pass `client` (anything with `query(sql, params)`) to reuse a connection you already hold
 */
export async function importPostgres({ connectionString, schema = "public", title, client } = {}) {
  let own = null;
  if (!client) {
    const pg = await loadPg();
    own = new pg.Client({ connectionString });
    await own.connect();
  }
  const db = client ?? own;
  try {
    const columns = (await db.query(COLUMNS_SQL, [schema])).rows;
    const constraints = (await db.query(CONSTRAINTS_SQL, [schema])).rows;
    if (!columns.length) throw new Error(`import postgres: no tables in schema "${schema}"`);
    return rowsToSpec({ columns, constraints }, { schema, title });
  } finally {
    await own?.end();
  }
}
