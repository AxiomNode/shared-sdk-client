export interface GroupedSummaryCategory {
  id: string;
  name: string;
}

export interface GroupedSummaryRow {
  categoryId: string | null;
  categoryName: string | null;
  _count: { _all: number };
}

export interface GroupedSummaryResult {
  categories: Array<{ categoryId: string; categoryName: string; total: number }>;
  matrix: Array<{ categoryId: string; categoryName: string; total: number }>;
}

export function buildGroupedSummary(
  categories: GroupedSummaryCategory[],
  rows: GroupedSummaryRow[]
): GroupedSummaryResult {
  const matrix = rows
    .filter((row) => row.categoryId && row.categoryName)
    .map((row) => ({
      categoryId: row.categoryId as string,
      categoryName: row.categoryName as string,
      total: row._count._all,
    }));

  return {
    categories: categories.map((category) => {
      const total = matrix
        .filter((row) => row.categoryId === category.id)
        .reduce((sum, row) => sum + row.total, 0);

      return {
        categoryId: category.id,
        categoryName: category.name,
        total,
      };
    }),
    matrix,
  };
}