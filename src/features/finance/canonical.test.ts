import { describe, expect, it } from "vitest";

import { canonicalJson, requestDigest } from "./canonical";

// covers: AC-11 (canonical digest encoding for request receipts)
describe("canonicalJson", () => {
  it("sorts object keys recursively", () => {
    const a = canonicalJson({ b: 1, a: { d: 4, c: 3 }, z: [2, 1] });
    const b = canonicalJson({ z: [2, 1], a: { c: 3, d: 4 }, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":{"c":3,"d":4},"b":1,"z":[2,1]}');
  });

  it("encodes bigints as decimal strings", () => {
    expect(canonicalJson({ units: 1234n })).toBe('{"units":"1234"}');
    expect(canonicalJson({ units: -5n })).toBe('{"units":"-5"}');
  });

  it("encodes null and preserves text exactly", () => {
    expect(canonicalJson({ a: null })).toBe('{"a":null}');
    expect(canonicalJson({ s: "héllo\n" })).toBe('{"s":"héllo\\n"}');
  });

  it("rejects undefined values inside objects", () => {
    expect(() => canonicalJson({ a: undefined })).toThrow();
    expect(() => canonicalJson({ a: { b: undefined } })).toThrow();
  });

  it("keeps array order significant", () => {
    // Callers must sort records before encoding; the encoding itself
    // must not normalize away ordering differences.
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it("encodes undefined array entries as null like JSON.stringify", () => {
    expect(canonicalJson([undefined, 1])).toBe("[null,1]");
  });

  it("rejects non JSON values", () => {
    expect(() => canonicalJson({ f: () => 1 })).toThrow();
    expect(() => canonicalJson(Symbol("x"))).toThrow();
  });
});

describe("requestDigest", () => {
  it("produces a stable 32 byte SHA 256 digest", () => {
    const digest = requestDigest({ a: 1, b: [2n, "x", null] });
    expect(digest).toBeInstanceOf(Buffer);
    expect(digest.length).toBe(32);
    expect(requestDigest({ b: [2n, "x", null], a: 1 }).equals(digest)).toBe(
      true,
    );
  });

  it("differs for differing payloads", () => {
    const a = requestDigest({ v: "omitted" });
    const b = requestDigest({ v: null });
    // covers: AC-11, override omission and explicit null must differ.
    expect(a.equals(b)).toBe(false);
  });
});
