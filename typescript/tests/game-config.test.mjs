import assert from "node:assert/strict";
import test from "node:test";

import { createGameConfigSchema, loadGameConfig } from "../dist/game-config.js";

test("game config exposes generation item timeout defaults", () => {
  const previousEnv = { ...process.env };
  process.env = {
    DATABASE_URL: "postgresql://service:service@localhost:5432/service",
    PRIVATE_DOCS_ENABLED: "false",
  };

  try {
    const schema = createGameConfigSchema({
      serviceName: "microservice-test",
      servicePort: 7100,
      generationEndpoint: "/generate/test",
      ingestEndpoint: "/ingest/test",
      maxQuestionsDefault: 10,
    });
    const config = loadGameConfig(schema);

    assert.equal(config.GAME_GENERATION_ITEM_TIMEOUT_MS, 90000);
    assert.equal(config.GAME_GENERATION_ITEM_RETRY_MAX_ATTEMPTS, 1);
  } finally {
    process.env = previousEnv;
  }
});