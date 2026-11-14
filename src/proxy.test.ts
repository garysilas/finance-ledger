import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { proxy } from "./proxy";

function request(headers: Record<string, string> = {}) {
  return new NextRequest("http://127.0.0.1:3000/", {
    headers: { host: "127.0.0.1:3000", ...headers },
  });
}

describe("proxy", () => {
  it.each(["/status", "/design", "/accounts/future"])(
    "AC-4 enforces request boundaries at %s",
    async (path) => {
      const local = new NextRequest(`http://127.0.0.1:3000${path}`, {
        headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
      });
      expect(proxy(local).headers.get("x-middleware-next")).toBe("1");
      local.headers.set("origin", "null");
      expect(proxy(local).status).toBe(403);
      local.headers.set("host", "evil.example");
      const rejected = proxy(local);
      expect(rejected.status).toBe(400);
      expect(await rejected.text()).toBe("Invalid Host header.");
    },
  );
  it("passes a request with the canonical host and no origin", async () => {
    const response = proxy(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("passes a request whose origin is the canonical origin", () => {
    const response = proxy(request({ origin: "http://127.0.0.1:3000" }));
    expect(response.status).toBe(200);
  });

  it.each([
    ["a different host", "localhost:3000"],
    ["the host without its port", "127.0.0.1"],
    ["a comma joined duplicate host", "127.0.0.1:3000,127.0.0.1:3000"],
    ["a forwarded attacker host", "evil.example"],
  ])("rejects %s with 400", async (_label, host) => {
    const response = proxy(request({ host }));
    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Invalid Host header.");
  });

  it("rejects a request without a host header", () => {
    const req = request();
    req.headers.delete("host");
    const response = proxy(req);
    expect(response.status).toBe(400);
  });

  it.each([
    ["a foreign origin", "https://evil.example"],
    ["an origin missing the port", "http://127.0.0.1"],
    ["a different scheme", "https://127.0.0.1:3000"],
  ])("rejects %s with 403", async (_label, origin) => {
    const response = proxy(request({ origin }));
    expect(response.status).toBe(403);
    expect(await response.text()).toBe(
      "Cross-origin requests are not allowed.",
    );
  });
});
