import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { forwardHttp, UpstreamTimeoutError } from "../dist/proxy.js";

function listen(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

test("forwardHttp aborts when the upstream body stalls after headers were sent", async () => {
  const server = await listen((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.write('{"partial":');
    // never finish the body
  });
  const { port } = server.address();

  try {
    await assert.rejects(
      forwardHttp({
        targetUrl: `http://127.0.0.1:${port}/`,
        method: "GET",
        requestHeaders: {},
        timeoutMs: 150,
      }),
      (error) => error instanceof UpstreamTimeoutError,
    );
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test("forwardHttp returns the parsed body when the upstream answers in time", async () => {
  const server = await listen((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"ok":true}');
  });
  const { port } = server.address();

  try {
    const result = await forwardHttp({
      targetUrl: `http://127.0.0.1:${port}/`,
      method: "GET",
      requestHeaders: {},
      timeoutMs: 2000,
    });
    assert.equal(result.status, 200);
    assert.deepEqual(result.payload, { ok: true });
  } finally {
    server.closeAllConnections();
    server.close();
  }
});
