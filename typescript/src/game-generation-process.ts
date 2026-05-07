export type GameGenerationRequestedBy = "api" | "backoffice";

export interface GameGenerationProcessTask<TItem = unknown> {
  taskId: string;
  requestedBy: GameGenerationRequestedBy;
  status: "running" | "completed" | "failed";
  requested: number;
  processed: number;
  created: number;
  duplicates: number;
  duplicateByContent: number;
  failed: number;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  generatedItems: TItem[];
  errors: string[];
}

export interface GameGenerationProcessSnapshot<TItem = unknown> {
  taskId: string;
  requestedBy: GameGenerationRequestedBy;
  status: "running" | "completed" | "failed";
  requested: number;
  processed: number;
  created: number;
  duplicates: number;
  duplicateReasons: {
    content: number;
  };
  failed: number;
  progress: {
    current: number;
    total: number;
    ratio: number;
  };
  startedAt: string;
  updatedAt: string;
  lastProgressAt: string;
  ageSeconds: number;
  idleSeconds: number;
  stalled: boolean;
  finishedAt?: string;
  generatedItems?: TItem[];
  errors?: string[];
}

const STALLED_AFTER_SECONDS = 60;

export interface GameGenerationProcessListOptions {
  limit?: number;
  status?: "running" | "completed" | "failed";
  requestedBy?: GameGenerationRequestedBy;
}

export function createGameGenerationProcessTask(
  taskId: string,
  input: { count: number; requestedBy?: GameGenerationRequestedBy }
): GameGenerationProcessTask {
  const now = new Date().toISOString();

  return {
    taskId,
    requestedBy: input.requestedBy === "backoffice" ? "backoffice" : "api",
    status: "running",
    requested: input.count,
    processed: 0,
    created: 0,
    duplicates: 0,
    duplicateByContent: 0,
    failed: 0,
    startedAt: now,
    updatedAt: now,
    generatedItems: [],
    errors: [],
  };
}

export function toGameGenerationProcessSnapshot<TItem = unknown>(
  task: GameGenerationProcessTask<TItem>,
  includeItems = false
): GameGenerationProcessSnapshot<TItem> {
  const total = Math.max(1, task.requested);
  const now = Date.now();
  const startedAtMs = Date.parse(task.startedAt);
  const updatedAtMs = Date.parse(task.updatedAt);
  const ageSeconds = Math.max(0, Math.floor((now - startedAtMs) / 1000));
  const idleSeconds = Math.max(0, Math.floor((now - updatedAtMs) / 1000));

  return {
    taskId: task.taskId,
    requestedBy: task.requestedBy,
    status: task.status,
    requested: task.requested,
    processed: task.processed,
    created: task.created,
    duplicates: task.duplicates,
    duplicateReasons: {
      content: task.duplicateByContent,
    },
    failed: task.failed,
    progress: {
      current: task.processed,
      total: task.requested,
      ratio: Math.min(1, task.processed / total),
    },
    startedAt: task.startedAt,
    updatedAt: task.updatedAt,
    lastProgressAt: task.updatedAt,
    ageSeconds,
    idleSeconds,
    stalled: task.status === "running" && idleSeconds >= STALLED_AFTER_SECONDS,
    ...(task.finishedAt ? { finishedAt: task.finishedAt } : {}),
    ...(includeItems ? { generatedItems: task.generatedItems } : {}),
    ...(task.errors.length > 0 ? { errors: task.errors } : {}),
  };
}

export function listGameGenerationProcesses<TItem = unknown>(
  tasks: Iterable<GameGenerationProcessTask<TItem>>,
  options?: GameGenerationProcessListOptions
): GameGenerationProcessSnapshot<TItem>[] {
  const limit = options?.limit ?? 20;

  return [...tasks]
    .filter((task) => {
      if (options?.status && task.status !== options.status) {
        return false;
      }
      if (options?.requestedBy && task.requestedBy !== options.requestedBy) {
        return false;
      }
      return true;
    })
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .slice(0, Math.max(1, limit))
    .map((task) => toGameGenerationProcessSnapshot(task, false));
}

export function pruneGameGenerationProcesses<TItem = unknown>(
  tasks: Map<string, GameGenerationProcessTask<TItem>>,
  retentionLimit: number
): void {
  if (tasks.size <= retentionLimit) {
    return;
  }

  const removable = [...tasks.values()]
    .filter((task) => task.status !== "running")
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));

  for (const task of removable) {
    if (tasks.size <= retentionLimit) {
      break;
    }
    tasks.delete(task.taskId);
  }
}