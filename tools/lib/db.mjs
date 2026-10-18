// Decodes Total War: Warhammer III binary DB tables and .loc files.
import { findDefinition } from "./schema.mjs";

// Header markers, as little-endian u32 (bytes FD FE FC FF and FC FD FE FF on disk).
const GUID_MARKER = 0xfffcfefd;
const VERSION_MARKER = 0xfffefdfc;

class Reader {
  constructor(buf) {
    this.buf = buf;
    this.p = 0;
  }
  u8() { return this.buf[this.p++]; }
  bool() { return this.u8() !== 0; }
  u16() { const v = this.buf.readUInt16LE(this.p); this.p += 2; return v; }
  u32() { const v = this.buf.readUInt32LE(this.p); this.p += 4; return v; }
  i16() { const v = this.buf.readInt16LE(this.p); this.p += 2; return v; }
  i32() { const v = this.buf.readInt32LE(this.p); this.p += 4; return v; }
  i64() { const v = this.buf.readBigInt64LE(this.p); this.p += 8; return Number(v); }
  f32() { const v = this.buf.readFloatLE(this.p); this.p += 4; return Math.round(v * 1e5) / 1e5; }
  f64() { const v = this.buf.readDoubleLE(this.p); this.p += 8; return v; }
  str8() { const n = this.u16(); const s = this.buf.toString("utf8", this.p, this.p + n); this.p += n; return s; }
  str16() { const n = this.u16() * 2; const s = this.buf.toString("utf16le", this.p, this.p + n); this.p += n; return s; }
  get done() { return this.p >= this.buf.length; }
}

const readers = {
  Boolean: (r) => r.bool(),
  I16: (r) => r.i16(),
  I32: (r) => r.i32(),
  I64: (r) => r.i64(),
  F32: (r) => r.f32(),
  F64: (r) => r.f64(),
  StringU8: (r) => r.str8(),
  StringU16: (r) => r.str16(),
  OptionalStringU8: (r) => (r.bool() ? r.str8() : ""),
  OptionalStringU16: (r) => (r.bool() ? r.str16() : ""),
  ColourRGB: (r) => r.u32().toString(16).padStart(6, "0"),
};

export function decodeTable(buf, table, defs) {
  const r = new Reader(buf);
  let version = 0;
  if (buf.readUInt32LE(0) === GUID_MARKER) {
    r.p = 4;
    r.str16();
  }
  if (buf.readUInt32LE(r.p) === VERSION_MARKER) {
    r.p += 4;
    version = r.u32();
  }
  r.bool();
  const count = r.u32();
  const def = findDefinition(defs, table, version);
  const fns = def.fields.map((f) => {
    const fn = readers[f.type];
    if (!fn) throw new Error(`${table}: unsupported field type ${f.type}`);
    return [f.name, fn];
  });
  const rows = [];
  for (let i = 0; i < count; i++) {
    const row = {};
    for (const [name, fn] of fns) row[name] = fn(r);
    rows.push(row);
  }
  if (!r.done) throw new Error(`${table} v${version}: ${buf.length - r.p} trailing bytes, schema mismatch`);
  return { version, fields: def.fields.map((f) => f.name), rows };
}

// .loc: "\xFF\xFELOC\0" header, u32 version, u32 count, then (StringU16 key, StringU16 text, bool tooltip) entries.
export function decodeLoc(buf) {
  const r = new Reader(buf);
  if (buf.toString("latin1", 2, 5) !== "LOC") throw new Error("not a loc file");
  r.p = 6;
  r.u32();
  const count = r.u32();
  const out = new Map();
  for (let i = 0; i < count; i++) {
    const key = r.str16();
    const text = r.str16();
    r.bool();
    out.set(key, text);
  }
  return out;
}
