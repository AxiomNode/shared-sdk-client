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
  GameCategoriesSchema: "game-categories.v1.json",
};

if (!fs.existsSync(contractsBaseDir)) {
  if (fs.existsSync(outputPath)) {
    console.warn(
      `Contracts source directory not found at ${contractsBaseDir}. Keeping existing ${outputPath}.`,
    );
    process.exit(0);
  }

  throw new Error(`Contracts source directory not found at ${contractsBaseDir}`);
}

function appendDefault(expr, schema) {
  if (schema.default !== undefined) {
    return `${expr}.default(${JSON.stringify(schema.default)})`;
  }

  return expr;
}

function zodTypeForSchema(schema) {
  if (schema.const !== undefined) {
    return `z.literal(${JSON.stringify(schema.const)})`;
  }

  if (schema.enum) {
    const values = schema.enum.map((value) => JSON.stringify(value)).join(", ");
    return `z.enum([${values}])`;
  }

  if (schema.type === "string") {
    let expr = "z.string()";
    if (typeof schema.minLength === "number") {
      expr += `.min(${schema.minLength})`;
    }
    if (typeof schema.maxLength === "number") {
      expr += `.max(${schema.maxLength})`;
    }
    if (typeof schema.pattern === "string") {
      expr += `.regex(new RegExp(${JSON.stringify(schema.pattern)}))`;
    }
    return appendDefault(expr, schema);
  }

  if (schema.type === "integer") {
    let expr = "z.coerce.number().int()";
    if (typeof schema.minimum === "number") {
      if (schema.minimum === 1) {
        expr += ".positive()";
      } else {
        expr += `.min(${schema.minimum})`;
      }
    }
    if (typeof schema.maximum === "number") {
      expr += `.max(${schema.maximum})`;
    }
    return appendDefault(expr, schema);
  }

  if (schema.type === "number") {
    let expr = "z.coerce.number()";
    if (typeof schema.minimum === "number") {
      expr += `.min(${schema.minimum})`;
    }
    if (typeof schema.maximum === "number") {
      expr += `.max(${schema.maximum})`;
    }
    return appendDefault(expr, schema);
  }

  if (schema.type === "boolean") {
    return appendDefault("z.boolean()", schema);
  }

  if (schema.type === "array") {
    if (!schema.items) {
      throw new Error(`Array schema is missing items: ${JSON.stringify(schema)}`);
    }

    let expr = `z.array(${zodTypeForSchema(schema.items)})`;
    if (typeof schema.minItems === "number") {
      expr += `.min(${schema.minItems})`;
    }
    if (typeof schema.maxItems === "number") {
      expr += `.max(${schema.maxItems})`;
    }
    return appendDefault(expr, schema);
  }

  if (schema.type === "object") {
    const properties = Object.entries(schema.properties ?? {});
    if (properties.length === 0) {
      if (schema.additionalProperties) {
        return "z.record(z.unknown())";
      }

      return "z.object({}).strict()";
    }

    const required = new Set(schema.required ?? []);
    const lines = properties.map(([propertyName, propertySchema]) => {
      let expr = zodTypeForSchema(propertySchema);
      if (!required.has(propertyName)) {
        expr += ".optional()";
      }
      return `  ${propertyName}: ${expr},`;
    });

    let expr = `z.object({\n${lines.join("\n")}\n})`;
    if (schema.additionalProperties === false) {
      expr += ".strict()";
    }
    return appendDefault(expr, schema);
  }

  throw new Error(`Unsupported schema property type: ${JSON.stringify(schema)}`);
}

const generatedSchemas = Object.entries(schemaMap).map(([schemaName, fileName]) => {
  const schemaPath = path.join(contractsBaseDir, fileName);
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  const schemaExpression = zodTypeForSchema(schema);
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

const typeDeclarations = generatedSchemas
  .map((entry) => `export type ${entry.schemaName.replace(/Schema$/, "")} = z.infer<typeof ${entry.schemaName}>;`)
  .join("\n");

const output = `${header}${schemaDeclarations}\n\n${typeDeclarations}\n`;
fs.writeFileSync(outputPath, output, "utf8");

console.log(`Generated ${outputPath}`);
