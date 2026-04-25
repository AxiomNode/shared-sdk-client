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