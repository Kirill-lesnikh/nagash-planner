import type { TreeIndex } from "./tree";

// Share-link format (docs/data-model.md): "<dataVersion>.<base64url(payload)>",
// payload = [encoding version byte, then u16 big-endian node indices in allocation order].
const ENCODING_VERSION = 1;

export const dataVersionId = (gameVersion: string) => gameVersion.replace(/\./g, "");

function toBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const s = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export function encodeBuild(index: TreeIndex, allocated: string[]): string {
  const bytes = new Uint8Array(1 + allocated.length * 2);
  bytes[0] = ENCODING_VERSION;
  allocated.forEach((key, i) => {
    const pos = index.position.get(key)!;
    bytes[1 + i * 2] = pos >> 8;
    bytes[2 + i * 2] = pos & 0xff;
  });
  return `${dataVersionId(index.data.gameVersion)}.${toBase64Url(bytes)}`;
}

/** Decodes a share string. Returns null if it is malformed or made for a different data version. */
export function decodeBuild(index: TreeIndex, encoded: string): string[] | null {
  const [version, payload] = encoded.split(".");
  if (version !== dataVersionId(index.data.gameVersion) || payload === undefined) return null;
  let bytes: Uint8Array;
  try {
    bytes = fromBase64Url(payload);
  } catch {
    return null;
  }
  if (bytes[0] !== ENCODING_VERSION || bytes.length % 2 !== 1) return null;
  const keys: string[] = [];
  for (let i = 1; i < bytes.length; i += 2) {
    const node = index.nodes[(bytes[i] << 8) | bytes[i + 1]];
    if (!node) return null;
    if (node.key !== index.start && !keys.includes(node.key)) keys.push(node.key);
  }
  return keys;
}
