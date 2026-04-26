import { z } from "zod";

export interface MonitoringCatalogSnapshotLike {
  source: string;
  categories: Array<{ id: string }>;
}

export interface MonitoringGroupedCategoryLike {
  total: number;
}

export interface MonitoringGroupedSummaryLike {
  categories: MonitoringGroupedCategoryLike[];
  matrix: unknown[];
}

export interface MonitoringStatsOptions {
  includeMatrixCoverage?: boolean;
}

export interface MonitoringLogsPayload {
  service: string;
  total: number;
  logs: unknown[];
}

export const MonitoringLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(2000).default(200),
});

export function buildMonitoringStatsPayload(
  stats: Record<string, unknown>,
  catalogs: MonitoringCatalogSnapshotLike,
  grouped: MonitoringGroupedSummaryLike,
  options: MonitoringStatsOptions = {},
): Record<string, unknown> {
  const totalCategories = catalogs.categories.length;
  const categoriesWithData = grouped.categories.filter((item) => item.total > 0).length;
  const baseCoverage: Record<string, unknown> = {
    catalogSource: catalogs.source,
    totalCategories,
    categoriesWithData,
    categoryCoverageRatio: totalCategories > 0 ? categoriesWithData / totalCategories : 0,
  };

  if (options.includeMatrixCoverage) {
    const matrixSlotsWithData = grouped.matrix.length;
    baseCoverage.matrixSlotsWithData = matrixSlotsWithData;
    baseCoverage.categoryCoverageRatioFromMatrix = totalCategories > 0 ? matrixSlotsWithData / totalCategories : 0;
  }

  return {
    ...stats,
    coverage: baseCoverage,
  };
}

export function buildMonitoringLogsPayload(service: string, logs: unknown[]): MonitoringLogsPayload {
  return {
    service,
    total: logs.length,
    logs,
  };
}