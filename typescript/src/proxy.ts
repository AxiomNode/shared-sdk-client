export type HeaderBag = Record<string, string | undefined>;

export type ForwardMethod = "GET" | "POST" | "PATCH";

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

  if (includeBody) {
    headers["content-type"] = "application/json";
  }

  return headers;
}

function parseForwardPayload(bodyText: string, contentType: string): unknown {
  if (!contentType.includes("application/json")) {
    return bodyText;
  }

  if (!bodyText) {
    return {};
  }

  try {
    return JSON.parse(bodyText);
  } catch {
    return { raw: bodyText };
  }
}

export async function forwardHttp(params: ForwardHttpParams): Promise<ForwardHttpResult> {
  const includeBody = params.method !== "GET";
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

  const bodyText = await response.text();
  const contentType = response.headers.get("content-type") ?? "application/json";

  return {
    status: response.status,
    contentType,
    payload: parseForwardPayload(bodyText, contentType),
  };
}
