export interface GameCategoryRef {
  id: string;
  name: string;
}

export interface GameCategoryDimension {
  category: GameCategoryRef;
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