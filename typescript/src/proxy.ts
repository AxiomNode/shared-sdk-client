export type HeaderBag = Record<string, string | undefined>;

export type ForwardMethod = "GET" | "POST" | "PATCH";

export interface ForwardHttpParams {
  targetUrl: string;
  method: ForwardMethod;
  requestHeaders: HeaderBag;
  body?: unknown;
}

export interface ForwardHttpResult {
  status: number;
  contentType: string;
  payload: unknown;
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
  const response = await fetch(params.targetUrl, {
    method: params.method,
    headers: extractForwardHeaders(params.requestHeaders, includeBody),
    body: includeBody && params.body !== undefined ? JSON.stringify(params.body) : undefined,
  });

  const bodyText = await response.text();
  const contentType = response.headers.get("content-type") ?? "application/json";

  return {
    status: response.status,
    contentType,
    payload: parseForwardPayload(bodyText, contentType),
  };
}
