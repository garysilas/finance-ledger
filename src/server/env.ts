import "server-only";
import { z } from "zod";

const IDENTIFIER = /^[a-z][a-z0-9_]{0,62}$/;

const fileSchema = z.object({
  POSTGRES_DB: z.string().regex(IDENTIFIER),
  POSTGRES_USER: z.string().regex(IDENTIFIER),
  POSTGRES_PASSWORD: z.string().min(1),
  LEDGER_DB_USER: z.string().regex(IDENTIFIER),
  LEDGER_DB_PASSWORD: z.string().min(1),
  DATABASE_URL: z.string().min(1),
});

export interface AppConfig {
  databaseUrl: string;
}

export type EnvResult =
  | { ok: true; config: AppConfig }
  | { ok: false };

function urlMatchesSettings(raw: string, env: z.infer<typeof fileSchema>): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "postgresql:") return false;
  if (url.hostname !== "127.0.0.1") return false;
  if (url.port !== "5432") return false;
  if (url.search !== "" || url.hash !== "") return false;
  if (url.pathname !== `/${env.POSTGRES_DB}`) return false;
  try {
    if (decodeURIComponent(url.username) !== env.LEDGER_DB_USER) return false;
    if (decodeURIComponent(url.password) !== env.LEDGER_DB_PASSWORD) return false;
  } catch {
    return false;
  }
  return true;
}

export function validateEnv(source: NodeJS.ProcessEnv = process.env): EnvResult {
  const parsed = fileSchema.safeParse({
    POSTGRES_DB: source.POSTGRES_DB,
    POSTGRES_USER: source.POSTGRES_USER,
    POSTGRES_PASSWORD: source.POSTGRES_PASSWORD,
    LEDGER_DB_USER: source.LEDGER_DB_USER,
    LEDGER_DB_PASSWORD: source.LEDGER_DB_PASSWORD,
    DATABASE_URL: source.DATABASE_URL,
  });
  if (!parsed.success) return { ok: false };
  const env = parsed.data;
  if (env.LEDGER_DB_USER === env.POSTGRES_USER) return { ok: false };
  if (env.LEDGER_DB_PASSWORD === env.POSTGRES_PASSWORD) return { ok: false };
  if (!urlMatchesSettings(env.DATABASE_URL, env)) return { ok: false };
  return { ok: true, config: { databaseUrl: env.DATABASE_URL } };
}
