type WorkerLogger = {
  info: (...args: unknown[]) => unknown;
  warn: (...args: unknown[]) => unknown;
  error: (...args: unknown[]) => unknown;
};

export type RuntimeDifficultyLevel = "easy" | "medium" | "hard";

export interface RuntimeGenerationWorkerStartInput {
  countPerIteration?: number;
  categoryIds?: string[];
  difficultyLevels?: RuntimeDifficultyLevel[];
}

export interface RuntimeGenerationWorkerSnapshot<TGameType extends string> {
  gameType: TGameType;
  active: boolean;
  iterationInFlight: boolean;
  intervalSeconds: number;
  activatedAt: string | null;
  lastIterationAt: string | null;
  lastIterationDurationMs: number | null;
  lastIterationCreated: number | null;
  iterationsSinceActivation: number;
  iterationsTotal: number;
  generatedSinceActivation: number;
  totalObjectsInDb: number;
  lastError: string | null;
  config: {
    countPerIteration: number;
    selectedCategoryIds: string[];
    selectedDifficultyLevels: RuntimeDifficultyLevel[];
  };
  available: {
    categories: Array<{ id: string; name: string }>;
    difficultyLevels: Array<{
      id: RuntimeDifficultyLevel;
      label: string;
      min: number;
      max: number;
    }>;
  };
  balance: {
    categories: Array<{ id: string; name: string; total: number; missingToMax: number }>;
    difficulties: Array<{
      id: RuntimeDifficultyLevel;
      label: string;
      total: number;
      missingToMax: number;
    }>;
    mostMissingCategoryId: string | null;
    mostMissingDifficultyLevel: RuntimeDifficultyLevel | null;
  };
}

type RuntimeGenerationWorkerConfig = {
  countPerIteration: number;
  selectedCategoryIds: string[];
  selectedDifficultyLevels: RuntimeDifficultyLevel[];
};

type CatalogSnapshot = {
  categories: Array<{ id: string; name: string }>;
};

type GroupedModelsSummary = {
  categories: Array<{ categoryId: string; categoryName: string; total: number }>;
};

type GenerationProcessSnapshot = {
  status: "running" | "completed" | "failed";
  requested: number;
  created: number;
  duplicates: number;
  failed: number;
  errors?: string[];
};

type RuntimeGenerationService = {
  getCatalogSnapshot(): CatalogSnapshot;
  refreshCatalogs(): Promise<CatalogSnapshot>;
  groupedModelsSummary(): Promise<GroupedModelsSummary>;
  runGenerationProcessBlocking(input: {
    categoryId: string;
    difficultyPercentage: number;
    count: number;
    requestedBy: "backoffice";
  }): Promise<GenerationProcessSnapshot>;
};

type RuntimeGenerationPersistence<TGameType extends string> = {
  countByGameType(gameType: TGameType): Promise<number>;
  listDifficultyPercentages(gameType: TGameType): Promise<Array<{ difficultyPercentage: number | null }>>;
};

const RUNTIME_GENERATION_INTERVAL_MS = 30_000;
const MAX_COUNT_PER_ITERATION = 200;

const DIFFICULTY_LEVELS: Array<{
  id: RuntimeDifficultyLevel;
  label: string;
  min: number;
  max: number;
}> = [
  { id: "easy", label: "easy", min: 0, max: 33 },
  { id: "medium", label: "medium", min: 34, max: 66 },
  { id: "hard", label: "hard", min: 67, max: 100 },
];

export class GameRuntimeGenerationWorker<
  TGameType extends string,
  TGenerationService extends RuntimeGenerationService,
> {
  private logger: WorkerLogger | null = null;
  private timer: NodeJS.Timeout | undefined;
  private active = false;
  private iterationInFlight = false;
  private activatedAt: string | null = null;
  private lastIterationAt: string | null = null;
  private lastIterationDurationMs: number | null = null;
  private lastIterationCreated: number | null = null;
  private iterationsSinceActivation = 0;
  private iterationsTotal = 0;
  private generatedSinceActivation = 0;
  private lastError: string | null = null;

  private config: RuntimeGenerationWorkerConfig = {
    countPerIteration: 10,
    selectedCategoryIds: [],
    selectedDifficultyLevels: [],
  };

  constructor(
    private readonly gameType: TGameType,
    private readonly generationService: TGenerationService,
    private readonly persistence: RuntimeGenerationPersistence<TGameType>
  ) {}

  bindLogger(logger: WorkerLogger): void {
    this.logger = logger;
  }

  async start(input: RuntimeGenerationWorkerStartInput): Promise<RuntimeGenerationWorkerSnapshot<TGameType>> {
    const catalogs = await this.ensureCatalogsLoaded();
    const allCategoryIds = catalogs.categories.map((item) => item.id);

    const nextCategoryIds = dedupe(
      (input.categoryIds ?? [])
        .map((value) => value.trim())
        .filter((value) => value.length > 0 && allCategoryIds.includes(value))
    );

    const nextDifficultyLevels = dedupe(
      (input.difficultyLevels ?? []).filter((value) =>
        DIFFICULTY_LEVELS.some((level) => level.id === value)
      )
    ) as RuntimeDifficultyLevel[];

    this.config = {
      countPerIteration: clampInt(input.countPerIteration ?? 10, 1, MAX_COUNT_PER_ITERATION),
      selectedCategoryIds:
        nextCategoryIds.length === 0 || nextCategoryIds.length === allCategoryIds.length
          ? []
          : nextCategoryIds,
      selectedDifficultyLevels:
        nextDifficultyLevels.length === 0 || nextDifficultyLevels.length === DIFFICULTY_LEVELS.length
          ? []
          : nextDifficultyLevels,
    };

    this.active = true;
    this.activatedAt = new Date().toISOString();
    this.lastIterationAt = null;
    this.lastIterationDurationMs = null;
    this.lastIterationCreated = null;
    this.iterationsSinceActivation = 0;
    this.generatedSinceActivation = 0;
    this.lastError = null;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    this.timer = setInterval(() => {
      void this.runIteration("interval");
    }, RUNTIME_GENERATION_INTERVAL_MS);

    void this.runIteration("startup");

    return this.getSnapshot();
  }

  async stop(): Promise<RuntimeGenerationWorkerSnapshot<TGameType>> {
    this.active = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    return this.getSnapshot();
  }

  dispose(): void {
    this.active = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async getSnapshot(): Promise<RuntimeGenerationWorkerSnapshot<TGameType>> {
    const catalogs = await this.ensureCatalogsLoaded();
    const grouped = await this.generationService.groupedModelsSummary();

    const totalObjectsInDb = await this.persistence.countByGameType(this.gameType);

    const categoryScopeIds =
      this.config.selectedCategoryIds.length > 0
        ? this.config.selectedCategoryIds
        : catalogs.categories.map((item) => item.id);

    const categoryRows = grouped.categories.filter((item) => categoryScopeIds.includes(item.categoryId));
    const maxCategoryCount = categoryRows.reduce((max, item) => Math.max(max, item.total), 0);
    const categoryBalance = categoryRows.map((item) => ({
      id: item.categoryId,
      name: item.categoryName,
      total: item.total,
      missingToMax: Math.max(0, maxCategoryCount - item.total),
    }));

    const mostMissingCategoryId =
      [...categoryBalance].sort((a, b) => b.missingToMax - a.missingToMax)[0]?.id ?? null;

    const difficultyRows = await this.persistence.listDifficultyPercentages(this.gameType);

    const difficultyCounts = new Map<RuntimeDifficultyLevel, number>(
      DIFFICULTY_LEVELS.map((item) => [item.id, 0])
    );

    for (const row of difficultyRows) {
      const level = toDifficultyLevel(row.difficultyPercentage);
      if (level) {
        difficultyCounts.set(level, (difficultyCounts.get(level) ?? 0) + 1);
      }
    }

    const difficultyScope =
      this.config.selectedDifficultyLevels.length > 0
        ? this.config.selectedDifficultyLevels
        : DIFFICULTY_LEVELS.map((item) => item.id);

    const maxDifficultyCount = difficultyScope.reduce(
      (max, level) => Math.max(max, difficultyCounts.get(level) ?? 0),
      0
    );

    const difficultyBalance = DIFFICULTY_LEVELS.map((level) => {
      const total = difficultyCounts.get(level.id) ?? 0;
      const missingToMax = difficultyScope.includes(level.id)
        ? Math.max(0, maxDifficultyCount - total)
        : 0;

      return {
        id: level.id,
        label: level.label,
        total,
        missingToMax,
      };
    });

    const mostMissingDifficultyLevel =
      [...difficultyBalance]
        .filter((item) => difficultyScope.includes(item.id))
        .sort((a, b) => b.missingToMax - a.missingToMax)[0]?.id ?? null;

    return {
      gameType: this.gameType,
      active: this.active,
      iterationInFlight: this.iterationInFlight,
      intervalSeconds: Math.trunc(RUNTIME_GENERATION_INTERVAL_MS / 1000),
      activatedAt: this.activatedAt,
      lastIterationAt: this.lastIterationAt,
      lastIterationDurationMs: this.lastIterationDurationMs,
      lastIterationCreated: this.lastIterationCreated,
      iterationsSinceActivation: this.iterationsSinceActivation,
      iterationsTotal: this.iterationsTotal,
      generatedSinceActivation: this.generatedSinceActivation,
      totalObjectsInDb,
      lastError: this.lastError,
      config: {
        countPerIteration: this.config.countPerIteration,
        selectedCategoryIds: this.config.selectedCategoryIds,
        selectedDifficultyLevels: this.config.selectedDifficultyLevels,
      },
      available: {
        categories: catalogs.categories,
        difficultyLevels: DIFFICULTY_LEVELS,
      },
      balance: {
        categories: categoryBalance,
        difficulties: difficultyBalance,
        mostMissingCategoryId,
        mostMissingDifficultyLevel,
      },
    };
  }

  protected async runIteration(trigger: "startup" | "interval"): Promise<void> {
    if (!this.active) {
      return;
    }

    if (this.iterationInFlight) {
      this.logger?.warn({ trigger }, "Runtime generation iteration skipped because previous cycle is still running");
      return;
    }

    this.iterationInFlight = true;
    const startedAt = Date.now();

    try {
      const catalogs = await this.ensureCatalogsLoaded();
      const category = pickCategory(catalogs.categories, this.config.selectedCategoryIds);
      const difficultyPercentage = pickDifficultyPercentage(this.config.selectedDifficultyLevels);

      if (!category) {
        throw new Error("No categories available for runtime generation");
      }

      const task = await this.generationService.runGenerationProcessBlocking({
        categoryId: category.id,
        difficultyPercentage,
        count: this.config.countPerIteration,
        requestedBy: "backoffice",
      });

      const durationMs = Date.now() - startedAt;
      this.iterationsSinceActivation += 1;
      this.iterationsTotal += 1;
      this.generatedSinceActivation += task.created;
      this.lastIterationAt = new Date().toISOString();
      this.lastIterationDurationMs = durationMs;
      this.lastIterationCreated = task.created;
      this.lastError = task.status === "failed" ? task.errors?.[0] ?? "Generation process failed" : null;

      this.logger?.info(
        {
          trigger,
          durationMs,
          requested: task.requested,
          created: task.created,
          duplicates: task.duplicates,
          failed: task.failed,
          categoryId: category.id,
          difficultyPercentage,
        },
        "Runtime generation iteration finished"
      );
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      this.iterationsSinceActivation += 1;
      this.iterationsTotal += 1;
      this.lastIterationAt = new Date().toISOString();
      this.lastIterationDurationMs = durationMs;
      this.lastIterationCreated = 0;
      this.lastError = error instanceof Error ? error.message : "Runtime generation iteration failed";

      this.logger?.error(
        {
          trigger,
          durationMs,
          error: this.lastError,
        },
        "Runtime generation iteration failed"
      );
    } finally {
      this.iterationInFlight = false;
    }
  }

  private async ensureCatalogsLoaded() {
    const current = this.generationService.getCatalogSnapshot();
    if (current.categories.length > 0) {
      return current;
    }
    return this.generationService.refreshCatalogs();
  }
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function dedupe<T extends string>(values: T[]): T[] {
  return [...new Set(values)];
}

function toDifficultyLevel(value: number | null): RuntimeDifficultyLevel | null {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  if (value <= 33) {
    return "easy";
  }

  if (value <= 66) {
    return "medium";
  }

  return "hard";
}

function pickCategory(
  categories: Array<{ id: string; name: string }>,
  selectedCategoryIds: string[]
): { id: string; name: string } | null {
  const available =
    selectedCategoryIds.length > 0
      ? categories.filter((item) => selectedCategoryIds.includes(item.id))
      : categories;

  if (available.length === 0) {
    return null;
  }

  return available[Math.floor(Math.random() * available.length)] ?? null;
}

function pickDifficultyPercentage(selectedLevels: RuntimeDifficultyLevel[]): number {
  const availableLevels =
    selectedLevels.length > 0
      ? DIFFICULTY_LEVELS.filter((item) => selectedLevels.includes(item.id))
      : DIFFICULTY_LEVELS;

  const selectedLevel = availableLevels[Math.floor(Math.random() * availableLevels.length)] ?? DIFFICULTY_LEVELS[0];
  const range = selectedLevel.max - selectedLevel.min;
  if (range <= 0) {
    return selectedLevel.min;
  }

  return selectedLevel.min + Math.floor(Math.random() * (range + 1));
}