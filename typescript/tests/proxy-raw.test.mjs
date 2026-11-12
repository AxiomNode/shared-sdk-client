import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { forwardHttp, UpstreamTimeoutError } from "../dist/proxy.js";
import { forwardHttpRaw } from "../dist/proxy-raw.js";
import * as sdk from "../dist/index.js";

function listen(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function close(server) {
  server.closeAllConnections();
  server.close();
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

test("forwardHttpRaw is exported from the package root and keeps forwardHttp exports", () => {
  assert.equal(typeof sdk.forwardHttpRaw, "function");
  assert.equal(typeof sdk.forwardHttp, "function");
  assert.equal(typeof sdk.UpstreamTimeoutError, "function");
});

test("forwardHttpRaw sends the request bytes untouched with the original content-type", async () => {
  let seen;
  const server = await listen(async (req, res) => {
    seen = { body: await readBody(req), contentType: req.headers["content-type"], method: req.method };
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
  });
  const { port } = server.address();

  // Non-canonical formatting: key order, spacing, duplicate keys and unicode escapes
  // would all be lost by a parse/stringify round trip.
  const original = Buffer.from('{ "b" : 1,  "a":"\\u00e9", "a": 2 }\n', "utf8");

  try {
    await forwardHttpRaw({
      targetUrl: `http://127.0.0.1:${port}/x`,
      method: "POST",
      requestHeaders: { "content-type": "application/json; charset=utf-8" },
      body: original,
      timeoutMs: 2000,
    });
    assert.equal(seen.method, "POST");
    assert.equal(seen.contentType, "application/json; charset=utf-8");
    assert.ok(seen.body.equals(original), "request body bytes must be identical");
  } finally {
    close(server);
  }
});

test("forwardHttpRaw forwards PUT bodies and non-JSON content types", async () => {
  let seen;
  const server = await listen(async (req, res) => {
    seen = { body: await readBody(req), contentType: req.headers["content-type"], method: req.method };
    res.writeHead(204);
    res.end();
  });
  const { port } = server.address();
  const original = Buffer.from([0x00, 0xff, 0xfe, 0x10, 0x80]);

  try {
    const result = await forwardHttpRaw({
      targetUrl: `http://127.0.0.1:${port}/`,
      method: "PUT",
      requestHeaders: { "content-type": "application/octet-stream" },
      body: original,
    });
    assert.equal(result.status, 204);
    assert.equal(seen.method, "PUT");
    assert.equal(seen.contentType, "application/octet-stream");
    assert.ok(seen.body.equals(original));
  } finally {
    close(server);
  }
});

test("forwardHttpRaw defaults the content-type to application/json and honours an explicit one", async () => {
  const seen = [];
  const server = await listen(async (req, res) => {
    await readBody(req);
    seen.push(req.headers["content-type"]);
    res.end("ok");
  });
  const { port } = server.address();
  const targetUrl = `http://127.0.0.1:${port}/`;

  try {
    await forwardHttpRaw({ targetUrl, method: "POST", requestHeaders: {}, body: Buffer.from("{}") });
    await forwardHttpRaw({
      targetUrl,
      method: "POST",
      requestHeaders: { "content-type": "text/plain" },
      contentType: "application/x-custom",
      body: "x",
    });
    assert.deepEqual(seen, ["application/json", "application/x-custom"]);
  } finally {
    close(server);
  }
});

test("forwardHttpRaw does not send a body or content-type on GET and DELETE", async () => {
  const seen = [];
  const server = await listen(async (req, res) => {
    seen.push({ method: req.method, body: await readBody(req), contentType: req.headers["content-type"] });
    res.end("ok");
  });
  const { port } = server.address();
  const targetUrl = `http://127.0.0.1:${port}/`;

  try {
    for (const method of ["GET", "DELETE"]) {
      await forwardHttpRaw({
        targetUrl,
        method,
        requestHeaders: { "content-type": "application/json" },
        body: Buffer.from("{}"),
      });
    }
    for (const entry of seen) {
      assert.equal(entry.body.length, 0);
      assert.equal(entry.contentType, undefined);
    }
  } finally {
    close(server);
  }
});

test("forwardHttpRaw returns the upstream body as identical bytes, with status and headers", async () => {
  const payload = Buffer.from('{ "z":1 ,"a" : "\\u00e9\\n" }', "utf8");
  const server = await listen((_req, res) => {
    res.writeHead(201, {
      "content-type": "application/json; charset=utf-8",
      "x-custom": "yes",
      "cache-control": "no-store",
    });
    res.end(payload);
  });
  const { port } = server.address();

  try {
    const result = await forwardHttpRaw({
      targetUrl: `http://127.0.0.1:${port}/`,
      method: "GET",
      requestHeaders: {},
    });
    assert.equal(result.status, 201);
    assert.equal(result.contentType, "application/json; charset=utf-8");
    assert.equal(result.headers["x-custom"], "yes");
    assert.equal(result.headers["cache-control"], "no-store");
    assert.equal(result.headers["content-length"], undefined);
    assert.equal(result.headers["transfer-encoding"], undefined);
    assert.ok(Buffer.isBuffer(result.body));
    assert.ok(result.body.equals(payload), "response body bytes must be identical");
  } finally {
    close(server);
  }
});

test("forwardHttpRaw passes binary and invalid-JSON bodies through without parsing", async () => {
  const bodies = [Buffer.from([0x00, 0x01, 0xff, 0xfe]), Buffer.from("{not json", "utf8"), Buffer.alloc(0)];
  let index = 0;
  const server = await listen((_req, res) => {
    res.writeHead(200, { "content-type": index === 0 ? "application/octet-stream" : "application/json" });
    res.end(bodies[index++]);
  });
  const { port } = server.address();

  try {
    for (const expected of bodies) {
      const result = await forwardHttpRaw({
        targetUrl: `http://127.0.0.1:${port}/`,
        method: "GET",
        requestHeaders: {},
      });
      assert.ok(result.body.equals(expected));
    }
  } finally {
    close(server);
  }
});

test("forwardHttpRaw preserves error statuses and bodies", async () => {
  const server = await listen((_req, res) => {
    res.writeHead(503, { "content-type": "text/plain" });
    res.end("down");
  });
  const { port } = server.address();

  try {
    const result = await forwardHttpRaw({
      targetUrl: `http://127.0.0.1:${port}/`,
      method: "GET",
      requestHeaders: {},
    });
    assert.equal(result.status, 503);
    assert.equal(result.contentType, "text/plain");
    assert.equal(result.body.toString("utf8"), "down");
  } finally {
    close(server);
  }
});

test("forwardHttpRaw falls back to application/json when the upstream sends no content-type", async () => {
  const server = await listen((_req, res) => {
    res.removeHeader("content-type");
    res.writeHead(200);
    res.end("{}");
  });
  const { port } = server.address();

  try {
    const result = await forwardHttpRaw({
      targetUrl: `http://127.0.0.1:${port}/`,
      method: "GET",
      requestHeaders: {},
    });
    assert.equal(result.contentType, "application/json");
  } finally {
    close(server);
  }
});

test("forwardHttpRaw forwards the shared auth/trace headers like forwardHttp", async () => {
  let seen;
  const server = await listen((req, res) => {
    seen = req.headers;
    res.end("ok");
  });
  const { port } = server.address();

  try {
    await forwardHttpRaw({
      targetUrl: `http://127.0.0.1:${port}/`,
      method: "GET",
      requestHeaders: {
        authorization: "Bearer t",
        "x-correlation-id": "c-1",
        traceparent: "00-abc-def-01",
        "x-not-forwarded": "nope",
      },
    });
    assert.equal(seen.authorization, "Bearer t");
    assert.equal(seen["x-correlation-id"], "c-1");
    assert.equal(seen.traceparent, "00-abc-def-01");
    assert.equal(seen["x-not-forwarded"], undefined);
  } finally {
    close(server);
  }
});

test("forwardHttpRaw aborts when the upstream never sends headers", async () => {
  const server = await listen(() => {
    // never answer
  });
  const { port } = server.address();

  try {
    await assert.rejects(
      forwardHttpRaw({
        targetUrl: `http://127.0.0.1:${port}/`,
        method: "GET",
        requestHeaders: {},
        timeoutMs: 150,
      }),
      (error) => error instanceof UpstreamTimeoutError,
    );
  } finally {
    close(server);
  }
});

test("forwardHttpRaw aborts when the upstream body stalls after headers were sent", async () => {
  const server = await listen((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.write('{"partial":');
    // never finish the body
  });
  const { port } = server.address();

  try {
    await assert.rejects(
      forwardHttpRaw({
        targetUrl: `http://127.0.0.1:${port}/`,
        method: "GET",
        requestHeaders: {},
        timeoutMs: 150,
      }),
      (error) => error instanceof UpstreamTimeoutError,
    );
  } finally {
    close(server);
  }
});

test("forwardHttpRaw does not time out a slow-but-complete body within the limit", async () => {
  const server = await listen((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.write('{"a":');
    setTimeout(() => res.end("1}"), 50);
  });
  const { port } = server.address();

  try {
    const result = await forwardHttpRaw({
      targetUrl: `http://127.0.0.1:${port}/`,
      method: "GET",
      requestHeaders: {},
      timeoutMs: 2000,
    });
    assert.equal(result.body.toString("utf8"), '{"a":1}');
  } finally {
    close(server);
  }
});

test("forwardHttp (JSON mode) still accepts PUT and parses the response", async () => {
  let seen;
  const server = await listen(async (req, res) => {
    seen = { method: req.method, body: (await readBody(req)).toString("utf8"), contentType: req.headers["content-type"] };
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"ok":true}');
  });
  const { port } = server.address();

  try {
    const result = await forwardHttp({
      targetUrl: `http://127.0.0.1:${port}/`,
      method: "PUT",
      requestHeaders: {},
      body: { a: 1 },
      timeoutMs: 2000,
    });
    assert.equal(seen.method, "PUT");
    assert.equal(seen.body, '{"a":1}');
    assert.equal(seen.contentType, "application/json");
    assert.deepEqual(result.payload, { ok: true });
  } finally {
    close(server);
  }
});
