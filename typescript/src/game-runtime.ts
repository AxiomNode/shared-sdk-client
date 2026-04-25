export interface GameCategoryRef {
  id: string;
  name: string;
}

export interface GameCategoryDimension {
  category: GameCategoryRef;
}

export interface StoredGameRow {
  id: string;
  gameType: string;
  query: string;
  status: string;
  categoryId: string | null;
  categoryName: string | null;
  requestJson: string;
  responseJson: string;
  createdAt: Date;
}

export interface StoredGameModelLike {
  id: string;
  gameType: string;
  query: string;
  status: string;
  categoryId: string | null;
  categoryName: string | null;
  request: unknown;
  response: unknown;
  createdAt: Date;
  responseValidationError?: string;
}

export interface AiAuthCircuitState {
  failureStreak: number;
  openedUntilMs: number;
  openedTotal: number;
}

export interface AiAuthCircuitTransition {
  state: AiAuthCircuitState;
  shouldEmit: boolean;
}

export interface AiAuthCircuitClosedCheck {
  state: AiAuthCircuitState;
  shouldEmit: boolean;
  blockedUntilMs: number | null;
}

export function buildCategoryDimensionMatrix(
  categories: GameCategoryRef[],
): GameCategoryDimension[] {
  return categories.map((category) => ({ category }));
}

export function buildStoredRequestPayload(
  requestPayload: Record<string, string>,
  category: GameCategoryRef,
): Record<string, string> {
  return {
    ...requestPayload,
    category_id: category.id,
    category_name: category.name,
  };
}

export function parseStoredJsonSafely(
  parseJson: (value: string) => unknown,
  value: string,
): { value: unknown } {
  try {
    return { value: parseJson(value) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      value: {
        raw: value,
        parseError: message,
      },
    };
  }
}

export function validateStoredHistoryPayload(
  payload: unknown,
  itemId: string,
  gameLabel: string,
  sanitizeGeneratedPayload: (payload: unknown) => unknown,
): string | undefined {
  try {
    sanitizeGeneratedPayload(payload);
    return undefined;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.warn(`Stored ${gameLabel} history item is invalid but still exposed for backoffice`, itemId, message);
    return message;
  }
}

export function mapStoredModel<TModel extends StoredGameModelLike>(
  item: StoredGameRow,
  parseJson: (value: string) => unknown,
  sanitizeGeneratedPayload: (payload: unknown) => unknown,
): TModel {
  return {
    id: item.id,
    gameType: item.gameType,
    query: item.query,
    status: item.status,
    categoryId: item.categoryId,
    categoryName: item.categoryName,
    request: parseJson(item.requestJson),
    response: sanitizeGeneratedPayload(parseJson(item.responseJson)),
    createdAt: item.createdAt,
  } as TModel;
}

export function mapStoredHistoryModel<TModel extends StoredGameModelLike>(
  item: StoredGameRow,
  gameLabel: string,
  parseStoredJsonSafelyImpl: (value: string) => { value: unknown },
  validateStoredHistoryPayloadImpl: (payload: unknown, itemId: string, gameLabel: string) => string | undefined,
): TModel {
  const request = parseStoredJsonSafelyImpl(item.requestJson);
  const response = parseStoredJsonSafelyImpl(item.responseJson);
  const responseValidationError = validateStoredHistoryPayloadImpl(response.value, item.id, gameLabel);

  return {
    id: item.id,
    gameType: item.gameType,
    query: item.query,
    status: item.status,
    categoryId: item.categoryId,
    categoryName: item.categoryName,
    request: request.value,
    response: response.value,
    ...(responseValidationError ? { responseValidationError } : {}),
    createdAt: item.createdAt,
  } as TModel;
}

export function mapStoredModelsSafely<TModel extends StoredGameModelLike>(
  items: StoredGameRow[],
  invalidModelLabel: string,
  mapItem: (item: StoredGameRow) => TModel,
): TModel[] {
  const validItems: TModel[] = [];

  for (const item of items) {
    try {
      validItems.push(mapItem(item));
    } catch (error) {
      console.warn(
        invalidModelLabel,
        item.id,
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  }

  return validItems;
}

export function mapStoredHistoryModels<TModel extends StoredGameModelLike>(
  items: StoredGameRow[],
  mapItem: (item: StoredGameRow) => TModel,
): TModel[] {
  return items.map((item) => mapItem(item));
}

export function extractDifficultyFromRequest(requestPayload: unknown): number | undefined {
  if (!requestPayload || typeof requestPayload !== "object") {
    return undefined;
  }

  const raw = (requestPayload as Record<string, unknown>).difficulty_percentage;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(0, Math.min(100, Math.trunc(raw)));
  }
  if (typeof raw === "string") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.min(100, Math.trunc(parsed)));
    }
  }

  return undefined;
}

export function extractAiEngineStatusCode(error: unknown): number | null {
  if (!(error instanceof Error)) {
    return null;
  }

  const match = error.message.match(/ai-engine error\s+(\d{3})/i);
  if (!match) {
    return null;
  }

  const statusCode = Number(match[1]);
  return Number.isFinite(statusCode) ? statusCode : null;
}

export function isAiAuthCircuitOpenError(error: unknown): boolean {
  return error instanceof Error && /ai auth circuit open/i.test(error.message);
}

export function registerAiAuthSuccessState(
  state: AiAuthCircuitState,
): AiAuthCircuitTransition {
  const shouldEmit = state.failureStreak > 0 || state.openedUntilMs > 0;
  return {
    state: {
      ...state,
      failureStreak: 0,
      openedUntilMs: 0,
    },
    shouldEmit,
  };
}

export function registerAiAuthFailureState(
  state: AiAuthCircuitState,
  options: {
    statusCode: number | null;
    failureThreshold: number;
    cooldownMs: number;
    nowMs: number;
  },
): AiAuthCircuitTransition {
  if (options.statusCode !== 401 && options.statusCode !== 403) {
    return {
      state,
      shouldEmit: false,
    };
  }

  const failureStreak = state.failureStreak + 1;
  const shouldOpenCircuit = failureStreak >= options.failureThreshold;

  return {
    state: {
      failureStreak,
      openedUntilMs: shouldOpenCircuit ? options.nowMs + options.cooldownMs : state.openedUntilMs,
      openedTotal: shouldOpenCircuit ? state.openedTotal + 1 : state.openedTotal,
    },
    shouldEmit: true,
  };
}

export function ensureAiAuthCircuitClosedState(
  state: AiAuthCircuitState,
  nowMs: number,
): AiAuthCircuitClosedCheck {
  if (state.openedUntilMs <= 0) {
    return {
      state,
      shouldEmit: false,
      blockedUntilMs: null,
    };
  }

  if (nowMs >= state.openedUntilMs) {
    return {
      state: {
        ...state,
        failureStreak: 0,
        openedUntilMs: 0,
      },
      shouldEmit: true,
      blockedUntilMs: null,
    };
  }

  return {
    state,
    shouldEmit: false,
    blockedUntilMs: state.openedUntilMs,
  };
}

export function normalizeContentToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  const body = entries
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(",");
  return `{${body}}`;
}

export function getGameCategoryOrThrow(
  categoryById: Map<string, GameCategoryRef>,
  categoryId: string,
): GameCategoryRef {
  const category = categoryById.get(categoryId);
  if (!category) {
    throw new Error(`Unsupported categoryId: ${categoryId}`);
  }
  return category;
}

export function extractStringArrayFromObjects(
  payload: unknown,
  arrayKey: string,
  fieldKey: string,
  options?: { allowNestedGame?: boolean },
): string[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const asRecord = payload as Record<string, unknown>;
  let candidate = asRecord[arrayKey];
  if (!Array.isArray(candidate) && options?.allowNestedGame) {
    const nestedGame = asRecord.game;
    if (nestedGame && typeof nestedGame === "object") {
      candidate = (nestedGame as Record<string, unknown>)[arrayKey];
    }
  }
  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }
      const value = (item as Record<string, unknown>)[fieldKey];
      return typeof value === "string" ? value : "";
    })
    .filter((item) => item.trim().length > 0);
}

export function normalizeManualContent(
  content: Record<string, unknown>,
): Record<string, unknown> {
  const entries = Object.entries(content).filter(([, value]) => value !== null && value !== undefined);
  if (entries.length === 0) {
    throw new Error("Invalid content payload");
  }

  const compact = Object.fromEntries(entries);
  const serialized = stableStringify(compact);
  if (serialized.length < 8) {
    throw new Error("Invalid content payload");
  }

  return compact;
}

export function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function pickRange(min: number, max: number): number {
  const lower = Math.min(min, max);
  const upper = Math.max(min, max);
  return Math.floor(Math.random() * (upper - lower + 1)) + lower;
}

export function resolveRequestedItemCount(
  input: { itemCount?: number; numQuestions?: number },
): number | undefined {
  return input.itemCount ?? input.numQuestions;
}