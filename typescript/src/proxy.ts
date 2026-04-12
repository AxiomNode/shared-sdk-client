import { Agent, setGlobalDispatcher } from "undici";

export type HeaderBag = Record<string, string | undefined>;

export type ForwardMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface ForwardHttpParams {
  targetUrl: string;
  method: ForwardMethod;
  requestHeaders: HeaderBag;
  body?: unknown;
  timeoutMs?: number;
}

export interface ForwardHttpResult {
  status: number;
  contentType: string;
  payload: unknown;
}

/**
 * Configure the global HTTP dispatcher for connection reuse.
 * Call once at server startup to enable persistent connections
 * with keep-alive across all `fetch()` calls.
 */
export function configureHttpAgent(options?: {
  keepAliveTimeoutMs?: number;
  pipelining?: number;
}): void {
  const agent = new Agent({
    keepAliveTimeout: options?.keepAliveTimeoutMs ?? 30_000,
    pipelining: options?.pipelining ?? 1,
  });
  setGlobalDispatcher(agent);
}

export class UpstreamTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpstreamTimeoutError";
  }
}

export function isUpstreamTimeoutError(error: unknown): boolean {
  return error instanceof UpstreamTimeoutError;
}

export function buildUrl(baseUrl: string, path: string, query: Record<string, unknown>): string {
  const url = new URL(path, baseUrl);

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

export function extractForwardHeaders(requestHeaders: HeaderBag, includeBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {};

  const correlationId = requestHeaders["x-correlation-id"];
  if (correlationId) {
    headers["x-correlation-id"] = correlationId;
  }

  const authorization = requestHeaders.authorization;
  if (authorization) {
    headers.authorization = authorization;
  }

  const devFirebaseUid = requestHeaders["x-dev-firebase-uid"];
  if (devFirebaseUid) {
    headers["x-dev-firebase-uid"] = devFirebaseUid;
  }

  const firebaseIdToken = requestHeaders["x-firebase-id-token"];
  if (firebaseIdToken) {
    headers["x-firebase-id-token"] = firebaseIdToken;
  }

  const apiKey = requestHeaders["x-api-key"];
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  const traceparent = requestHeaders.traceparent;
  if (traceparent) {
    headers.traceparent = traceparent;
  }

  const tracestate = requestHeaders.tracestate;
  if (tracestate) {
    headers.tracestate = tracestate;
  }

  const baggage = requestHeaders.baggage;
  if (baggage) {
    headers.baggage = baggage;
  }

  if (includeBody) {
    headers["content-type"] = "application/json";
  }

  return headers;
}

export async function forwardHttp(params: ForwardHttpParams): Promise<ForwardHttpResult> {
  const includeBody = params.method !== "GET" && params.method !== "DELETE";
  const timeoutMs = params.timeoutMs ?? 15_000;
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(params.targetUrl, {
      method: params.method,
      headers: extractForwardHeaders(params.requestHeaders, includeBody),
      body: includeBody && params.body !== undefined ? JSON.stringify(params.body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new UpstreamTimeoutError(`Upstream request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }

  const contentType = response.headers.get("content-type") ?? "application/json";
  let payload: unknown;

  if (contentType.includes("application/json")) {
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
  } else {
    payload = await response.text();
  }

  return {
    status: response.status,
    contentType,
    payload,
  };
}

// ---------------------------------------------------------------------------
// Circuit Breaker
// ---------------------------------------------------------------------------

export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CircuitBreakerOpenError";
  }
}

type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening the circuit. Default: 5 */
  failureThreshold?: number;
  /** How long (ms) to stay open before trying half-open. Default: 30000 */
  resetTimeoutMs?: number;
}

/**
 * Simple circuit breaker for upstream HTTP calls.
 *
 * Usage:
 * ```ts
 * const breaker = new CircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 30000 });
 * const result = await breaker.call(() => forwardHttp(params));
 * ```
 */
export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failures = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;

  constructor(options?: CircuitBreakerOptions) {
    this.failureThreshold = options?.failureThreshold ?? 5;
    this.resetTimeoutMs = options?.resetTimeoutMs ?? 30_000;
  }

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
        this.state = "half-open";
      } else {
        throw new CircuitBreakerOpenError("Circuit breaker is open — upstream unavailable");
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = "closed";
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.failureThreshold) {
      this.state = "open";
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}
