import { describe, expect, it } from "vitest";

import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "./password";

// covers: AC-1 owner password hashing; the stored string carries scheme,
// parameters, salt, and derived key so verification is self contained.
describe("hashPassword", () => {
  it("produces a scrypt string with parameters, salt, and key", () => {
    const stored = hashPassword("a long enough password");
    const parts = stored.split("$");
    expect(parts).toHaveLength(6);
    expect(parts[0]).toBe("scrypt");
    expect(Number(parts[1])).toBe(16384);
    expect(Number(parts[2])).toBe(8);
    expect(Number(parts[3])).toBe(1);
    expect(Buffer.from(parts[4], "base64")).toHaveLength(16);
    expect(Buffer.from(parts[5], "base64")).toHaveLength(64);
  });

  it("stores a fresh random salt per hash", () => {
    expect(hashPassword("same password")).not.toBe(
      hashPassword("same password"),
    );
  });
});

describe("verifyPassword", () => {
  it("accepts the password that produced the hash", () => {
    const stored = hashPassword("correct horse battery staple");
    expect(verifyPassword("correct horse battery staple", stored)).toBe(true);
  });

  it("rejects a wrong password", () => {
    const stored = hashPassword("correct horse battery staple");
    expect(verifyPassword("correct horse battery staplF", stored)).toBe(false);
  });

  it("rejects a tampered derived key", () => {
    const stored = hashPassword("correct horse battery staple");
    const parts = stored.split("$");
    const key = Buffer.from(parts[5], "base64");
    key[0] ^= 1;
    parts[5] = key.toString("base64");
    expect(
      verifyPassword("correct horse battery staple", parts.join("$")),
    ).toBe(false);
  });

  it.each([
    ["an empty string", ""],
    ["a non scrypt prefix", "argon2$16384$8$1$c2FsdA==$a2V5"],
    ["too few parts", "scrypt$16384$8$1$c2FsdA=="],
    ["too many parts", "scrypt$16384$8$1$c2FsdA==$a2V5$extra"],
    ["a non numeric cost", "scrypt$abc$8$1$c2FsdA==$a2V5"],
    ["a cost that is not a power of two", "scrypt$16383$8$1$c2FsdA==$a2V5"],
    ["a cost below two", "scrypt$1$8$1$c2FsdA==$a2V5"],
    ["a zero block size", "scrypt$16384$0$1$c2FsdA==$a2V5"],
    ["a zero parallelization", "scrypt$16384$8$0$c2FsdA==$a2V5"],
    ["an empty salt", "scrypt$16384$8$1$$a2V5"],
    ["an empty derived key", "scrypt$16384$8$1$c2FsdA==$"],
    ["non integer parameters", "scrypt$16384.5$8$1$c2FsdA==$a2V5"],
  ])("returns false for %s", (_label, stored) => {
    expect(verifyPassword("anything at all", stored)).toBe(false);
  });

  it("returns false rather than throwing on an absurd stored cost", () => {
    // A hostile or corrupted row must fail closed, not crash sign in.
    const stored = `scrypt$${2 ** 30}$8$1$c2FsdA==$a2V5`;
    expect(verifyPassword("anything at all", stored)).toBe(false);
  });
});

describe("MIN_PASSWORD_LENGTH", () => {
  it("stays at twelve characters per spec 0005", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(12);
  });
});
