"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { validateEnv } from "@/server/env";
import { revokeCurrentSession, SESSION_COOKIE_NAME } from "@/server/session";

// Sign out revokes the session row and clears the cookie. A database
// failure still clears the cookie so the browser is never stuck holding
// an opaque token the server may already have lost.
export async function signOut(): Promise<void> {
  const env = validateEnv();
  if (env.ok) {
    await revokeCurrentSession(env.config.databaseUrl);
  }
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
  redirect("/signin");
}
