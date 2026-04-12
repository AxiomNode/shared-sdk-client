import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");

const contractsBaseDir = path.join(repoRoot, "contracts-and-schemas", "schemas", "json");
const outputPath = path.join(repoRoot, "shared-sdk-client", "typescript", "src", "contracts.ts");

const schemaMap = {
  RandomGameQuerySchema: "random-game.query.v1.json",
  GenerateGameRequestSchema: "game-generate.request.v1.json",
  LeaderboardQuerySchema: "leaderboard.query.v1.json",
};

function zodTypeForProperty(propSchema) {
  if (propSchema.enum) {
    const values = propSchema.enum.map((value) => JSON.stringify(value)).join(", ");
    return `z.enum([${values}])`;
  }

  if (propSchema.type === "string") {
    let expr = "z.string()";
    if (typeof propSchema.minLength === "number") {
      expr += `.min(${propSchema.minLength})`;
    }
    if (propSchema.default !== undefined) {
      expr += `.default(${JSON.stringify(propSchema.default)})`;
    }
    return expr;
  }

  if (propSchema.type === "integer") {
    let expr = "z.coerce.number().int()";
    if (typeof propSchema.minimum === "number") {
      if (propSchema.minimum === 1) {
        expr += ".positive()";
      } else {
        expr += `.min(${propSchema.minimum})`;
      }
    }
    if (typeof propSchema.maximum === "number") {
      expr += `.max(${propSchema.maximum})`;
    }
    return expr;
  }

  throw new Error(`Unsupported schema property type: ${JSON.stringify(propSchema)}`);
}

function buildSchemaExpression(schema) {
  const required = new Set(schema.required ?? []);
  const lines = Object.entries(schema.properties ?? {}).map(([propertyName, propertySchema]) => {
    let expr = zodTypeForProperty(propertySchema);
    if (!required.has(propertyName)) {
      expr += ".optional()";
    }
    return `  ${propertyName}: ${expr},`;
  });

  return `z.object({\n${lines.join("\n")}\n})`;
}

const generatedSchemas = Object.entries(schemaMap).map(([schemaName, fileName]) => {
  const schemaPath = path.join(contractsBaseDir, fileName);
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  const schemaExpression = buildSchemaExpression(schema);
  return { schemaName, schemaExpression, fileName };
});

const header = [
  'import { z } from "zod";',
  "",
  "// AUTO-GENERATED FILE. DO NOT EDIT MANUALLY.",
  "// Run: npm run generate:contracts",
  "// Canonical source of truth:",
  ...generatedSchemas.map((entry) => `// contracts-and-schemas/schemas/json/${entry.fileName}`),
  "",
].join("\n");

const schemaDeclarations = generatedSchemas
  .map((entry) => `export const ${entry.schemaName} = ${entry.schemaExpression};`)
  .join("\n\n");

const typeDeclarations = [
  "export type RandomGameQuery = z.infer<typeof RandomGameQuerySchema>;",
  "export type GenerateGameRequest = z.infer<typeof GenerateGameRequestSchema>;",
  "export type LeaderboardQuery = z.infer<typeof LeaderboardQuerySchema>;",
].join("\n");

const output = `${header}${schemaDeclarations}\n\n${typeDeclarations}\n`;
fs.writeFileSync(outputPath, output, "utf8");

console.log(`Generated ${outputPath}`);
