import { normalizeGameDifficultyPercentage } from "./game-history.js";

export interface GameRandomModelsFiltersInput {
  count: number;
  categoryId?: string;
  difficultyPercentage?: number;
  status?: string;
  createdAfter?: Date;
  createdBefore?: Date;
}

export function buildGameRandomModelsWhere(
  gameType: string,
  filters: GameRandomModelsFiltersInput,
  resolveCategoryId?: (categoryId: string) => string
): {
  gameType: string;
  status?: string | { not: string };
  categoryId?: string;
  difficultyPercentage?: number;
  createdAt?: { gte?: Date; lte?: Date };
} {
  const difficultyPercentage = normalizeGameDifficultyPercentage(filters.difficultyPercentage);

  return {
    gameType,
    ...(filters.status ? { status: filters.status } : { status: { not: "pending_review" } }),
    ...(filters.categoryId && resolveCategoryId
      ? { categoryId: resolveCategoryId(filters.categoryId) }
      : {}),
    ...(typeof difficultyPercentage === "number" ? { difficultyPercentage } : {}),
    ...(filters.createdAfter || filters.createdBefore
      ? {
          createdAt: {
            ...(filters.createdAfter ? { gte: filters.createdAfter } : {}),
            ...(filters.createdBefore ? { lte: filters.createdBefore } : {}),
          },
        }
      : {}),
  };
}

export function resolveGameRandomModelsPoolSize(count: number): number {
  return Math.min(1000, Math.max(count * 30, 300));
}

export function pickRandomGameModels<TItem>(items: TItem[], count: number): TItem[] {
  if (items.length === 0) {
    return [];
  }

  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = shuffled[index];
    shuffled[index] = shuffled[swapIndex];
    shuffled[swapIndex] = current;
  }

  return shuffled.slice(0, Math.min(count, shuffled.length));
}