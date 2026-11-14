import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";

import { failure, ok, type ServiceResult } from "@/features/finance/errors";
import { MIN_PASSWORD_LENGTH, verifyPassword } from "./password";
import { runUnitOfWork } from "@/server/db/finance";

export const SESSION_COOKIE_NAME = "ledger_session";

const SESSION_SLIDE_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;
const SLIDE_WRITE_INTERVAL_MS = 60 * 1000;
const TOKEN_BYTES = 32;
const THROTTLE_THRESHOLD = 5;
const THROTTLE_BASE_MS = 1000;
const THROTTLE_MAX_MS = 30_000;

export type OwnerSession = {
  sessionId: string;
  ownerId: string;
  timeZone: string;
};

// Failed sign in delay grows from one second after the fifth failure and
// doubles per further failure, capped at thirty seconds. The counter is
// per process and clears on restart or a successful sign in.
let failedAttempts = 0;

export function resetSignInThrottleForTests(): void {
  failedAttempts = 0;
}

function throttleDelayMs(failures: number): number {
  if (failures < THROTTLE_THRESHOLD) {
    return 0;
  }
  const delay = THROTTLE_BASE_MS * 2 ** (failures - THROTTLE_THRESHOLD);
  return Math.min(delay, THROTTLE_MAX_MS);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashToken(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

// Verify the owner password and mint a database session. The raw token
// reaches the browser once through the cookie; only its SHA-256 hash is
// stored. A missing password hash or a wrong password returns the same
// generic failure. Sign in is impossible until the password script sets
// the hash.
export async function signIn(
  databaseUrl: string,
  password: string,
): Promise<ServiceResult<{ token: string; expiresAt: Date }>> {
  const result = await runUnitOfWork(databaseUrl, async (db) => {
    const owners = await db.query<{ id: string; password_hash: string | null }>(
      "SELECT id, password_hash FROM ledger.owner",
    );
    const owner = owners.rows[0];
    if (
      owner === undefined ||
      owner.password_hash === null ||
      !verifyPassword(password, owner.password_hash)
    ) {
      return null;
    }

    const now = Date.now();
    const token = randomBytes(TOKEN_BYTES).toString("base64url");
    const expiresAt = new Date(now + SESSION_SLIDE_MS);
    const absoluteExpiresAt = new Date(now + SESSION_ABSOLUTE_MS);
    await db.query(
      `INSERT INTO ledger.session
         (id, owner_id, token_hash, expires_at, absolute_expires_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        randomUUID(),
        owner.id,
        hashToken(token),
        expiresAt.toISOString(),
        absoluteExpiresAt.toISOString(),
      ],
    );
    return { token, expiresAt };
  });

  if (!result.ok) {
    return result;
  }
  if (result.value === null) {
    failedAttempts += 1;
    await delay(throttleDelayMs(failedAttempts));
    return failure("INVALID_INPUT");
  }
  failedAttempts = 0;
  return ok(result.value);
}

export function passwordMeetsPolicy(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}

// Resolve the cookie token to a live session and its owner. Expired and
// revoked sessions never revive. The slide write refreshes last_seen_at
// at most once a minute and pushes expires_at to now + 7 days, never past
// the absolute cap.
export async function getSessionByToken(
  databaseUrl: string,
  token: string,
): Promise<ServiceResult<OwnerSession | null>> {
  return runUnitOfWork(databaseUrl, async (db) => {
    const rows = await db.query<{
      id: string;
      owner_id: string;
      time_zone: string;
      last_seen_at: Date;
    }>(
      `SELECT s.id, s.owner_id, s.last_seen_at, o.time_zone
       FROM ledger.session s
       JOIN ledger.owner o ON o.id = s.owner_id
       WHERE s.token_hash = $1
         AND s.revoked_at IS NULL
         AND s.expires_at > now()
         AND s.absolute_expires_at > now()`,
      [hashToken(token)],
    );
    const row = rows.rows[0];
    if (row === undefined) {
      return null;
    }
    if (Date.now() - row.last_seen_at.getTime() > SLIDE_WRITE_INTERVAL_MS) {
      await db.query(
        `UPDATE ledger.session
         SET last_seen_at = now(),
             expires_at = LEAST(now() + interval '7 days', absolute_expires_at)
         WHERE id = $1 AND revoked_at IS NULL`,
        [row.id],
      );
    }
    return {
      sessionId: row.id,
      ownerId: row.owner_id,
      timeZone: row.time_zone,
    };
  });
}

// The authoritative session check shared by protected pages and actions.
// A cookie alone never authorizes; the row must be live at check time.
export async function requireSession(
  databaseUrl: string,
): Promise<OwnerSession | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (token === undefined || token === "") {
    return null;
  }
  const result = await getSessionByToken(databaseUrl, token);
  if (!result.ok) {
    return null;
  }
  return result.value;
}

// Sign out revokes the session row; the caller clears the cookie.
export async function revokeCurrentSession(
  databaseUrl: string,
): Promise<ServiceResult<null>> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (token === undefined || token === "") {
    return ok(null);
  }
  const result = await runUnitOfWork(databaseUrl, async (db) => {
    await db.query(
      `UPDATE ledger.session
       SET revoked_at = now()
       WHERE token_hash = $1 AND revoked_at IS NULL`,
      [hashToken(token)],
    );
    return null;
  });
  if (!result.ok) {
    return result;
  }
  return ok(null);
}
