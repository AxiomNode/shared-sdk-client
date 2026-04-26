export interface GameHistoryFiltersInput {
  categoryId?: string;
  difficultyPercentage?: number;
  status?: string;
}

export interface GameHistoryPageInput extends GameHistoryFiltersInput {
  page?: number;
  pageSize?: number;
}

export interface GameHistoryPageState {
  normalizedLimit: number;
  normalizedPage: number;
  normalizedPageSize: number;
  skip: number;
}

export function normalizeGameHistoryLimit(limit = 20): number {
  return Math.max(1, Math.min(1000, Math.trunc(limit)));
}

export function normalizeGameHistoryPage(
  limit = 20,
  options?: Pick<GameHistoryPageInput, "page" | "pageSize">
): GameHistoryPageState {
  const normalizedLimit = normalizeGameHistoryLimit(limit);
  const normalizedPage = Math.max(1, Math.trunc(options?.page ?? 1));
  const normalizedPageSize = Math.max(
    1,
    Math.min(200, Math.trunc(options?.pageSize ?? Math.min(20, normalizedLimit)))
  );

  return {
    normalizedLimit,
    normalizedPage,
    normalizedPageSize,
    skip: (normalizedPage - 1) * normalizedPageSize,
  };
}

export function normalizeGameDifficultyPercentage(value?: number): number | undefined {
  if (typeof value !== "number") {
    return undefined;
  }

  return Math.max(0, Math.min(100, Math.trunc(value)));
}

export function buildGameHistoryWhere(
  gameType: string,
  filters: GameHistoryFiltersInput | undefined,
  resolveCategoryId: ((categoryId: string) => string) | undefined,
  options?: { includeStatus?: boolean }
): {
  gameType: string;
  categoryId?: string;
  status?: string;
  difficultyPercentage?: number;
} {
  const difficultyPercentage = normalizeGameDifficultyPercentage(filters?.difficultyPercentage);

  return {
    gameType,
    ...(filters?.categoryId && resolveCategoryId
      ? { categoryId: resolveCategoryId(filters.categoryId) }
      : {}),
    ...(options?.includeStatus && filters?.status ? { status: filters.status } : {}),
    ...(typeof difficultyPercentage === "number" ? { difficultyPercentage } : {}),
  };
}