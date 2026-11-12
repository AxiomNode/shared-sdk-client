import assert from "node:assert/strict";
import test from "node:test";

import swagger from "@fastify/swagger";
import Fastify from "fastify";

import {
  isAuthorizedForPrivateDocs,
  registerPrivateDocs,
  resolvePrivateDocsToken,
} from "../dist/private-docs.js";

test("resolvePrivateDocsToken prefers the dedicated token over the AI engine key", () => {
  assert.equal(
    resolvePrivateDocsToken({ PRIVATE_DOCS_TOKEN: "docs", AI_ENGINE_API_KEY: "ai" }),
    "docs",
  );
});

test("resolvePrivateDocsToken falls back to the AI engine key unless disabled", () => {
  assert.equal(resolvePrivateDocsToken({ AI_ENGINE_API_KEY: "ai" }), "ai");
  assert.equal(
    resolvePrivateDocsToken({ AI_ENGINE_API_KEY: "ai" }, { fallbackToAiEngineKey: false }),
    null,
  );
  assert.equal(resolvePrivateDocsToken({ PRIVATE_DOCS_TOKEN: "", AI_ENGINE_API_KEY: null }), null);
  assert.equal(resolvePrivateDocsToken({}), null);
});

test("isAuthorizedForPrivateDocs accepts the custom header or a Bearer token", () => {
  assert.equal(isAuthorizedForPrivateDocs({ "x-private-docs-token": "s3" }, "s3"), true);
  assert.equal(isAuthorizedForPrivateDocs({ "x-private-docs-token": ["s3", "other"] }, "s3"), true);
  assert.equal(isAuthorizedForPrivateDocs({ authorization: "Bearer s3" }, "s3"), true);
  assert.equal(isAuthorizedForPrivateDocs({ authorization: ["Bearer s3"] }, "s3"), true);
  assert.equal(isAuthorizedForPrivateDocs({ authorization: "Bearer   s3  " }, "s3"), true);
});

test("isAuthorizedForPrivateDocs rejects missing, wrong and non-Bearer credentials", () => {
  assert.equal(isAuthorizedForPrivateDocs({}, "s3"), false);
  assert.equal(isAuthorizedForPrivateDocs({ "x-private-docs-token": "nope" }, "s3"), false);
  assert.equal(isAuthorizedForPrivateDocs({ authorization: "Bearer nope" }, "s3"), false);
  assert.equal(isAuthorizedForPrivateDocs({ authorization: "Basic s3" }, "s3"), false);
  assert.equal(isAuthorizedForPrivateDocs({ authorization: "s3" }, "s3"), false);
  assert.equal(isAuthorizedForPrivateDocs({ "x-private-docs-token": 5 }, "5"), false);
});

async function buildApp(config) {
  const app = Fastify();
  await app.register(swagger, { openapi: { info: { title: "t", version: "0" } } });
  await registerPrivateDocs(app, config);
  await app.ready();
  return app;
}

test("registerPrivateDocs does nothing when disabled", async () => {
  const app = await buildApp({ PRIVATE_DOCS_ENABLED: false });
  try {
    const response = await app.inject({ method: "GET", url: "/private/docs/json" });
    assert.equal(response.statusCode, 404);
  } finally {
    await app.close();
  }
});

test("registerPrivateDocs throws when enabled without any token", async () => {
  const app = Fastify();
  await app.register(swagger, { openapi: { info: { title: "t", version: "0" } } });
  await assert.rejects(
    registerPrivateDocs(app, { PRIVATE_DOCS_ENABLED: true }),
    /no token is configured/,
  );
  await app.close();
});

test("registerPrivateDocs protects the docs routes with the token", async () => {
  const app = await buildApp({
    PRIVATE_DOCS_ENABLED: true,
    PRIVATE_DOCS_PREFIX: "/internal/docs",
    PRIVATE_DOCS_TOKEN: "s3cret",
  });
  try {
    const denied = await app.inject({ method: "GET", url: "/internal/docs/json" });
    assert.equal(denied.statusCode, 401);
    assert.deepEqual(denied.json(), { message: "Unauthorized private docs access" });

    const allowed = await app.inject({
      method: "GET",
      url: "/internal/docs/json",
      headers: { authorization: "Bearer s3cret" },
    });
    assert.equal(allowed.statusCode, 200);
    assert.equal(allowed.json().info.title, "t");
  } finally {
    await app.close();
  }
});

test("registerPrivateDocs falls back to the AI engine key and the default prefix", async () => {
  const app = await buildApp({ PRIVATE_DOCS_ENABLED: true, AI_ENGINE_API_KEY: "ai-key" });
  try {
    const denied = await app.inject({ method: "GET", url: "/private/docs/json" });
    assert.equal(denied.statusCode, 401);
    const allowed = await app.inject({
      method: "GET",
      url: "/private/docs/json",
      headers: { "x-private-docs-token": "ai-key" },
    });
    assert.equal(allowed.statusCode, 200);
  } finally {
    await app.close();
  }
});
