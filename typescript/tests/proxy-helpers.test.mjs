import assert from "node:assert/strict";
import test from "node:test";

import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  UpstreamTimeoutError,
  buildUrl,
  extractForwardHeaders,
  forwardHttp,
  isUpstreamTimeoutError,
} from "../dist/proxy.js";

async function withFetch(stub, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("buildUrl resolves the path against the base and skips nullish query values", () => {
  const url = buildUrl("http://svc:7100", "/games/models", {
    limit: 10,
    category: undefined,
    cursor: null,
    flag: false,
    q: "a b",
  });
  const parsed = new URL(url);

  assert.equal(parsed.origin, "http://svc:7100");
  assert.equal(parsed.pathname, "/games/models");
  assert.equal(parsed.searchParams.get("limit"), "10");
  assert.equal(parsed.searchParams.get("flag"), "false");
  assert.equal(parsed.searchParams.get("q"), "a b");
  assert.equal(parsed.searchParams.has("category"), false);
  assert.equal(parsed.searchParams.has("cursor"), false);
});

test("buildUrl overrides query parameters already present in the path", () => {
  const url = new URL(buildUrl("http://svc", "/x?limit=1&keep=yes", { limit: 5 }));
  assert.equal(url.searchParams.get("limit"), "5");
  assert.equal(url.searchParams.get("keep"), "yes");
});

test("extractForwardHeaders forwards only the allow-listed headers", () => {
  const headers = extractForwardHeaders(
    {
      "x-correlation-id": "corr-1",
      authorization: "Bearer abc",
      "x-dev-firebase-uid": "uid-1",
      "x-firebase-id-token": "fb-token",
      "x-api-key": "key-1",
      traceparent: "00-aaa-bbb-01",
      tracestate: "vendor=1",
      baggage: "k=v",
      cookie: "session=secret",
      "x-forwarded-for": "10.0.0.1",
      host: "internal",
    },
    false,
  );

  assert.deepEqual(headers, {
    "x-correlation-id": "corr-1",
    authorization: "Bearer abc",
    "x-dev-firebase-uid": "uid-1",
    "x-firebase-id-token": "fb-token",
    "x-api-key": "key-1",
    traceparent: "00-aaa-bbb-01",
    tracestate: "vendor=1",
    baggage: "k=v",
  });
});

test("extractForwardHeaders omits empty values and adds content-type only with a body", () => {
  assert.deepEqual(extractForwardHeaders({ authorization: "", "x-api-key": undefined }, false), {});
  assert.deepEqual(extractForwardHeaders({}, true), { "content-type": "application/json" });
});

test("forwardHttp sends JSON bodies for POST and parses JSON responses", async () => {
  let captured;
  const result = await withFetch(
    async (url, init) => {
      captured = { url: String(url), init };
      return new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    },
    () =>
      forwardHttp({
        targetUrl: "http://svc/games",
        method: "POST",
        requestHeaders: { authorization: "Bearer t", cookie: "drop-me" },
        body: { a: 1 },
      }),
  );

  assert.equal(captured.url, "http://svc/games");
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.init.body, JSON.stringify({ a: 1 }));
  assert.deepEqual(captured.init.headers, {
    authorization: "Bearer t",
    "content-type": "application/json",
  });
  assert.equal(result.status, 201);
  assert.equal(result.contentType, "application/json; charset=utf-8");
  assert.deepEqual(result.payload, { ok: true });
});

test("forwardHttp never sends a body or content-type for GET and DELETE", async () => {
  for (const method of ["GET", "DELETE"]) {
    let init;
    await withFetch(
      async (_url, requestInit) => {
        init = requestInit;
        return new Response("{}", { headers: { "content-type": "application/json" } });
      },
      () =>
        forwardHttp({
          targetUrl: "http://svc/x",
          method,
          requestHeaders: {},
          body: { ignored: true },
        }),
    );
    assert.equal(init.body, undefined, method);
    assert.equal(init.headers["content-type"], undefined, method);
  }
});

test("forwardHttp returns text for non-JSON responses and an empty object for invalid JSON", async () => {
  const text = await withFetch(
    async () => new Response("plain body", { status: 200, headers: { "content-type": "text/plain" } }),
    () => forwardHttp({ targetUrl: "http://svc/t", method: "GET", requestHeaders: {} }),
  );
  assert.equal(text.payload, "plain body");
  assert.equal(text.contentType, "text/plain");

  const invalid = await withFetch(
    async () =>
      new Response("not json", { status: 502, headers: { "content-type": "application/json" } }),
    () => forwardHttp({ targetUrl: "http://svc/t", method: "GET", requestHeaders: {} }),
  );
  assert.equal(invalid.status, 502);
  assert.deepEqual(invalid.payload, {});
});

test("forwardHttp propagates non-abort network errors unchanged", async () => {
  const boom = new Error("ECONNREFUSED");
  await assert.rejects(
    withFetch(
      async () => {
        throw boom;
      },
      () => forwardHttp({ targetUrl: "http://svc/t", method: "GET", requestHeaders: {} }),
    ),
    (error) => error === boom,
  );
});

test("UpstreamTimeoutError is recognised by isUpstreamTimeoutError", () => {
  const error = new UpstreamTimeoutError("late");
  assert.equal(error.name, "UpstreamTimeoutError");
  assert.equal(isUpstreamTimeoutError(error), true);
  assert.equal(isUpstreamTimeoutError(new Error("late")), false);
  assert.equal(isUpstreamTimeoutError("late"), false);
});

test("CircuitBreaker opens after the failure threshold and rejects fast", async () => {
  const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 60_000 });
  const fail = async () => {
    throw new Error("down");
  };

  assert.equal(breaker.getState(), "closed");
  await assert.rejects(breaker.call(fail), /down/);
  assert.equal(breaker.getState(), "closed");
  await assert.rejects(breaker.call(fail), /down/);
  assert.equal(breaker.getState(), "open");

  let called = false;
  await assert.rejects(
    breaker.call(async () => {
      called = true;
    }),
    (error) => error instanceof CircuitBreakerOpenError && error.name === "CircuitBreakerOpenError",
  );
  assert.equal(called, false);
});

test("CircuitBreaker success resets the consecutive failure count", async () => {
  const breaker = new CircuitBreaker({ failureThreshold: 2 });
  const fail = async () => {
    throw new Error("down");
  };

  await assert.rejects(breaker.call(fail));
  assert.equal(await breaker.call(async () => "ok"), "ok");
  await assert.rejects(breaker.call(fail));
  assert.equal(breaker.getState(), "closed");
});

test("CircuitBreaker goes half-open after the reset timeout and closes on success", async () => {
  const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 20 });
  await assert.rejects(breaker.call(async () => Promise.reject(new Error("down"))));
  assert.equal(breaker.getState(), "open");

  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(await breaker.call(async () => "recovered"), "recovered");
  assert.equal(breaker.getState(), "closed");
});

test("CircuitBreaker re-opens when the half-open probe fails", async () => {
  const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 20 });
  await assert.rejects(breaker.call(async () => Promise.reject(new Error("down"))));
  await new Promise((resolve) => setTimeout(resolve, 40));
  await assert.rejects(breaker.call(async () => Promise.reject(new Error("still down"))), /still down/);
  assert.equal(breaker.getState(), "open");
});
