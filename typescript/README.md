# TypeScript SDK

Last updated: 2026-05-03.

## Purpose

TypeScript client SDK for `api-gateway`, BFFs, and internal service integrations.

## Scope

Use this section for reusable TypeScript contracts and transport helpers consumed across runtime repositories.

## Modules

- `@axiomnode/shared-sdk-client/proxy`: shared HTTP forwarding helpers.
- `@axiomnode/shared-sdk-client/contracts`: shared request/response contracts.

## Build

```bash
npm install
npm run build
npm test

# generate contracts from contracts-and-schemas
npm run generate:contracts
```

## Runtime helpers

- `AiEngineClient.generate(params, options)` supports per-request `timeoutMs` and `maxAttempts` overrides.
- `createGameConfigSchema` exposes `GAME_GENERATION_ITEM_TIMEOUT_MS` and `GAME_GENERATION_ITEM_RETRY_MAX_ATTEMPTS` for bounded async generation items.

## Why this matters

Avoid contract/model and transport-helper duplication across runtime repositories.

Schemas are aligned with `contracts-and-schemas/schemas/json/*.v1.json`.
Static game catalogs are validated against the generated `GameCategoriesSchema` during build.

## CI/CD

- Workflow: `.github/workflows/typescript-sdk-ci.yml`
- Automatic publication when creating tag `typescript-sdk-v*` (requires `NPM_TOKEN`)
