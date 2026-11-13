import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  decryptToken,
  encryptToken,
  loadTokenKey,
  type TokenBinding,
  type TokenEnvelope,
  type TokenKey,
} from "./tokens";

// covers: AC-8 (AES 256 GCM envelope, record binding, key file rules)

const key: TokenKey = { keyId: "test-key-1", material: randomBytes(32) };
const otherKey: TokenKey = {
  keyId: "test-key-1",
  material: randomBytes(32),
};

const binding: TokenBinding = {
  ownerId: "0b7b5b2a-3d2d-4f0a-9f0f-2d2d2d2d2d2d",
  connectionId: "1c6c6c3b-4e3e-4a1b-8a1a-3e3e3e3e3e3e",
  provider: "plaid",
  environment: "sandbox",
};

describe("encryptToken and decryptToken", () => {
  it("round trips plaintext", () => {
    const envelope = encryptToken("access-sandbox-secret", key, binding);
    expect(decryptToken(envelope, key, binding)).toEqual({
      ok: true,
      value: "access-sandbox-secret",
    });
  });

  it("uses a fresh random nonce per encryption", () => {
    const a = encryptToken("same-plaintext", key, binding);
    const b = encryptToken("same-plaintext", key, binding);
    expect(a.nonce.equals(b.nonce)).toBe(false);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
    expect(a.nonce.length).toBe(12);
    expect(a.tag.length).toBe(16);
  });

  it("fails closed on tampered ciphertext, tag, or nonce", () => {
    const envelope = encryptToken("token", key, binding);
    const tamper = (mutate: (e: TokenEnvelope) => void) => {
      const copy: TokenEnvelope = {
        ...envelope,
        nonce: Buffer.from(envelope.nonce),
        ciphertext: Buffer.from(envelope.ciphertext),
        tag: Buffer.from(envelope.tag),
      };
      mutate(copy);
      return copy;
    };
    expect(
      decryptToken(
        tamper((e) => {
          e.ciphertext[0] ^= 0xff;
        }),
        key,
        binding,
      ),
    ).toMatchObject({ ok: false, code: "TOKEN_UNREADABLE" });
    expect(
      decryptToken(
        tamper((e) => {
          e.tag[0] ^= 0xff;
        }),
        key,
        binding,
      ),
    ).toMatchObject({ ok: false, code: "TOKEN_UNREADABLE" });
    expect(
      decryptToken(
        tamper((e) => {
          e.nonce[0] ^= 0xff;
        }),
        key,
        binding,
      ),
    ).toMatchObject({ ok: false, code: "TOKEN_UNREADABLE" });
  });

  it("fails closed when any bound value changes", () => {
    // covers: AC-8, the authenticated data binds version, key ID, owner,
    // connection, provider, and environment to the envelope.
    const envelope = encryptToken("token", key, binding);
    for (const altered of [
      { ...binding, ownerId: "2d7d7d4c-5f4f-4b2c-9b2b-4f4f4f4f4f4f" },
      { ...binding, connectionId: binding.ownerId },
      { ...binding, provider: "other" },
      { ...binding, environment: "production" },
    ]) {
      expect(decryptToken(envelope, key, altered)).toMatchObject({
        ok: false,
        code: "TOKEN_UNREADABLE",
      });
    }
  });

  it("fails closed on unknown versions and key IDs", () => {
    const envelope = encryptToken("token", key, binding);
    expect(
      decryptToken({ ...envelope, version: 2 }, key, binding),
    ).toMatchObject({ ok: false, code: "TOKEN_UNREADABLE" });
    expect(
      decryptToken({ ...envelope, keyId: "other-key" }, key, binding),
    ).toMatchObject({ ok: false, code: "TOKEN_UNREADABLE" });
    expect(
      decryptToken(envelope, { ...key, keyId: "other-key" }, binding),
    ).toMatchObject({ ok: false, code: "TOKEN_UNREADABLE" });
  });

  it("fails closed under a different key", () => {
    const envelope = encryptToken("token", key, binding);
    expect(decryptToken(envelope, otherKey, binding)).toMatchObject({
      ok: false,
      code: "TOKEN_UNREADABLE",
    });
  });
});

describe("loadTokenKey", () => {
  let dir: string;
  const keyMaterial = randomBytes(32).toString("base64");

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "ledger-key-test-"));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const writeKey = (name: string, content: string, mode = 0o600) => {
    const path = join(dir, name);
    writeFileSync(path, content, { mode });
    return path;
  };

  it("loads a canonical base64 key from a safe file", () => {
    const path = writeKey("good.key", keyMaterial);
    expect(
      loadTokenKey({
        ...process.env,
        LEDGER_TOKEN_KEY_PATH: path,
        LEDGER_TOKEN_KEY_ID: "k1",
      }),
    ).toEqual({
      ok: true,
      value: {
        keyId: "k1",
        material: Buffer.from(keyMaterial, "base64"),
      },
    });
  });

  it("accepts one trailing newline", () => {
    const path = writeKey("newline.key", `${keyMaterial}\n`);
    expect(
      loadTokenKey({
        ...process.env,
        LEDGER_TOKEN_KEY_PATH: path,
        LEDGER_TOKEN_KEY_ID: "k1",
      }).ok,
    ).toBe(true);
  });

  it("returns CONFIG_INVALID for missing or invalid settings", () => {
    const blank = {
      ...process.env,
      LEDGER_TOKEN_KEY_PATH: undefined,
      LEDGER_TOKEN_KEY_ID: undefined,
    };
    expect(loadTokenKey(blank)).toMatchObject({
      ok: false,
      code: "CONFIG_INVALID",
    });
    expect(
      loadTokenKey({ ...blank, LEDGER_TOKEN_KEY_PATH: "relative/path.key" }),
    ).toMatchObject({ ok: false, code: "CONFIG_INVALID" });
    expect(
      loadTokenKey({
        ...blank,
        LEDGER_TOKEN_KEY_PATH: join(dir, "x.key"),
        LEDGER_TOKEN_KEY_ID: "",
      }),
    ).toMatchObject({ ok: false, code: "CONFIG_INVALID" });
    expect(
      loadTokenKey({
        ...blank,
        LEDGER_TOKEN_KEY_PATH: join(dir, "x.key"),
        LEDGER_TOKEN_KEY_ID: "k".repeat(65),
      }),
    ).toMatchObject({ ok: false, code: "CONFIG_INVALID" });
  });

  it("returns KEY_UNAVAILABLE for a missing file", () => {
    expect(
      loadTokenKey({
        ...process.env,
        LEDGER_TOKEN_KEY_PATH: join(dir, "missing.key"),
        LEDGER_TOKEN_KEY_ID: "k1",
      }),
    ).toMatchObject({ ok: false, code: "KEY_UNAVAILABLE" });
  });

  it("rejects group or other permissions", () => {
    for (const mode of [0o640, 0o604, 0o644, 0o660]) {
      const path = writeKey(`mode-${mode.toString(8)}.key`, keyMaterial, mode);
      expect(
        loadTokenKey({
          ...process.env,
          LEDGER_TOKEN_KEY_PATH: path,
          LEDGER_TOKEN_KEY_ID: "k1",
        }),
      ).toMatchObject({ ok: false, code: "KEY_UNAVAILABLE" });
    }
  });

  it("rejects symbolic links", () => {
    const target = writeKey("real.key", keyMaterial);
    const link = join(dir, "link.key");
    symlinkSync(target, link);
    expect(
      loadTokenKey({
        ...process.env,
        LEDGER_TOKEN_KEY_PATH: link,
        LEDGER_TOKEN_KEY_ID: "k1",
      }),
    ).toMatchObject({ ok: false, code: "KEY_UNAVAILABLE" });
  });

  it("rejects a key file inside the repository", () => {
    const inside = join(process.cwd(), "token-key-inside-repo.testtmp");
    writeFileSync(inside, keyMaterial, { mode: 0o600 });
    try {
      expect(
        loadTokenKey({
          ...process.env,
          LEDGER_TOKEN_KEY_PATH: inside,
          LEDGER_TOKEN_KEY_ID: "k1",
        }),
      ).toMatchObject({ ok: false, code: "KEY_UNAVAILABLE" });
    } finally {
      rmSync(inside, { force: true });
    }
  });

  it("rejects malformed or wrong length key material", () => {
    const cases: Record<string, string> = {
      "short.key": randomBytes(16).toString("base64"),
      "bad-base64.key": "!!!not-base64!!!",
      "embedded-newline.key": `${keyMaterial.slice(0, 10)}\n${keyMaterial.slice(10)}`,
      "two-newlines.key": `${keyMaterial}\n\n`,
      "non-canonical.key": `${keyMaterial}=`,
      "empty.key": "",
    };
    for (const [name, content] of Object.entries(cases)) {
      const path = writeKey(name, content);
      expect(
        loadTokenKey({
          ...process.env,
          LEDGER_TOKEN_KEY_PATH: path,
          LEDGER_TOKEN_KEY_ID: "k1",
        }),
        name,
      ).toMatchObject({ ok: false, code: "KEY_UNAVAILABLE" });
    }
  });
});
