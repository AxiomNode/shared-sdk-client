import { z } from "zod";

// AUTO-GENERATED FILE. DO NOT EDIT MANUALLY.
// Run: npm run generate:contracts
// Canonical source of truth:
// contracts-and-schemas/schemas/json/random-game.query.v1.json
// contracts-and-schemas/schemas/json/game-generate.request.v1.json
// contracts-and-schemas/schemas/json/leaderboard.query.v1.json
export const RandomGameQuerySchema = z.object({
  language: z.string().optional(),
  categoryId: z.coerce.number().int().positive().optional(),
});

export const GenerateGameRequestSchema = z.object({
  language: z.string().default("es"),
  categoryId: z.coerce.number().int().positive().optional(),
  topic: z.string().min(1).optional(),
  numQuestions: z.coerce.number().int().positive().max(20).optional(),
});

export const LeaderboardQuerySchema = z.object({
  metric: z.enum(["won", "score", "played"]).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export type RandomGameQuery = z.infer<typeof RandomGameQuerySchema>;
export type GenerateGameRequest = z.infer<typeof GenerateGameRequestSchema>;
export type LeaderboardQuery = z.infer<typeof LeaderboardQuerySchema>;
