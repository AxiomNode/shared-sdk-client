import { z } from "zod";

// AUTO-GENERATED FILE. DO NOT EDIT MANUALLY.
// Run: npm run generate:contracts
// Canonical source of truth:
// contracts-and-schemas/schemas/json/random-game.query.v1.json
// contracts-and-schemas/schemas/json/game-generate.request.v1.json
// contracts-and-schemas/schemas/json/leaderboard.query.v1.json
// contracts-and-schemas/schemas/json/game-categories.v1.json
export const RandomGameQuerySchema = z.object({
  language: z.string().optional(),
  categoryId: z.string().min(1).optional(),
}).strict();

export const GenerateGameRequestSchema = z.object({
  language: z.string().default("es"),
  categoryId: z.string().min(1).optional(),
  categoryName: z.string().min(1).optional(),
  numQuestions: z.coerce.number().int().positive().max(50).optional(),
  difficultyPercentage: z.coerce.number().int().min(0).max(100).optional(),
  letters: z.string().optional(),
  requestedBy: z.enum(["api", "backoffice"]).optional(),
}).strict();

export const LeaderboardQuerySchema = z.object({
  metric: z.enum(["won", "score", "played"]).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
}).strict();

export const GameCategoriesSchema = z.object({
  categories: z.array(z.object({
  id: z.string(),
  name: z.string(),
}).strict()).min(1),
  languages: z.array(z.object({
  code: z.string().regex(new RegExp("^[a-z]{2}$")),
  name: z.string(),
}).strict()).min(1),
}).strict();

export type RandomGameQuery = z.infer<typeof RandomGameQuerySchema>;
export type GenerateGameRequest = z.infer<typeof GenerateGameRequestSchema>;
export type LeaderboardQuery = z.infer<typeof LeaderboardQuerySchema>;
export type GameCategories = z.infer<typeof GameCategoriesSchema>;
