import {
  UpstreamTimeoutError,
  extractForwardHeaders,
  type ForwardMethod,
  type HeaderBag,
} from "./proxy.js";

/**
 * Opt-in raw passthrough for proxy hops that neither inspect nor modify the body.
 *
 * `forwardHttp` parses the upstream response (`JSON.parse`) and the caller usually
 * serializes it again (`JSON.stringify`); the request body takes the same round trip.
 * `forwardHttpRaw` moves the bytes as they are instead. `forwardHttp` is unchanged and
 * remains the right choice wherever the caller needs the parsed payload.
 */

/** Request body accepted in raw mode: the original bytes, forwarded untouched. */
export type RawRequestBody = Buffer | Uint8Array | string;

export interface ForwardHttpRawParams {
  targetUrl: string;
  method: ForwardMethod;
  requestHeaders: HeaderBag;
  /** Original request bytes. Ignored for GET and DELETE, like `forwardHttp`. */
  body?: RawRequestBody | null;
  /**
   * Content-Type sent upstream. Defaults to the `content-type` of `requestHeaders`
   * and falls back to `application/json` when neither is present.
   */
  contentType?: string;
  /** Covers connecting, headers AND reading the whole body. Default: 15000 */
  timeoutMs?: number;
}

export interface ForwardHttpRawResult {
  status: number;
  /** Upstream content-type, `application/json` when the upstream sent none. */
  contentType: string;
  /** Upstream response headers (lower-case names), minus hop-by-hop and body-framing headers. */
  headers: Record<string, string>;
  /** Upstream body, byte for byte as returned by `fetch` (after transfer/content decoding). */
  body: Buffer;
}

// fetch() already decoded the body, so framing/encoding headers no longer describe it.
const DROPPED_RESPONSE_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-length",
  "content-encoding",
]);

export async function forwardHttpRaw(params: ForwardHttpRawParams): Promise<ForwardHttpRawResult> {
  const includeBody = params.method !== "GET" && params.method !== "DELETE";
  const timeoutMs = params.timeoutMs ?? 15_000;
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  const headers = extractForwardHeaders(params.requestHeaders, false);
  if (includeBody) {
    headers["content-type"] = params.contentType ?? params.requestHeaders["content-type"] ?? "application/json";
  }

  // The timer stays armed until the body is fully read (same guarantee as forwardHttp).
  try {
    const response = await fetch(params.targetUrl, {
      method: params.method,
      headers,
      body: includeBody && params.body != null ? (params.body as BodyInit) : undefined,
      signal: controller.signal,
    });

    const body = Buffer.from(await response.arrayBuffer());

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, name) => {
      if (!DROPPED_RESPONSE_HEADERS.has(name.toLowerCase())) {
        responseHeaders[name.toLowerCase()] = value;
      }
    });

    return {
      status: response.status,
      contentType: response.headers.get("content-type") ?? "application/json",
      headers: responseHeaders,
      body,
    };
  } catch (error) {
    if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw new UpstreamTimeoutError(`Upstream request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}
