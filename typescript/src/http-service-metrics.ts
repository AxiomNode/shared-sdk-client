import { randomUUID } from "node:crypto";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

/** @module http-service-metrics - In-memory request metrics, log ring buffer and Prometheus export for plain HTTP services (gateway, BFFs). */

export type HttpMetricsLogLevel = "info" | "warn" | "error";

export type HttpMetricsLogEvent = {
  ts: string;
  level: HttpMetricsLogLevel;
  message: string;
  context?: Record<string, unknown>;
};

export interface HttpServiceMetricsConfig {
  SERVICE_NAME: string;
  /** Maximum number of log events kept in memory. Defaults to 1000. */
  METRICS_LOG_BUFFER_SIZE?: number;
}

export interface HttpServiceMetricsOptions {
  /**
   * Prefix of the three service-specific counters in the Prometheus output:
   * `<prefix>_requests_received_total`, `<prefix>_request_bytes_in_total` and
   * `<prefix>_response_bytes_out_total` (for example `bff_mobile`).
   */
  prometheusPrefix: string;
}

export interface IncomingRequestMetric {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
  requestBytes: number;
  responseBytes: number;
}

/** Collects request counts, latency histograms, byte totals, and structured logs. */
export class HttpServiceMetrics {
  private readonly startedAt = Date.now();
  private readonly routeCounters = new Map<string, number>();
  private readonly logs: HttpMetricsLogEvent[] = [];
  private readonly latencyBucketsMs = [50, 100, 250, 500, 1000, 2500, 5000] as const;
  private readonly latencyBucketCounters = new Map<number, number>();
  private readonly prometheusPrefix: string;

  private requestsReceivedTotal = 0;
  private errorsTotal = 0;
  private inflightRequests = 0;
  private latencyCount = 0;
  private latencySumMs = 0;
  private requestBytesInTotal = 0;
  private responseBytesOutTotal = 0;

  constructor(
    private readonly config: HttpServiceMetricsConfig,
    options: HttpServiceMetricsOptions,
  ) {
    this.prometheusPrefix = options.prometheusPrefix;
    for (const bucket of this.latencyBucketsMs) {
      this.latencyBucketCounters.set(bucket, 0);
    }
  }

  incrementInflight(): void {
    this.inflightRequests += 1;
  }

  decrementInflight(): void {
    this.inflightRequests = Math.max(0, this.inflightRequests - 1);
  }

  recordIncomingRequest(metric: IncomingRequestMetric): void {
    this.requestsReceivedTotal += 1;
    if (metric.statusCode >= 500) {
      this.errorsTotal += 1;
    }

    this.latencyCount += 1;
    this.latencySumMs += metric.durationMs;
    for (const bucket of this.latencyBucketsMs) {
      if (metric.durationMs <= bucket) {
        this.latencyBucketCounters.set(bucket, (this.latencyBucketCounters.get(bucket) ?? 0) + 1);
      }
    }

    this.requestBytesInTotal += metric.requestBytes;
    this.responseBytesOutTotal += metric.responseBytes;

    const key = `${metric.method}|${metric.route}|${metric.statusCode}`;
    this.routeCounters.set(key, (this.routeCounters.get(key) ?? 0) + 1);
  }

  recordLog(level: HttpMetricsLogLevel, message: string, context?: Record<string, unknown>): void {
    this.logs.push({
      ts: new Date().toISOString(),
      level,
      message,
      context,
    });

    const maxSize = this.config.METRICS_LOG_BUFFER_SIZE ?? 1000;
    if (this.logs.length > maxSize) {
      this.logs.splice(0, this.logs.length - maxSize);
    }
  }

  recentLogs(limit = 200): HttpMetricsLogEvent[] {
    return this.logs.slice(-Math.max(1, limit));
  }

  snapshot() {
    return {
      service: this.config.SERVICE_NAME,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      traffic: {
        requestsReceivedTotal: this.requestsReceivedTotal,
        errorsTotal: this.errorsTotal,
        inflightRequests: this.inflightRequests,
        latencyCount: this.latencyCount,
        latencyAvgMs: this.latencyCount > 0 ? this.latencySumMs / this.latencyCount : 0,
        requestBytesInTotal: this.requestBytesInTotal,
        responseBytesOutTotal: this.responseBytesOutTotal,
      },
      requestsByRoute: Array.from(this.routeCounters.entries()).map(([key, total]) => {
        const [method, route, statusCode] = key.split("|");
        return {
          method,
          route,
          statusCode: Number(statusCode),
          total,
        };
      }),
    };
  }

  toPrometheus(): string {
    const lines: string[] = [];
    const prefix = this.prometheusPrefix;

    lines.push(`# HELP ${prefix}_requests_received_total Total incoming requests`);
    lines.push(`# TYPE ${prefix}_requests_received_total counter`);
    lines.push(`${prefix}_requests_received_total ${this.requestsReceivedTotal}`);

    lines.push(`# HELP ${prefix}_request_bytes_in_total Total request bytes in`);
    lines.push(`# TYPE ${prefix}_request_bytes_in_total counter`);
    lines.push(`${prefix}_request_bytes_in_total ${this.requestBytesInTotal}`);

    lines.push(`# HELP ${prefix}_response_bytes_out_total Total response bytes out`);
    lines.push(`# TYPE ${prefix}_response_bytes_out_total counter`);
    lines.push(`${prefix}_response_bytes_out_total ${this.responseBytesOutTotal}`);

    lines.push("# HELP requests_total Total requests by service/method/route/status");
    lines.push("# TYPE requests_total counter");
    for (const [key, total] of this.routeCounters.entries()) {
      const [method, route, statusCode] = key.split("|");
      lines.push(
        `requests_total{service="${this.config.SERVICE_NAME}",method="${method}",route="${route}",status_code="${statusCode}"} ${total}`,
      );
    }

    lines.push("# HELP errors_total Total 5xx responses");
    lines.push("# TYPE errors_total counter");
    lines.push(`errors_total{service="${this.config.SERVICE_NAME}"} ${this.errorsTotal}`);

    lines.push("# HELP inflight_requests Current inflight requests");
    lines.push("# TYPE inflight_requests gauge");
    lines.push(`inflight_requests{service="${this.config.SERVICE_NAME}"} ${this.inflightRequests}`);

    lines.push("# HELP latency_ms_bucket Request latency bucketed histogram");
    lines.push("# TYPE latency_ms_bucket histogram");
    for (const bucket of this.latencyBucketsMs) {
      lines.push(
        `latency_ms_bucket{service="${this.config.SERVICE_NAME}",le="${bucket}"} ${this.latencyBucketCounters.get(bucket) ?? 0}`,
      );
    }
    lines.push(`latency_ms_bucket{service="${this.config.SERVICE_NAME}",le="+Inf"} ${this.latencyCount}`);
    lines.push(`latency_ms_sum{service="${this.config.SERVICE_NAME}"} ${this.latencySumMs}`);
    lines.push(`latency_ms_count{service="${this.config.SERVICE_NAME}"} ${this.latencyCount}`);

    return lines.join("\n");
  }
}

export interface HttpMetricsHooksOptions {
  metrics: Pick<HttpServiceMetrics, "incrementInflight" | "decrementInflight" | "recordIncomingRequest" | "recordLog">;
  serviceName: string;
  /**
   * Called for every non-`/health` response after the request has been recorded
   * and logged, and before the inflight counter is decremented.
   */
  onRequestCompleted?: (info: {
    request: FastifyRequest;
    reply: FastifyReply;
    route: string;
    correlationId: string;
    durationMs: number;
    requestBytes: number;
    responseBytes: number;
  }) => void;
}

type MetricsRequest = FastifyRequest & {
  _requestBytes?: number;
  _startedAt?: number;
  _correlationId?: string;
};

/**
 * Registers the `onRequest`/`onResponse` hooks shared by the edge services:
 * correlation-id propagation, inflight tracking, request metrics, a
 * `request_completed` log event and a structured Fastify log line. `/health`
 * is not recorded.
 */
export function registerHttpMetricsHooks(app: FastifyInstance, options: HttpMetricsHooksOptions): void {
  const { metrics, serviceName } = options;

  app.addHook("onRequest", async (request) => {
    const requestAny = request as MetricsRequest;

    requestAny._startedAt = Date.now();
    const contentLength = Number(request.headers["content-length"] ?? 0);
    requestAny._requestBytes = Number.isFinite(contentLength) ? contentLength : 0;

    const inboundCorrelationId = String(request.headers["x-correlation-id"] ?? "").trim();
    requestAny._correlationId = inboundCorrelationId || randomUUID();
    request.headers["x-correlation-id"] = requestAny._correlationId;

    metrics.incrementInflight();
  });

  app.addHook("onResponse", async (request, reply) => {
    if (request.url === "/health") {
      metrics.decrementInflight();
      return;
    }

    const requestAny = request as MetricsRequest;

    const responseContentLength = Number(reply.getHeader("content-length") ?? 0);
    const responseBytes = Number.isFinite(responseContentLength) ? responseContentLength : 0;
    const route = (request.routeOptions.url ?? "UNMATCHED") as string;
    const correlationId = requestAny._correlationId ?? randomUUID();
    const durationMs = Math.max(0, Date.now() - (requestAny._startedAt ?? Date.now()));
    const requestBytes = requestAny._requestBytes ?? 0;

    reply.header("x-correlation-id", correlationId);

    metrics.recordIncomingRequest({
      method: request.method,
      route,
      statusCode: reply.statusCode,
      durationMs,
      requestBytes,
      responseBytes,
    });

    metrics.recordLog(
      reply.statusCode >= 500 ? "error" : reply.statusCode >= 400 ? "warn" : "info",
      "request_completed",
      {
        correlation_id: correlationId,
        method: request.method,
        route,
        status_code: reply.statusCode,
        duration_ms: durationMs,
        request_bytes: requestBytes,
        response_bytes: responseBytes,
      },
    );

    app.log.info({
      correlation_id: correlationId,
      service: serviceName,
      route,
      status_code: reply.statusCode,
      duration_ms: durationMs,
      error_code: reply.statusCode >= 500 ? "upstream_or_internal_error" : undefined,
    });

    try {
      options.onRequestCompleted?.({
        request,
        reply,
        route,
        correlationId,
        durationMs,
        requestBytes,
        responseBytes,
      });
    } finally {
      metrics.decrementInflight();
    }
  });
}
