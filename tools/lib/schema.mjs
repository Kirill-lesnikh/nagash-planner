// Loads table definitions from an RPFM schema file (schema_wh3.ron, https://github.com/Frodo45127/rpfm-schemas).
// Only what the DB decoder needs is kept: per table, per version, the ordered list of {name, type}.
import fs from "node:fs";

export function loadSchema(ronPath) {
  const lines = fs.readFileSync(ronPath, "utf8").split("\n");
  const defs = {};
  let table = null;
  let def = null;
  let field = null;
  let depth = 0; // nesting depth of fields: SequenceU32 types carry their own nested field lists
  for (const line of lines) {
    const t = line.trim();
    let m;
    if ((m = /^"(\w+)": \[$/.exec(t)) && line.startsWith("        \"")) {
      table = defs[m[1]] = [];
      continue;
    }
    if (!table) continue;
    if ((m = /^version: (\d+),$/.exec(t)) && line.startsWith("                version")) {
      def = { version: Number(m[1]), fields: [] };
      table.push(def);
      depth = 0;
      continue;
    }
    if (!def) continue;
    if (line.startsWith("                localised_fields")) {
      def = null;
      continue;
    }
    if ((m = /^name: "(.*)",$/.exec(t)) && line.startsWith("                        name")) {
      field = { name: m[1] };
      def.fields.push(field);
      continue;
    }
    if ((m = /^field_type: (.*?),?$/.exec(t)) && line.startsWith("                        field_type") && field) {
      field.type = m[1];
      if (field.type.startsWith("SequenceU")) depth++;
      continue;
    }
  }
  return defs;
}

export function findDefinition(defs, table, version) {
  const versions = defs[table];
  if (!versions) throw new Error(`schema has no definition for ${table}`);
  const def = versions.find((d) => d.version === version);
  if (!def) throw new Error(`schema has no version ${version} of ${table} (has ${versions.map((d) => d.version)})`);
  for (const f of def.fields) {
    if (f.type.startsWith("Sequence")) throw new Error(`${table}: sequence field ${f.name} not supported`);
  }
  return def;
}
