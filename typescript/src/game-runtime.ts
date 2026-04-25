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