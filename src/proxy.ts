import { NextResponse, type NextRequest } from "next/server";

const CANONICAL_HOST = "127.0.0.1:3000";
const CANONICAL_ORIGIN = "http://127.0.0.1:3000";

export function proxy(request: NextRequest) {
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

  return NextResponse.next();
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
