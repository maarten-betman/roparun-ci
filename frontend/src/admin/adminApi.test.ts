/// <reference types="vitest" />

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminApi,
  clearToken,
  getStoredToken,
  storeToken,
  UnauthorizedError,
} from "./adminApi";

const realFetch = globalThis.fetch;

beforeEach(() => {
  // jsdom env in vitest gives us localStorage; start each test clean.
  localStorage.clear();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("adminApi", () => {
  it("attaches the X-Admin-Token header from localStorage", async () => {
    storeToken("secret-abc");
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await adminApi.ping();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1];
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers["x-admin-token"]).toBe("secret-abc");
  });

  it("clears the stored token and throws UnauthorizedError on 401", async () => {
    storeToken("bad-token");
    globalThis.fetch = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response("", { status: 401 }),
    ) as unknown as typeof fetch;

    await expect(adminApi.ping()).rejects.toBeInstanceOf(UnauthorizedError);
    expect(getStoredToken()).toBe(null);
  });

  it("does not throw when token is explicitly cleared", () => {
    storeToken("x");
    clearToken();
    expect(getStoredToken()).toBe(null);
  });
});
