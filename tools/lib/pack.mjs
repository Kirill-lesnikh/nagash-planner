// Minimal reader for Total War PFH5 .pack files (Warhammer III).
// Reads the file index and extracts individual packed files, decompressing them when needed.
import fs from "node:fs";
import zlib from "node:zlib";

const FLAG_INDEX_HAS_TIMESTAMPS = 0x40;
const FLAG_ENCRYPTED_INDEX = 0x80;
const FLAG_BIG_HEADER = 0x100;

export class Pack {
  constructor(path) {
    this.path = path;
    this.fd = fs.openSync(path, "r");
    this.#readIndex();
  }

  #read(pos, len) {
    const buf = Buffer.alloc(len);
    fs.readSync(this.fd, buf, 0, len, pos);
    return buf;
  }

  #readIndex() {
    const h = this.#read(0, 48);
    const magic = h.toString("latin1", 0, 4);
    if (magic !== "PFH5") throw new Error(`${this.path}: unsupported pack version ${magic}`);
    const flags = h.readUInt32LE(4);
    if (flags & FLAG_ENCRYPTED_INDEX) throw new Error(`${this.path}: encrypted index not supported`);
    const depCount = h.readUInt32LE(8);
    const depSize = h.readUInt32LE(12);
    const fileCount = h.readUInt32LE(16);
    const fileIndexSize = h.readUInt32LE(20);
    const headerSize = flags & FLAG_BIG_HEADER ? 48 : 28;

    const idx = this.#read(headerSize + depSize, fileIndexSize);
    const hasTs = (flags & FLAG_INDEX_HAS_TIMESTAMPS) !== 0;
    let p = 0;
    let dataPos = headerSize + depSize + fileIndexSize;
    this.files = new Map();
    for (let i = 0; i < fileCount; i++) {
      const size = idx.readUInt32LE(p); p += 4;
      if (hasTs) p += 4;
      const compressed = idx[p] !== 0; p += 1;
      const end = idx.indexOf(0, p);
      const name = idx.toString("utf8", p, end).replaceAll("\\", "/");
      p = end + 1;
      this.files.set(name.toLowerCase(), { name, size, compressed, offset: dataPos });
      dataPos += size;
    }
    this.depCount = depCount;
  }

  list(filter = () => true) {
    return [...this.files.values()].filter((f) => filter(f.name));
  }

  has(name) {
    return this.files.has(name.toLowerCase());
  }

  read(name) {
    const f = this.files.get(name.toLowerCase());
    if (!f) throw new Error(`${name} not found in ${this.path}`);
    const raw = this.#read(f.offset, f.size);
    return f.compressed ? decompress(raw, f.name) : raw;
  }

  close() {
    fs.closeSync(this.fd);
  }
}

// Compressed entries start with a u32 uncompressed size followed by a zstd frame,
// an lz4 frame, or legacy LZMA1 ("lzma alone") data.
export function decompress(raw, name = "") {
  const out = raw.readUInt32LE(0);
  const body = raw.subarray(4);
  const magic = body.readUInt32LE(0);
  if (magic === 0xfd2fb528) return zlib.zstdDecompressSync(body);
  if (magic === 0x184d2204) throw new Error(`${name}: lz4 compression not supported`);
  throw new Error(`${name}: unknown compression (size ${out}, magic 0x${magic.toString(16)})`);
}
