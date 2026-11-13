import { defineConfig } from "drizzle-kit";

function validatedUrl(raw: string): string {
  const url = new URL(raw);
  const valid =
    url.protocol === "postgresql:" &&
    url.hostname === "127.0.0.1" &&
    url.port !== "" &&
    url.search === "" &&
    url.hash === "" &&
    /^\/[a-z][a-z0-9_]{0,62}$/.test(url.pathname);
  if (!valid) {
    throw new Error(
      "MIGRATION_DATABASE_URL fails the loopback database URL rules",
    );
  }
  return raw;
}

const url = process.env.MIGRATION_DATABASE_URL;

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./db/migrations",
  schemaFilter: ["ledger"],
  dbCredentials: {
    url: url
      ? validatedUrl(url)
      : "postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder",
  },
  verbose: false,
  strict: true,
});
