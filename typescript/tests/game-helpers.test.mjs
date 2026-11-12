import assert from "node:assert/strict";
import test from "node:test";

import { GAME_CATEGORIES, GAME_CATEGORY_BY_ID, GAME_CATEGORY_IDS } from "../dist/game-categories.js";
import { buildGroupedSummary } from "../dist/game-grouped-summary.js";
import {
  buildGameHistoryWhere,
  normalizeGameDifficultyPercentage,
  normalizeGameHistoryLimit,
  normalizeGameHistoryPage,
} from "../dist/game-history.js";
import {
  MonitoringLogsQuerySchema,
  buildMonitoringLogsPayload,
  buildMonitoringStatsPayload,
} from "../dist/game-monitoring.js";
import {
  buildGameRandomModelsWhere,
  pickRandomGameModels,
  resolveGameRandomModelsPoolSize,
} from "../dist/game-random-models.js";

test("game categories catalog is consistent", () => {
  assert.equal(GAME_CATEGORIES.length, GAME_CATEGORY_IDS.length);
  assert.equal(new Set(GAME_CATEGORY_IDS).size, GAME_CATEGORY_IDS.length);
  assert.equal(GAME_CATEGORY_BY_ID.get("9")?.name, "General Knowledge");
  assert.equal(GAME_CATEGORY_BY_ID.get("999"), undefined);
});

test("normalizeGameHistoryLimit clamps and truncates", () => {
  assert.equal(normalizeGameHistoryLimit(), 20);
  assert.equal(normalizeGameHistoryLimit(0), 1);
  assert.equal(normalizeGameHistoryLimit(-5), 1);
  assert.equal(normalizeGameHistoryLimit(5000), 1000);
  assert.equal(normalizeGameHistoryLimit(7.9), 7);
});

test("normalizeGameHistoryPage derives page size from the limit and computes skip", () => {
  assert.deepEqual(normalizeGameHistoryPage(), {
    normalizedLimit: 20,
    normalizedPage: 1,
    normalizedPageSize: 20,
    skip: 0,
  });
  assert.deepEqual(normalizeGameHistoryPage(5), {
    normalizedLimit: 5,
    normalizedPage: 1,
    normalizedPageSize: 5,
    skip: 0,
  });
  assert.deepEqual(normalizeGameHistoryPage(100, { page: 3, pageSize: 50 }), {
    normalizedLimit: 100,
    normalizedPage: 3,
    normalizedPageSize: 50,
    skip: 100,
  });
  const clamped = normalizeGameHistoryPage(100, { page: 0, pageSize: 9999 });
  assert.equal(clamped.normalizedPage, 1);
  assert.equal(clamped.normalizedPageSize, 200);
  assert.equal(clamped.skip, 0);
});

test("normalizeGameDifficultyPercentage clamps to 0-100 and ignores non-numbers", () => {
  assert.equal(normalizeGameDifficultyPercentage(), undefined);
  assert.equal(normalizeGameDifficultyPercentage("50"), undefined);
  assert.equal(normalizeGameDifficultyPercentage(-3), 0);
  assert.equal(normalizeGameDifficultyPercentage(150), 100);
  assert.equal(normalizeGameDifficultyPercentage(42.7), 42);
  assert.equal(normalizeGameDifficultyPercentage(0), 0);
});

test("buildGameHistoryWhere only includes the filters that are set", () => {
  assert.deepEqual(buildGameHistoryWhere("quiz", undefined, undefined), { gameType: "quiz" });

  const resolve = (id) => `resolved-${id}`;
  assert.deepEqual(
    buildGameHistoryWhere("quiz", { categoryId: "9", difficultyPercentage: 0, status: "ok" }, resolve),
    { gameType: "quiz", categoryId: "resolved-9", difficultyPercentage: 0 },
  );
  assert.deepEqual(
    buildGameHistoryWhere("quiz", { status: "ok" }, resolve, { includeStatus: true }),
    { gameType: "quiz", status: "ok" },
  );
  // A category filter without a resolver is ignored rather than passed through raw.
  assert.deepEqual(buildGameHistoryWhere("quiz", { categoryId: "9" }, undefined), { gameType: "quiz" });
});

test("buildGameRandomModelsWhere hides pending_review by default and builds date ranges", () => {
  assert.deepEqual(buildGameRandomModelsWhere("quiz", { count: 3 }), {
    gameType: "quiz",
    status: { not: "pending_review" },
  });

  const after = new Date("2026-01-01T00:00:00Z");
  const before = new Date("2026-02-01T00:00:00Z");
  assert.deepEqual(
    buildGameRandomModelsWhere(
      "quiz",
      { count: 3, status: "approved", categoryId: "9", difficultyPercentage: 120, createdAfter: after },
      (id) => `r${id}`,
    ),
    {
      gameType: "quiz",
      status: "approved",
      categoryId: "r9",
      difficultyPercentage: 100,
      createdAt: { gte: after },
    },
  );
  assert.deepEqual(
    buildGameRandomModelsWhere("quiz", { count: 1, createdBefore: before }).createdAt,
    { lte: before },
  );
});

test("resolveGameRandomModelsPoolSize is bounded between 300 and 1000", () => {
  assert.equal(resolveGameRandomModelsPoolSize(1), 300);
  assert.equal(resolveGameRandomModelsPoolSize(10), 300);
  assert.equal(resolveGameRandomModelsPoolSize(20), 600);
  assert.equal(resolveGameRandomModelsPoolSize(500), 1000);
});

test("pickRandomGameModels returns distinct items without mutating the input", () => {
  assert.deepEqual(pickRandomGameModels([], 5), []);

  const items = [1, 2, 3, 4, 5];
  const copy = [...items];
  const picked = pickRandomGameModels(items, 3);
  assert.equal(picked.length, 3);
  assert.equal(new Set(picked).size, 3);
  assert.ok(picked.every((item) => items.includes(item)));
  assert.deepEqual(items, copy);

  assert.deepEqual([...pickRandomGameModels(items, 99)].sort(), copy);
  assert.deepEqual(pickRandomGameModels(items, 0), []);
});

test("buildGroupedSummary totals rows per category and drops rows without a category", () => {
  const result = buildGroupedSummary(
    [
      { id: "9", name: "General" },
      { id: "10", name: "Books" },
    ],
    [
      { categoryId: "9", categoryName: "General", _count: { _all: 2 } },
      { categoryId: "9", categoryName: "General", _count: { _all: 3 } },
      { categoryId: null, categoryName: null, _count: { _all: 7 } },
      { categoryId: "9", categoryName: null, _count: { _all: 1 } },
    ],
  );

  assert.deepEqual(result.matrix, [
    { categoryId: "9", categoryName: "General", total: 2 },
    { categoryId: "9", categoryName: "General", total: 3 },
  ]);
  assert.deepEqual(result.categories, [
    { categoryId: "9", categoryName: "General", total: 5 },
    { categoryId: "10", categoryName: "Books", total: 0 },
  ]);
});

test("buildMonitoringStatsPayload computes category coverage", () => {
  const catalogs = { source: "remote", categories: [{ id: "1" }, { id: "2" }, { id: "3" }, { id: "4" }] };
  const grouped = { categories: [{ total: 3 }, { total: 0 }, { total: 1 }], matrix: [{}, {}, {}, {}, {}, {}] };

  const base = buildMonitoringStatsPayload({ uptime: 5 }, catalogs, grouped);
  assert.deepEqual(base, {
    uptime: 5,
    coverage: {
      catalogSource: "remote",
      totalCategories: 4,
      categoriesWithData: 2,
      categoryCoverageRatio: 0.5,
    },
  });

  const withMatrix = buildMonitoringStatsPayload({}, catalogs, grouped, { includeMatrixCoverage: true });
  assert.equal(withMatrix.coverage.matrixSlotsWithData, 6);
  assert.equal(withMatrix.coverage.categoryCoverageRatioFromMatrix, 1.5);
});

test("buildMonitoringStatsPayload does not divide by zero with an empty catalog", () => {
  const payload = buildMonitoringStatsPayload(
    {},
    { source: "fallback", categories: [] },
    { categories: [], matrix: [] },
    { includeMatrixCoverage: true },
  );
  assert.equal(payload.coverage.categoryCoverageRatio, 0);
  assert.equal(payload.coverage.categoryCoverageRatioFromMatrix, 0);
});

test("buildMonitoringLogsPayload and MonitoringLogsQuerySchema", () => {
  assert.deepEqual(buildMonitoringLogsPayload("svc", [{ a: 1 }, { a: 2 }]), {
    service: "svc",
    total: 2,
    logs: [{ a: 1 }, { a: 2 }],
  });

  assert.equal(MonitoringLogsQuerySchema.parse({}).limit, 200);
  assert.equal(MonitoringLogsQuerySchema.parse({ limit: "50" }).limit, 50);
  assert.throws(() => MonitoringLogsQuerySchema.parse({ limit: "0" }));
  assert.throws(() => MonitoringLogsQuerySchema.parse({ limit: "2001" }));
});
