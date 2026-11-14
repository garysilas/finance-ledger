// Set the owner sign in password. Explicit and owner initiated only: the
// password comes from interactive stdin or LEDGER_OWNER_PASSWORD, never
// argv, and is never echoed, logged, or stored in plaintext. When no owner
// row exists yet the script bootstraps it with the seed categories (the
// same outcome initializeOwner produces), and it refuses to overwrite a
// stored hash unless --reset is passed.
//
// Usage:
//   set -a; . ./.env.local; set +a
//   pnpm auth:set-password            # prompts without echo
//   pnpm auth:set-password --reset    # overwrite an existing hash
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import pg from "pg";

import { SEED_CATEGORIES } from "../src/features/finance/classification.ts";
import { hashPassword, MIN_PASSWORD_LENGTH } from "../src/server/password.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("set-password: DATABASE_URL is required (source .env.local)");
  process.exit(1);
}

const reset = process.argv.slice(2).includes("--reset");

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    // Mute echo: readline writes typed characters through _writeToOutput;
    // swallow everything after the prompt itself is written.
    const originalWrite = rl._writeToOutput.bind(rl);
    let muted = false;
    rl._writeToOutput = function (chunk) {
      if (muted) {
        return;
      }
      originalWrite(chunk);
      if (chunk.includes(question)) {
        muted = true;
      }
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function readPassword() {
  const fromEnv = process.env.LEDGER_OWNER_PASSWORD;
  if (fromEnv !== undefined && fromEnv !== "") {
    return fromEnv;
  }
  if (process.stdin.isTTY) {
    return promptHidden("Owner password: ");
  }
  const piped = await readStdin();
  return piped.trimEnd();
}

const client = new pg.Client({ connectionString: databaseUrl });

try {
  await client.connect();
  const owners = await client.query(
    "SELECT id, password_hash FROM ledger.owner",
  );
  let owner = owners.rows[0];
  if (!owner) {
    // The singleton owner and its seed categories: the same bootstrap
    // initializeOwner performs, run once here as the explicit setup path.
    await client.query("BEGIN");
    const ownerId = randomUUID();
    await client.query(
      "INSERT INTO ledger.owner (id, singleton_flag, time_zone) VALUES ($1, true, 'America/New_York')",
      [ownerId],
    );
    for (const seed of SEED_CATEGORIES) {
      await client.query(
        "INSERT INTO ledger.category (id, owner_id, stable_key, label) VALUES ($1,$2,$3,$4)",
        [randomUUID(), ownerId, seed.stableKey, seed.label],
      );
    }
    await client.query("COMMIT");
    owner = { id: ownerId, password_hash: null };
    console.log("set-password: owner row and seed categories created");
  }
  if (owner.password_hash !== null && !reset) {
    console.error(
      "set-password: a password is already set; pass --reset to replace it",
    );
    process.exit(1);
  }

  const password = await readPassword();
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(
      `set-password: password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
    process.exit(1);
  }

  const hash = hashPassword(password);
  await client.query(
    "UPDATE ledger.owner SET password_hash = $1 WHERE id = $2",
    [hash, owner.id],
  );
  console.log("set-password: owner password updated");
} finally {
  await client.end().catch(() => {});
}
