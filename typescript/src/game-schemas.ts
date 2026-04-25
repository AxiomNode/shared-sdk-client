import { z } from "zod";

const QueryBoolean = z.preprocess((value) => {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off", ""].includes(normalized)) {
      return false;
    }
  }

  return value;
}, z.boolean());

// ---------------------------------------------------------------------------
// Shared Zod schemas for game microservices (quizz & wordpass).
// Single source of truth for all game-related contracts. English-only.
// ---------------------------------------------------------------------------

// -- Generation ------------------------------------------------------------

export const BaseGenerateSchema = z.object({
  categoryId: z.string().min(1),
  categoryName: z.string().min(1).optional(),
  difficultyPercentage: z.number().int().min(0).max(100).optional(),
  itemCount: z.number().int().min(1).max(50).optional(),
  requestedBy: z.enum(["api", "backoffice"]).optional(),
});

export const GenerateGameRequestSchema = z.object({
  categoryId: z.string().min(1).optional(),
  categoryName: z.string().min(1).optional(),
  itemCount: z.coerce.number().int().positive().max(50).optional(),
  difficultyPercentage: z.coerce.number().int().min(0).max(100).optional(),
  requestedBy: z.enum(["api", "backoffice"]).optional(),
}).strict();

// -- Ingest ----------------------------------------------------------------

export const IngestDocumentSchema = z.object({
  content: z.string().min(1),
  docId: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const IngestSchema = z.object({
  documents: z.array(IngestDocumentSchema).min(1),
  source: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  difficultyPercentage: z.coerce.number().int().min(0).max(100).optional(),
});

// -- Query / list ----------------------------------------------------------

export const RandomGameQuerySchema = z.object({
  categoryId: z.string().min(1).optional(),
}).strict();

export const RandomModelsQuerySchema = z.object({
  count: z.coerce.number().int().min(1).max(100).default(5),
  categoryId: z.string().min(1).optional(),
  difficultyPercentage: z.coerce.number().int().min(0).max(100).optional(),
  status: z.string().min(1).optional(),
  createdAfter: z.coerce.date().optional(),
  createdBefore: z.coerce.date().optional(),
});

export const HistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(20),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  categoryId: z.string().min(1).optional(),
  difficultyPercentage: z.coerce.number().int().min(0).max(100).optional(),
  status: z.string().min(1).optional(),
});

export const LeaderboardQuerySchema = z.object({
  metric: z.enum(["won", "score", "played"]).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
}).strict();

// -- Generation process params ---------------------------------------------

export const GenerationProcessParamsSchema = z.object({
  taskId: z.string().uuid(),
});

export const GenerationProcessQuerySchema = z.object({
  includeItems: QueryBoolean.default(false),
});

export const GenerationProcessesListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(20),
  status: z.enum(["running", "completed", "failed"]).optional(),
  requestedBy: z.enum(["api", "backoffice"]).optional(),
});

// -- Manual history --------------------------------------------------------

export const ReviewStatusSchema = z.enum(["manual", "validated", "pending_review"]);

export const ManualHistoryEntrySchema = z.object({
  categoryId: z.string().min(1),
  difficultyPercentage: z.coerce.number().int().min(0).max(100),
  content: z.record(z.unknown()).refine((value) => Object.keys(value).length > 0, {
    message: "content must include at least one field",
  }),
  status: ReviewStatusSchema.default("manual"),
});

export const ManualHistoryUpdateSchema = z.object({
  categoryId: z.string().min(1).optional(),
  difficultyPercentage: z.coerce.number().int().min(0).max(100).optional(),
  content: z.record(z.unknown()).refine((value) => Object.keys(value).length > 0, {
    message: "content must include at least one field",
  }).optional(),
  status: ReviewStatusSchema.optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "at least one field must be provided",
});

export const HistoryItemParamsSchema = z.object({
  entryId: z.string().min(1),
});

// -- Categories catalog ----------------------------------------------------

export const GameCategoriesSchema = z.object({
  categories: z.array(z.object({
    id: z.string(),
    name: z.string(),
  }).strict()).min(1),
}).strict();

// -- Inferred types --------------------------------------------------------

export type BaseGenerate = z.infer<typeof BaseGenerateSchema>;
export type GenerateGameRequest = z.infer<typeof GenerateGameRequestSchema>;
export type IngestDocument = z.infer<typeof IngestDocumentSchema>;
export type Ingest = z.infer<typeof IngestSchema>;
export type RandomGameQuery = z.infer<typeof RandomGameQuerySchema>;
export type RandomModelsQuery = z.infer<typeof RandomModelsQuerySchema>;
export type HistoryQuery = z.infer<typeof HistoryQuerySchema>;
export type LeaderboardQuery = z.infer<typeof LeaderboardQuerySchema>;
export type GenerationProcessParams = z.infer<typeof GenerationProcessParamsSchema>;
export type GenerationProcessQuery = z.infer<typeof GenerationProcessQuerySchema>;
export type GenerationProcessesListQuery = z.infer<typeof GenerationProcessesListQuerySchema>;
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;
export type ManualHistoryEntry = z.infer<typeof ManualHistoryEntrySchema>;
export type ManualHistoryUpdate = z.infer<typeof ManualHistoryUpdateSchema>;
export type HistoryItemParams = z.infer<typeof HistoryItemParamsSchema>;
export type GameCategories = z.infer<typeof GameCategoriesSchema>;
