import assert from "node:assert/strict";
import test from "node:test";

import { AiEngineClient } from "../dist/ai-engine-client.js";

function createConfig() {
  return {
    AI_ENGINE_BASE_URL: "http://localhost:7001",
    AI_ENGINE_GENERATION_ENDPOINT: "/generate/quiz",
    AI_ENGINE_INGEST_ENDPOINT: "/ingest/quiz",
    AI_ENGINE_CATALOGS_ENDPOINT: "/catalogs",
    AI_ENGINE_REQUEST_TIMEOUT_MS: 420000,
    AI_ENGINE_RETRY_MAX_ATTEMPTS: 8,
  };
}

test("generate forwards per-request timeout options to fetch", async () => {
  const originalFetch = globalThis.fetch;
  const originalTimeout = globalThis.AbortSignal.timeout;
  let capturedTimeoutMs = 0;
  let capturedUrl = "";

  globalThis.AbortSignal.timeout = (timeoutMs) => {
    capturedTimeoutMs = timeoutMs;
    return new AbortController().signal;
  };
  globalThis.fetch = async (url) => {
    capturedUrl = String(url);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  try {
    const client = new AiEngineClient(createConfig());
    const response = await client.generate(
      { query: "Science", item_count: "1" },
      { timeoutMs: 5000, maxAttempts: 1 },
    );

    assert.deepEqual(response, { ok: true });
    assert.equal(capturedTimeoutMs, 5000);
    assert.equal(capturedUrl, "http://localhost:7001/generate/quiz?query=Science&item_count=1");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.AbortSignal.timeout = originalTimeout;
  }
});