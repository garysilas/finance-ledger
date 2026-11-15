import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import { failure, type ServiceResult } from "./errors";
import {
  idText,
  nameText,
  runMutation,
  tokenText,
  uuid,
  type MutationAck,
} from "./service";
import { runUnitOfWork, OpFailure } from "@/server/db/finance";
import {
  decryptToken,
  encryptToken,
  loadTokenKey,
  type TokenEnvelope,
} from "@/server/tokens";

const createConnectionInput = z
  .object({
    ownerId: uuid,
    provider: z.literal("plaid"),
    environment: z.literal("sandbox"),
    providerItemId: idText,
    institutionId: idText.nullable().default(null),
    institutionName: nameText.nullable().default(null),
    tokenPlaintext: tokenText,
    requestId: uuid,
  })
  .strict();

export type CreateConnectionResult = {
  connectionId: string;
  state: string;
};

// Create an active connection with an encrypted token envelope. The
// plaintext token is trusted adapter input; it is never stored, returned,
// logged, or included in the request digest.
export async function createConnection(
  databaseUrl: string,
  rawInput: unknown,
): Promise<ServiceResult<MutationAck<CreateConnectionResult>>> {
  const parsed = createConnectionInput.safeParse(rawInput);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }
  const input = parsed.data;

  const key = loadTokenKey();
  if (!key.ok) {
    return key;
  }

  return runMutation({
    databaseUrl,
    ownerId: input.ownerId,
    operation: "create_connection",
    requestId: input.requestId,
    actorType: "owner",
    digestInput: {
      operation: "create_connection",
      ownerId: input.ownerId,
      provider: input.provider,
      environment: input.environment,
      providerItemId: input.providerItemId,
      institutionId: input.institutionId,
      institutionName: input.institutionName,
    },
    work: async (db) => {
      const owner = await db.query("SELECT 1 FROM ledger.owner WHERE id = $1", [
        input.ownerId,
      ]);
      if (owner.rows.length === 0) {
        throw new OpFailure("NOT_FOUND");
      }

      const connectionId = randomUUID();
      const envelope = encryptToken(input.tokenPlaintext, key.value, {
        ownerId: input.ownerId,
        connectionId,
        provider: input.provider,
        environment: input.environment,
      });

      await db.query(
        `INSERT INTO ledger.connection
           (id, owner_id, provider, environment, provider_item_id,
            institution_id, institution_name, state,
            token_version, token_key_id, token_nonce, token_ciphertext,
            token_tag)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8,$9,$10,$11,$12)`,
        [
          connectionId,
          input.ownerId,
          input.provider,
          input.environment,
          input.providerItemId,
          input.institutionId,
          input.institutionName,
          envelope.version,
          envelope.keyId,
          envelope.nonce,
          envelope.ciphertext,
          envelope.tag,
        ],
      );

      return {
        value: { connectionId, state: "active" },
        targetId: connectionId,
        resultingRevision: 1n,
        counts: { inserted: 1, updated: 0, removed: 0 },
        events: [
          {
            targetType: "connection",
            targetId: connectionId,
            resultingRevision: 1n,
          },
        ],
      };
    },
  });
}

export type ConnectionSyncState = {
  state: string;
  cursor: string | null;
  revision: string;
};

// Current cursor and state for the trusted adapter. A receipt's
// historical committed cursor must never substitute for this read.
export async function getConnectionSyncState(
  databaseUrl: string,
  rawInput: unknown,
): Promise<ServiceResult<ConnectionSyncState>> {
  const parsed = z
    .object({ ownerId: uuid, connectionId: uuid })
    .strict()
    .safeParse(rawInput);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }
  const { ownerId, connectionId } = parsed.data;
  return runUnitOfWork(databaseUrl, async (db) => {
    const rows = await db.query<{
      state: string;
      sync_cursor: string | null;
      revision: string;
    }>(
      `SELECT state, sync_cursor, revision FROM ledger.connection
       WHERE id = $1 AND owner_id = $2`,
      [connectionId, ownerId],
    );
    if (rows.rows.length === 0) {
      throw new OpFailure("NOT_FOUND");
    }
    const row = rows.rows[0];
    return {
      state: row.state,
      cursor: row.sync_cursor,
      revision: row.revision,
    };
  });
}

const setConnectionStateInput = z
  .object({
    ownerId: uuid,
    connectionId: uuid,
    expectedRevision: z.string().regex(/^\d+$/),
    targetState: z.enum(["active", "needs_reconnect", "disconnected"]),
    requestId: uuid,
  })
  .strict();

export type SetConnectionStateResult = {
  state: string;
  revision: string;
};

// Transition a connection. Local disconnect clears the token envelope
// without loading the key or contacting the provider. Recovery and
// reconnect transitions are rejected here by design.
export async function setConnectionState(
  databaseUrl: string,
  rawInput: unknown,
): Promise<ServiceResult<MutationAck<SetConnectionStateResult>>> {
  const parsed = setConnectionStateInput.safeParse(rawInput);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }
  const input = parsed.data;
  const expectedRevision = BigInt(input.expectedRevision);

  return runMutation({
    databaseUrl,
    ownerId: input.ownerId,
    operation: "set_connection_state",
    requestId: input.requestId,
    actorType: "owner",
    digestInput: {
      operation: "set_connection_state",
      ownerId: input.ownerId,
      connectionId: input.connectionId,
      expectedRevision: input.expectedRevision,
      targetState: input.targetState,
    },
    work: async (db) => {
      const rows = await db.query<{ state: string; revision: string }>(
        `SELECT state, revision FROM ledger.connection
         WHERE id = $1 AND owner_id = $2 FOR UPDATE`,
        [input.connectionId, input.ownerId],
      );
      if (rows.rows.length === 0) {
        throw new OpFailure("NOT_FOUND");
      }
      const current = rows.rows[0];
      const revision = BigInt(current.revision);
      if (revision !== expectedRevision) {
        throw new OpFailure("CONFLICT");
      }

      const transitions: Record<string, Set<string>> = {
        active: new Set(["needs_reconnect", "disconnected"]),
        needs_reconnect: new Set(["disconnected"]),
        disconnected: new Set(),
      };
      if (current.state === input.targetState) {
        return {
          value: { state: current.state, revision: current.revision },
          targetId: input.connectionId,
          resultingRevision: revision,
          counts: { inserted: 0, updated: 0, removed: 0 },
          events: [],
        };
      }
      if (!transitions[current.state].has(input.targetState)) {
        throw new OpFailure("INVALID_TRANSITION");
      }

      const nextRevision = revision + 1n;
      if (input.targetState === "disconnected") {
        await db.query(
          `UPDATE ledger.connection
           SET state = 'disconnected',
               token_version = NULL, token_key_id = NULL,
               token_nonce = NULL, token_ciphertext = NULL, token_tag = NULL,
               revision = $3, updated_at = now()
           WHERE id = $1 AND owner_id = $2`,
          [input.connectionId, input.ownerId, nextRevision.toString()],
        );
      } else {
        await db.query(
          `UPDATE ledger.connection
           SET state = $3, revision = $4, updated_at = now()
           WHERE id = $1 AND owner_id = $2`,
          [
            input.connectionId,
            input.ownerId,
            input.targetState,
            nextRevision.toString(),
          ],
        );
      }

      return {
        value: { state: input.targetState, revision: nextRevision.toString() },
        targetId: input.connectionId,
        resultingRevision: nextRevision,
        counts: { inserted: 0, updated: 1, removed: 0 },
        events: [
          {
            targetType: "connection",
            targetId: input.connectionId,
            resultingRevision: nextRevision,
          },
        ],
      };
    },
  });
}

// Disconnect clears the token envelope and lands on the disconnected
// state in one unit of work. Accounts and transactions stay stored.
export async function disconnectConnection(
  databaseUrl: string,
  rawInput: unknown,
): Promise<ServiceResult<null>> {
  const parsed = z
    .object({ ownerId: uuid, connectionId: uuid })
    .strict()
    .safeParse(rawInput);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }
  const { ownerId, connectionId } = parsed.data;
  return runUnitOfWork(databaseUrl, async (db) => {
    const rows = await db.query(
      `UPDATE ledger.connection
       SET state = 'disconnected', sync_started_at = NULL,
           token_version = NULL, token_key_id = NULL,
           token_nonce = NULL, token_ciphertext = NULL, token_tag = NULL,
           revision = revision + 1, updated_at = now()
       WHERE id = $1 AND owner_id = $2
         AND state IN ('active', 'needs_reconnect')
       RETURNING id`,
      [connectionId, ownerId],
    );
    if (rows.rows.length === 0) {
      const found = await db.query<{ state: string }>(
        `SELECT state FROM ledger.connection
         WHERE id = $1 AND owner_id = $2`,
        [connectionId, ownerId],
      );
      throw new OpFailure(
        found.rows.length === 0 ? "NOT_FOUND" : "INVALID_TRANSITION",
      );
    }
    return null;
  });
}

export type ConnectionLookup = {
  connectionId: string;
  state: string;
};

// Resolve a provider item to its connection. Used to reconcile a
// re-run of connect that hit the provider item unique constraint.
export async function findConnectionByProviderItem(
  databaseUrl: string,
  rawInput: unknown,
): Promise<ServiceResult<ConnectionLookup | null>> {
  const parsed = z
    .object({ ownerId: uuid, providerItemId: idText })
    .strict()
    .safeParse(rawInput);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }
  const { ownerId, providerItemId } = parsed.data;
  return runUnitOfWork(databaseUrl, async (db) => {
    const rows = await db.query<{ id: string; state: string }>(
      `SELECT id, state FROM ledger.connection
       WHERE owner_id = $1 AND provider_item_id = $2`,
      [ownerId, providerItemId],
    );
    const row = rows.rows[0];
    return row === undefined
      ? null
      : { connectionId: row.id, state: row.state };
  });
}

export type OwnerConnectionSummary = {
  connectionId: string;
  state: string;
  institutionName: string | null;
  historyComplete: boolean;
  lastSuccessfulSyncAt: string | null;
  lastSyncAttemptAt: string | null;
  lastSyncFailure: string | null;
  syncStartedAt: string | null;
};

// Display safe connection rows for the owner scoped views. Carries no
// token material and no cursor.
export async function listOwnerConnections(
  databaseUrl: string,
  rawInput: unknown,
): Promise<ServiceResult<OwnerConnectionSummary[]>> {
  const parsed = z.object({ ownerId: uuid }).strict().safeParse(rawInput);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }
  const { ownerId } = parsed.data;
  return runUnitOfWork(databaseUrl, async (db) => {
    const rows = await db.query<{
      id: string;
      state: string;
      institution_name: string | null;
      history_complete: boolean;
      last_successful_sync_at: Date | null;
      last_sync_attempt_at: Date | null;
      last_sync_failure: string | null;
      sync_started_at: Date | null;
    }>(
      `SELECT id, state, institution_name, history_complete,
              last_successful_sync_at, last_sync_attempt_at,
              last_sync_failure, sync_started_at
       FROM ledger.connection WHERE owner_id = $1 ORDER BY id`,
      [ownerId],
    );
    return rows.rows.map((row) => ({
      connectionId: row.id,
      state: row.state,
      institutionName: row.institution_name,
      historyComplete: row.history_complete,
      lastSuccessfulSyncAt: row.last_successful_sync_at
        ? row.last_successful_sync_at.toISOString()
        : null,
      lastSyncAttemptAt: row.last_sync_attempt_at
        ? row.last_sync_attempt_at.toISOString()
        : null,
      lastSyncFailure: row.last_sync_failure,
      syncStartedAt: row.sync_started_at
        ? row.sync_started_at.toISOString()
        : null,
    }));
  });
}

// Record a committed sync page. The adapter calls this after a batch
// commits; a failed or partial run leaves the timestamp unchanged.
export async function markSyncSuccess(
  databaseUrl: string,
  rawInput: unknown,
): Promise<ServiceResult<null>> {
  const parsed = z
    .object({ ownerId: uuid, connectionId: uuid })
    .strict()
    .safeParse(rawInput);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }
  const { ownerId, connectionId } = parsed.data;
  return runUnitOfWork(databaseUrl, async (db) => {
    const rows = await db.query(
      `UPDATE ledger.connection
       SET last_successful_sync_at = now(),
           revision = revision + 1, updated_at = now()
       WHERE id = $1 AND owner_id = $2 AND state = 'active'
       RETURNING id`,
      [connectionId, ownerId],
    );
    if (rows.rows.length === 0) {
      throw new OpFailure("NOT_FOUND");
    }
    return null;
  });
}

// Decrypt a connection token for the trusted provider adapter only.
// Requires an active connection; plaintext is never part of a display DTO.
export async function decryptConnectionToken(
  databaseUrl: string,
  rawInput: unknown,
): Promise<ServiceResult<string>> {
  return decryptTokenForStates(databaseUrl, rawInput, ["active"]);
}

// Decrypt the token of a needs_reconnect connection so the adapter can
// mint an update mode Link token for it. Same trust boundary as
// decryptConnectionToken.
export async function decryptReconnectToken(
  databaseUrl: string,
  rawInput: unknown,
): Promise<ServiceResult<string>> {
  return decryptTokenForStates(databaseUrl, rawInput, ["needs_reconnect"]);
}

async function decryptTokenForStates(
  databaseUrl: string,
  rawInput: unknown,
  states: string[],
): Promise<ServiceResult<string>> {
  const parsed = z
    .object({ ownerId: uuid, connectionId: uuid })
    .strict()
    .safeParse(rawInput);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }
  const { ownerId, connectionId } = parsed.data;

  const key = loadTokenKey();
  if (!key.ok) {
    return key;
  }

  return runUnitOfWork(databaseUrl, async (db) => {
    const rows = await db.query<{
      state: string;
      provider: string;
      environment: string;
      token_version: number | null;
      token_key_id: string | null;
      token_nonce: Buffer | null;
      token_ciphertext: Buffer | null;
      token_tag: Buffer | null;
    }>(
      `SELECT state, provider, environment, token_version, token_key_id,
              token_nonce, token_ciphertext, token_tag
       FROM ledger.connection WHERE id = $1 AND owner_id = $2`,
      [connectionId, ownerId],
    );
    if (rows.rows.length === 0) {
      throw new OpFailure("NOT_FOUND");
    }
    const row = rows.rows[0];
    if (!states.includes(row.state) || row.token_version === null) {
      throw new OpFailure("INVALID_TRANSITION");
    }
    const envelope: TokenEnvelope = {
      version: row.token_version,
      keyId: row.token_key_id ?? "",
      nonce: row.token_nonce ?? Buffer.alloc(0),
      ciphertext: row.token_ciphertext ?? Buffer.alloc(0),
      tag: row.token_tag ?? Buffer.alloc(0),
    };
    const plaintext = decryptToken(envelope, key.value, {
      ownerId,
      connectionId,
      provider: row.provider,
      environment: row.environment,
    });
    if (!plaintext.ok) {
      throw new OpFailure(plaintext.code);
    }
    return plaintext.value;
  });
}
