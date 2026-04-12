export interface PrivateDocsTokenConfig {
  PRIVATE_DOCS_TOKEN?: string | null;
  AI_ENGINE_API_KEY?: string | null;
}

export interface PrivateDocsAuthHeaders {
  authorization?: string | string[];
  [key: string]: unknown;
}

export function resolvePrivateDocsToken(
  config: PrivateDocsTokenConfig,
  options?: { fallbackToAiEngineKey?: boolean }
): string | null {
  const fallbackToAiEngineKey = options?.fallbackToAiEngineKey ?? true;
  if (config.PRIVATE_DOCS_TOKEN) {
    return config.PRIVATE_DOCS_TOKEN;
  }
  if (fallbackToAiEngineKey && config.AI_ENGINE_API_KEY) {
    return config.AI_ENGINE_API_KEY;
  }
  return null;
}

export function isAuthorizedForPrivateDocs(
  headers: PrivateDocsAuthHeaders,
  expectedToken: string
): boolean {
  const headerToken = headers["x-private-docs-token"];
  const tokenFromHeader = Array.isArray(headerToken) ? headerToken[0] : headerToken;
  if (typeof tokenFromHeader === "string" && tokenFromHeader === expectedToken) {
    return true;
  }

  const authHeader = headers.authorization;
  const authHeaderValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (typeof authHeaderValue === "string" && authHeaderValue.startsWith("Bearer ")) {
    return authHeaderValue.slice("Bearer ".length).trim() === expectedToken;
  }

  return false;
}
