"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { validateEnv } from "@/server/env";
import { SESSION_COOKIE_NAME, signIn } from "@/server/session";

export type SignInState = {
  error: string | null;
};

// Only same origin absolute paths may be return targets; anything else
// falls back to the spending view.
function safeReturnPath(raw: FormDataEntryValue | null): string {
  if (typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//")) {
    return raw;
  }
  return "/spending";
}

export async function signInAction(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const env = validateEnv();
  if (!env.ok) {
    return { error: "Sign in is unavailable right now." };
  }
  const password = formData.get("password");
  const result = await signIn(
    env.config.databaseUrl,
    typeof password === "string" ? password : "",
  );
  if (!result.ok) {
    // Generic by design: nothing about which factor failed or whether the
    // owner row exists.
    return { error: "That password did not work." };
  }
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, result.value.token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: false,
    expires: result.value.expiresAt,
  });
  redirect(safeReturnPath(formData.get("return")));
}
