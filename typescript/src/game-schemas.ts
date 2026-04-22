import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared Zod schemas for game microservices (quizz & wordpass).
// Centralised here to avoid duplication across microservice route files.
// ---------------------------------------------------------------------------

// -- Generation ------------------------------------------------------------

/**
 * Base generate schema shared by all game types.
 * `itemCount` is the canonical item request size, while `numQuestions`
 * remains as a compatibility alias for older callers.
 */
export const BaseGenerateSchema = z.object({
  categoryId: z.string().min(1),
  categoryName: z.string().min(1).optional(),
  language: z.string().min(2).max(5),
  difficultyPercentage: z.number().int().min(0).max(100).optional(),
  itemCount: z.number().int().min(1).max(50).optional(),
  numQuestions: z.number().int().min(1).max(50).optional(),
  requestedBy: z.enum(["api", "backoffice"]).optional(),
});

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
  language: z.string().min(2).max(5).optional(),
  difficultyPercentage: z.coerce.number().int().min(0).max(100).optional(),
});

// -- Query / list ----------------------------------------------------------

export const RandomModelsQuerySchema = z.object({
  count: z.coerce.number().int().min(1).max(100).default(5),
  categoryId: z.string().min(1).optional(),
  language: z.string().min(2).max(5).optional(),
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
  language: z.string().min(2).max(5).optional(),
  difficultyPercentage: z.coerce.number().int().min(0).max(100).optional(),
  status: z.string().min(1).optional(),
});

// -- Generation process params ---------------------------------------------

export const GenerationProcessParamsSchema = z.object({
  taskId: z.string().uuid(),
});

export const GenerationProcessQuerySchema = z.object({
  includeItems: z.coerce.boolean().default(false),
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
  language: z.string().min(2).max(5),
  difficultyPercentage: z.coerce.number().int().min(0).max(100),
  content: z.record(z.unknown()).refine((value) => Object.keys(value).length > 0, {
    message: "content must include at least one field",
  }),
  status: ReviewStatusSchema.default("manual"),
});

export const ManualHistoryUpdateSchema = z.object({
  categoryId: z.string().min(1).optional(),
  language: z.string().min(2).max(5).optional(),
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

// -- Inferred types --------------------------------------------------------

export type BaseGenerate = z.infer<typeof BaseGenerateSchema>;
export type IngestDocument = z.infer<typeof IngestDocumentSchema>;
export type Ingest = z.infer<typeof IngestSchema>;
export type RandomModelsQuery = z.infer<typeof RandomModelsQuerySchema>;
export type HistoryQuery = z.infer<typeof HistoryQuerySchema>;
export type GenerationProcessParams = z.infer<typeof GenerationProcessParamsSchema>;
export type GenerationProcessQuery = z.infer<typeof GenerationProcessQuerySchema>;
export type GenerationProcessesListQuery = z.infer<typeof GenerationProcessesListQuerySchema>;
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;
export type ManualHistoryEntry = z.infer<typeof ManualHistoryEntrySchema>;
export type ManualHistoryUpdate = z.infer<typeof ManualHistoryUpdateSchema>;
export type HistoryItemParams = z.infer<typeof HistoryItemParamsSchema>;
