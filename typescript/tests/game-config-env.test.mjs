import assert from "node:assert/strict";
import test from "node:test";

import { createGameConfigSchema, loadGameConfig } from "../dist/game-config.js";

const defaults = {
  serviceName: "microservice-test",
  servicePort: 7100,
  generationEndpoint: "/generate/test",
  ingestEndpoint: "/ingest/test",
  maxQuestionsDefault: 12,
};

function load(env) {
  const previousEnv = process.env;
  process.env = { ...env };
  try {
    return loadGameConfig(createGameConfigSchema(defaults));
  } finally {
    process.env = previousEnv;
  }
}

const base = {
  DATABASE_URL: "postgresql://service:service@localhost:5432/service",
  PRIVATE_DOCS_ENABLED: "false",
};

test("game config applies service defaults and coerces numeric env values", () => {
  const config = load({ ...base, SERVICE_PORT: "8080", BATCH_GENERATION_CONCURRENCY: "4" });

  assert.equal(config.SERVICE_NAME, "microservice-test");
  assert.equal(config.SERVICE_PORT, 8080);
  assert.equal(config.NODE_ENV, "development");
  assert.equal(config.AI_ENGINE_BASE_URL, "http://localhost:7001");
  assert.equal(config.AI_ENGINE_GENERATION_ENDPOINT, "/generate/test");
  assert.equal(config.AI_ENGINE_INGEST_ENDPOINT, "/ingest/test");
  assert.equal(config.AI_ENGINE_CATALOGS_ENDPOINT, "/catalogs");
  assert.equal(config.BATCH_GENERATION_CONCURRENCY, 4);
  assert.equal(config.BATCH_GENERATION_MAX_QUESTIONS, 12);
  assert.equal(config.BATCH_GENERATION_ENABLED, false);
  assert.equal(config.METRICS_LOG_BUFFER_SIZE, 500);
  assert.equal(config.PRIVATE_DOCS_PREFIX, "/private/docs");
});

test("game config parses boolean env flags in several spellings", () => {
  for (const [raw, expected] of [
    ["true", true],
    ["1", true],
    ["YES", true],
    [" on ", true],
    ["false", false],
    ["0", false],
    ["No", false],
    ["off", false],
  ]) {
    assert.equal(load({ ...base, BATCH_GENERATION_ENABLED: raw }).BATCH_GENERATION_ENABLED, expected, raw);
  }
});

test("game config rejects unparsable booleans and out-of-range numbers", () => {
  assert.throws(() => load({ ...base, BATCH_GENERATION_ENABLED: "maybe" }));
  assert.throws(() => load({ ...base, AI_ENGINE_REQUEST_TIMEOUT_MS: "100" }));
  assert.throws(() => load({ ...base, SERVICE_PORT: "-1" }));
  assert.throws(() => load({ ...base, AI_ENGINE_BASE_URL: "not-a-url" }));
});

test("game config requires DATABASE_URL", () => {
  assert.throws(() => load({ PRIVATE_DOCS_ENABLED: "false" }));
});

test("game config treats an empty PRIVATE_DOCS_TOKEN as unset", () => {
  assert.throws(
    () => load({ DATABASE_URL: base.DATABASE_URL, PRIVATE_DOCS_ENABLED: "true", PRIVATE_DOCS_TOKEN: "  " }),
    /Private docs require PRIVATE_DOCS_TOKEN or AI_ENGINE_API_KEY/,
  );
});

test("game config accepts private docs with either a docs token or the AI engine key", () => {
  assert.equal(
    load({ DATABASE_URL: base.DATABASE_URL, PRIVATE_DOCS_TOKEN: "tok" }).PRIVATE_DOCS_TOKEN,
    "tok",
  );
  assert.equal(
    load({ DATABASE_URL: base.DATABASE_URL, AI_ENGINE_API_KEY: "key" }).AI_ENGINE_API_KEY,
    "key",
  );
});
