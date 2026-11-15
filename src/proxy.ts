import { NextResponse, type NextRequest } from "next/server";

const CANONICAL_HOST = "127.0.0.1:3000";
const CANONICAL_ORIGIN = "http://127.0.0.1:3000";
const SESSION_COOKIE = "ledger_session";

// Public destinations. Everything else, including server action posts to
// protected pages, requires a session cookie at the boundary; the row
// itself is revalidated inside each page and action by requireSession.
const PUBLIC_PATHS = new Set(["/signin", "/status", "/design"]);

export function proxy(request: NextRequest) {
  // The webhook route carries its own authentication (the
  // Plaid-Verification signature) and must stay reachable however the
  // engineer exposes it during a Sandbox delivery test, so it sits
  // outside the host, origin, and cookie checks.
  if (request.nextUrl.pathname === "/api/webhooks/plaid") {
    return NextResponse.next();
  }

  const host = request.headers.get("host");
  if (host === null || host.includes(",") || host !== CANONICAL_HOST) {
    return new NextResponse("Invalid Host header.", {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const origin = request.headers.get("origin");
  if (origin !== null && origin !== CANONICAL_ORIGIN) {
    return new NextResponse("Cross-origin requests are not allowed.", {
      status: 403,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const { pathname, search } = request.nextUrl;
  if (
    !PUBLIC_PATHS.has(pathname) &&
    request.cookies.get(SESSION_COOKIE)?.value === undefined
  ) {
    const signIn = new URL("/signin", CANONICAL_ORIGIN);
    const target = `${pathname}${search}`;
    if (target !== "/") {
      signIn.searchParams.set("return", target);
    }
    return NextResponse.redirect(signIn, 307);
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
