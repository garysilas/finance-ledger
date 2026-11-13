import { createHash } from "node:crypto";

// Canonical request encoding: UTF-8 JSON with recursively sorted object
// keys. Bigints encode as decimal strings. Undefined values inside
// objects are rejected (omission must already be canonicalized to null);
// undefined array entries encode as null like JSON.stringify.
export function canonicalJson(value: unknown): string {
  return encode(value);
}

function encode(value: unknown): string {
  if (value === null) {
    return "null";
  }
  switch (typeof value) {
    case "boolean":
    case "number":
      return JSON.stringify(value);
    case "bigint":
      return JSON.stringify(value.toString());
    case "string":
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map((entry) => encode(entry ?? null)).join(",")}]`;
      }
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record).sort();
      const entries = keys.map((key) => {
        const entry = record[key];
        if (entry === undefined) {
          throw new Error("canonical encoding rejects undefined fields");
        }
        return `${JSON.stringify(key)}:${encode(entry)}`;
      });
      return `{${entries.join(",")}}`;
    }
    default:
      throw new Error("canonical encoding rejects non JSON values");
  }
}

export function requestDigest(value: unknown): Buffer {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest();
}
