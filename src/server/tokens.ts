import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";
import { z } from "zod";

import { failure, ok, type ServiceResult } from "@/features/finance/errors";

const ENVELOPE_VERSION = 1;
const NONCE_BYTES = 12;
const KEY_BYTES = 32;

const tokenKeySettings = z.object({
  LEDGER_TOKEN_KEY_PATH: z
    .string()
    .min(1)
    .refine((value) => isAbsolute(value), { message: "must be absolute" }),
  LEDGER_TOKEN_KEY_ID: z.string().min(1).max(64),
});

export type TokenKey = {
  keyId: string;
  material: Buffer;
};

// Load and validate the owner key file lazily. Only token operations call
// this; a missing or unsafe file must never block historical reads.
// Returns CONFIG_INVALID for bad settings and KEY_UNAVAILABLE for an
// unusable file. Never logs paths, material, or crypto exceptions.
export function loadTokenKey(
  source: NodeJS.ProcessEnv = process.env,
): ServiceResult<TokenKey> {
  const parsed = tokenKeySettings.safeParse({
    LEDGER_TOKEN_KEY_PATH: source.LEDGER_TOKEN_KEY_PATH,
    LEDGER_TOKEN_KEY_ID: source.LEDGER_TOKEN_KEY_ID,
  });
  if (!parsed.success) {
    return failure("CONFIG_INVALID");
  }
  const { LEDGER_TOKEN_KEY_PATH: keyPath, LEDGER_TOKEN_KEY_ID: keyId } =
    parsed.data;
  try {
    const stats = lstatSync(keyPath);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      return failure("KEY_UNAVAILABLE");
    }
    if ((stats.mode & 0o777) !== 0o600 || stats.uid !== process.getuid?.()) {
      return failure("KEY_UNAVAILABLE");
    }
    const resolved = realpathSync(keyPath);
    const repoRoot = resolve(process.cwd());
    if (resolved === repoRoot || resolved.startsWith(repoRoot + sep)) {
      return failure("KEY_UNAVAILABLE");
    }
    const realStats = statSync(resolved);
    if (!realStats.isFile()) {
      return failure("KEY_UNAVAILABLE");
    }
    const content = readFileSync(resolved, "utf8");
    const canonical = content.replace(/\n$/, "");
    if (canonical.includes("\n") || canonical.length === 0) {
      return failure("KEY_UNAVAILABLE");
    }
    const material = Buffer.from(canonical, "base64");
    if (
      material.length !== KEY_BYTES ||
      material.toString("base64") !== canonical
    ) {
      return failure("KEY_UNAVAILABLE");
    }
    return ok({ keyId, material });
  } catch {
    return failure("KEY_UNAVAILABLE");
  }
}

export type TokenEnvelope = {
  version: number;
  keyId: string;
  nonce: Buffer;
  ciphertext: Buffer;
  tag: Buffer;
};

export type TokenBinding = {
  ownerId: string;
  connectionId: string;
  provider: string;
  environment: string;
};

function authenticatedData(keyId: string, binding: TokenBinding): Buffer {
  return Buffer.from(
    JSON.stringify({
      version: ENVELOPE_VERSION,
      keyId,
      ownerId: binding.ownerId,
      connectionId: binding.connectionId,
      provider: binding.provider,
      environment: binding.environment,
    }),
    "utf8",
  );
}

export function encryptToken(
  plaintext: string,
  key: TokenKey,
  binding: TokenBinding,
): TokenEnvelope {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key.material, nonce);
  cipher.setAAD(authenticatedData(key.keyId, binding));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return {
    version: ENVELOPE_VERSION,
    keyId: key.keyId,
    nonce,
    ciphertext,
    tag: cipher.getAuthTag(),
  };
}

// Decrypt an envelope after binding checks. Version and key ID mismatches
// fail closed. Returns TOKEN_UNREADABLE on any authentication failure.
export function decryptToken(
  envelope: TokenEnvelope,
  key: TokenKey,
  binding: TokenBinding,
): ServiceResult<string> {
  if (envelope.version !== ENVELOPE_VERSION || envelope.keyId !== key.keyId) {
    return failure("TOKEN_UNREADABLE");
  }
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key.material,
      envelope.nonce,
    );
    decipher.setAAD(authenticatedData(key.keyId, binding));
    decipher.setAuthTag(envelope.tag);
    const plaintext = Buffer.concat([
      decipher.update(envelope.ciphertext),
      decipher.final(),
    ]);
    return ok(plaintext.toString("utf8"));
  } catch {
    return failure("TOKEN_UNREADABLE");
  }
}
