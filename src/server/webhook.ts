import "server-only";

import { createHash } from "node:crypto";

import {
  decodeProtectedHeader,
  importJWK,
  jwtVerify,
  type CryptoKey,
} from "jose";

import { failure, ok, type ServiceResult } from "@/features/finance/errors";
import { plaidWebhookVerificationKey } from "@/server/plaid";

// Plaid-Verification JWT verification for the webhook route. The kid
// selects the JWK from Plaid's authenticated verification key endpoint;
// keys are cached in process per kid and refetched once on failure.
// Nothing about the payload is trusted until the signature and the
// request_body_sha256 claim both check out.

export type KeyFetcher = (
  keyId: string,
) => Promise<ServiceResult<Record<string, unknown>>>;

const keyCache = new Map<string, CryptoKey>();

async function fetchJwk(
  keyId: string,
): Promise<ServiceResult<Record<string, unknown>>> {
  return plaidWebhookVerificationKey(keyId);
}

async function resolveKey(
  keyId: string,
  fetchKey: KeyFetcher,
  refresh: boolean,
): Promise<CryptoKey | null> {
  if (!refresh) {
    const cached = keyCache.get(keyId);
    if (cached !== undefined) {
      return cached;
    }
  }
  const jwk = await fetchKey(keyId);
  if (!jwk.ok) {
    return null;
  }
  try {
    const key = await importJWK(jwk.value, "ES256");
    if (!(key instanceof CryptoKey)) {
      return null;
    }
    keyCache.set(keyId, key);
    return key;
  } catch {
    return null;
  }
}

function sha256Hex(body: Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}

export type VerifiedWebhook = {
  claims: Record<string, unknown>;
};

// Verify the signature, then bind the JWT to the raw bytes through the
// request_body_sha256 claim. A missing key id, wrong algorithm, bad
// signature, stale kid, or hash mismatch all return the same failure;
// the caller maps every one to the generic rejection.
export async function verifyPlaidWebhook(
  rawBody: Uint8Array,
  token: string,
  fetchKey: KeyFetcher = fetchJwk,
): Promise<ServiceResult<VerifiedWebhook>> {
  let keyId: string;
  try {
    const header = decodeProtectedHeader(token);
    if (header.alg !== "ES256" || typeof header.kid !== "string") {
      return failure("INVALID_INPUT");
    }
    keyId = header.kid;
  } catch {
    return failure("INVALID_INPUT");
  }

  for (const refresh of [false, true]) {
    const key = await resolveKey(keyId, fetchKey, refresh);
    if (key === null) {
      if (!refresh) {
        continue;
      }
      return failure("PROVIDER_UNAVAILABLE");
    }
    try {
      const { payload } = await jwtVerify(token, key, {
        algorithms: ["ES256"],
      });
      const claim = (payload as Record<string, unknown>).request_body_sha256;
      if (typeof claim !== "string" || claim !== sha256Hex(rawBody)) {
        return failure("INVALID_INPUT");
      }
      return ok({ claims: payload as Record<string, unknown> });
    } catch {
      if (!refresh) {
        continue;
      }
      return failure("INVALID_INPUT");
    }
  }
  return failure("INVALID_INPUT");
}
