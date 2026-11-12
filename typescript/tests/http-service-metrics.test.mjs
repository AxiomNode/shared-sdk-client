import assert from "node:assert/strict";
import test from "node:test";

import Fastify from "fastify";

import { HttpServiceMetrics, registerHttpMetricsHooks } from "../dist/http-service-metrics.js";
import * as sdk from "../dist/index.js";

function createMetrics(overrides = {}) {
  return new HttpServiceMetrics(
    { SERVICE_NAME: "svc-test", ...overrides },
    { prometheusPrefix: "bff_mobile" },
  );
}

function request(overrides = {}) {
  return {
    method: "GET",
    route: "/v1/x",
    statusCode: 200,
    durationMs: 10,
    requestBytes: 5,
    responseBytes: 7,
    ...overrides,
  };
}

test("is exported from the package root", () => {
  assert.equal(sdk.HttpServiceMetrics, HttpServiceMetrics);
  assert.equal(sdk.registerHttpMetricsHooks, registerHttpMetricsHooks);
});

test("snapshot starts empty and reports the service name", () => {
  const snapshot = createMetrics().snapshot();
  assert.equal(snapshot.service, "svc-test");
  assert.ok(snapshot.uptimeSeconds >= 0);
  assert.deepEqual(snapshot.traffic, {
    requestsReceivedTotal: 0,
    errorsTotal: 0,
    inflightRequests: 0,
    latencyCount: 0,
    latencyAvgMs: 0,
    requestBytesInTotal: 0,
    responseBytesOutTotal: 0,
  });
  assert.deepEqual(snapshot.requestsByRoute, []);
});

test("recordIncomingRequest aggregates traffic, errors, bytes and routes", () => {
  const metrics = createMetrics();
  metrics.recordIncomingRequest(request({ durationMs: 10 }));
  metrics.recordIncomingRequest(request({ durationMs: 30 }));
  metrics.recordIncomingRequest(request({ method: "POST", statusCode: 502, durationMs: 60 }));

  const snapshot = metrics.snapshot();
  assert.equal(snapshot.traffic.requestsReceivedTotal, 3);
  assert.equal(snapshot.traffic.errorsTotal, 1);
  assert.equal(snapshot.traffic.latencyCount, 3);
  assert.equal(snapshot.traffic.latencyAvgMs, 100 / 3);
  assert.equal(snapshot.traffic.requestBytesInTotal, 15);
  assert.equal(snapshot.traffic.responseBytesOutTotal, 21);
  assert.deepEqual(snapshot.requestsByRoute, [
    { method: "GET", route: "/v1/x", statusCode: 200, total: 2 },
    { method: "POST", route: "/v1/x", statusCode: 502, total: 1 },
  ]);
});

test("inflight counter never goes below zero", () => {
  const metrics = createMetrics();
  metrics.decrementInflight();
  assert.equal(metrics.snapshot().traffic.inflightRequests, 0);
  metrics.incrementInflight();
  metrics.incrementInflight();
  metrics.decrementInflight();
  assert.equal(metrics.snapshot().traffic.inflightRequests, 1);
});

test("log buffer keeps only the most recent events and recentLogs honours the limit", () => {
  const metrics = createMetrics({ METRICS_LOG_BUFFER_SIZE: 3 });
  for (let i = 0; i < 5; i += 1) {
    metrics.recordLog("info", `m${i}`, { i });
  }
  assert.deepEqual(
    metrics.recentLogs().map((log) => log.message),
    ["m2", "m3", "m4"],
  );
  assert.deepEqual(
    metrics.recentLogs(2).map((log) => log.message),
    ["m3", "m4"],
  );
  assert.equal(metrics.recentLogs(0).length, 1);
  assert.equal(metrics.recentLogs()[0].level, "info");
  assert.deepEqual(metrics.recentLogs()[0].context, { i: 2 });
  assert.ok(!Number.isNaN(Date.parse(metrics.recentLogs()[0].ts)));
});

test("log buffer defaults to 1000 events", () => {
  const metrics = createMetrics();
  for (let i = 0; i < 1005; i += 1) {
    metrics.recordLog("warn", `m${i}`);
  }
  assert.equal(metrics.recentLogs(5000).length, 1000);
  assert.equal(metrics.recentLogs(1)[0].message, "m1004");
});

test("toPrometheus uses the configured prefix and the exact legacy metric layout", () => {
  const metrics = createMetrics();
  metrics.incrementInflight();
  metrics.recordIncomingRequest(request({ durationMs: 40, requestBytes: 3, responseBytes: 4 }));
  metrics.recordIncomingRequest(request({ statusCode: 500, durationMs: 300, requestBytes: 1, responseBytes: 2 }));

  assert.equal(
    metrics.toPrometheus(),
    [
      "# HELP bff_mobile_requests_received_total Total incoming requests",
      "# TYPE bff_mobile_requests_received_total counter",
      "bff_mobile_requests_received_total 2",
      "# HELP bff_mobile_request_bytes_in_total Total request bytes in",
      "# TYPE bff_mobile_request_bytes_in_total counter",
      "bff_mobile_request_bytes_in_total 4",
      "# HELP bff_mobile_response_bytes_out_total Total response bytes out",
      "# TYPE bff_mobile_response_bytes_out_total counter",
      "bff_mobile_response_bytes_out_total 6",
      "# HELP requests_total Total requests by service/method/route/status",
      "# TYPE requests_total counter",
      'requests_total{service="svc-test",method="GET",route="/v1/x",status_code="200"} 1',
      'requests_total{service="svc-test",method="GET",route="/v1/x",status_code="500"} 1',
      "# HELP errors_total Total 5xx responses",
      "# TYPE errors_total counter",
      'errors_total{service="svc-test"} 1',
      "# HELP inflight_requests Current inflight requests",
      "# TYPE inflight_requests gauge",
      'inflight_requests{service="svc-test"} 1',
      "# HELP latency_ms_bucket Request latency bucketed histogram",
      "# TYPE latency_ms_bucket histogram",
      'latency_ms_bucket{service="svc-test",le="50"} 1',
      'latency_ms_bucket{service="svc-test",le="100"} 1',
      'latency_ms_bucket{service="svc-test",le="250"} 1',
      'latency_ms_bucket{service="svc-test",le="500"} 2',
      'latency_ms_bucket{service="svc-test",le="1000"} 2',
      'latency_ms_bucket{service="svc-test",le="2500"} 2',
      'latency_ms_bucket{service="svc-test",le="5000"} 2',
      'latency_ms_bucket{service="svc-test",le="+Inf"} 2',
      'latency_ms_sum{service="svc-test"} 340',
      'latency_ms_count{service="svc-test"} 2',
    ].join("\n"),
  );

  const other = new HttpServiceMetrics({ SERVICE_NAME: "x" }, { prometheusPrefix: "edge" });
  assert.match(other.toPrometheus(), /^# HELP edge_requests_received_total /);
});

async function buildHooksApp(options = {}) {
  const metrics = createMetrics();
  const app = Fastify();
  registerHttpMetricsHooks(app, { metrics, serviceName: "svc-test", ...options });
  app.get("/health", async () => ({ ok: true }));
  app.get("/items/:id", async () => ({ ok: true }));
  app.get("/fail", async (_request, reply) => reply.code(503).send({ error: "no" }));
  app.post("/items", async () => ({ created: true }));
  await app.ready();
  return { app, metrics };
}

test("hooks reuse or generate the correlation id and record the request", async () => {
  const { app, metrics } = await buildHooksApp();
  try {
    const withId = await app.inject({ method: "GET", url: "/items/1", headers: { "x-correlation-id": " abc " } });
    assert.equal(withId.statusCode, 200);
    // The id is exposed to handlers and logs; the legacy onResponse hook sets the
    // response header too late to reach the client, so it is not asserted here.

    const generated = await app.inject({ method: "GET", url: "/items/2" });
    assert.equal(generated.statusCode, 200);

    const snapshot = metrics.snapshot();
    assert.equal(snapshot.traffic.requestsReceivedTotal, 2);
    assert.equal(snapshot.traffic.inflightRequests, 0);
    // Route template, not the concrete URL.
    assert.deepEqual(snapshot.requestsByRoute, [{ method: "GET", route: "/items/:id", statusCode: 200, total: 2 }]);

    const logs = metrics.recentLogs();
    assert.equal(logs.length, 2);
    assert.equal(logs[0].message, "request_completed");
    assert.equal(logs[0].level, "info");
    assert.equal(logs[0].context.correlation_id, "abc");
    assert.match(logs[1].context.correlation_id, /^[0-9a-f-]{36}$/);
    assert.equal(logs[0].context.route, "/items/:id");
    assert.equal(logs[0].context.status_code, 200);
  } finally {
    await app.close();
  }
});

test("hooks skip /health but still balance the inflight counter", async () => {
  const { app, metrics } = await buildHooksApp();
  try {
    await app.inject({ method: "GET", url: "/health" });
    const snapshot = metrics.snapshot();
    assert.equal(snapshot.traffic.requestsReceivedTotal, 0);
    assert.equal(snapshot.traffic.inflightRequests, 0);
    assert.equal(metrics.recentLogs().length, 0);
  } finally {
    await app.close();
  }
});

test("hooks classify log levels, count 5xx and report request bytes", async () => {
  const { app, metrics } = await buildHooksApp();
  try {
    await app.inject({ method: "GET", url: "/fail" });
    await app.inject({ method: "GET", url: "/missing" });
    await app.inject({ method: "POST", url: "/items", payload: { a: 1 } });

    const snapshot = metrics.snapshot();
    assert.equal(snapshot.traffic.requestsReceivedTotal, 3);
    assert.equal(snapshot.traffic.errorsTotal, 1);
    assert.ok(snapshot.traffic.requestBytesInTotal > 0);
    assert.ok(snapshot.requestsByRoute.some((row) => row.route === "UNMATCHED" && row.statusCode === 404));

    const levels = metrics.recentLogs().map((log) => log.level);
    assert.deepEqual(levels, ["error", "warn", "info"]);
  } finally {
    await app.close();
  }
});

test("onRequestCompleted runs after recording, only for non-health routes, and inflight is still decremented", async () => {
  const calls = [];
  const { app, metrics } = await buildHooksApp({
    onRequestCompleted: (info) => {
      calls.push({
        route: info.route,
        status: info.reply.statusCode,
        method: info.request.method,
        correlationId: info.correlationId,
        recorded: metrics.snapshot().traffic.requestsReceivedTotal,
        inflight: metrics.snapshot().traffic.inflightRequests,
      });
    },
  });
  try {
    await app.inject({ method: "GET", url: "/health" });
    await app.inject({ method: "GET", url: "/items/9" });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].route, "/items/:id");
    assert.equal(calls[0].status, 200);
    assert.equal(calls[0].method, "GET");
    assert.equal(calls[0].recorded, 1);
    assert.equal(calls[0].inflight, 1);
    assert.ok(calls[0].correlationId);
    assert.equal(metrics.snapshot().traffic.inflightRequests, 0);
  } finally {
    await app.close();
  }
});
