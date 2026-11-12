# TypeScript SDK

Last updated: 2026-05-03.

## Purpose

TypeScript client SDK for `api-gateway`, BFFs, and internal service integrations.

## Scope

Use this section for reusable TypeScript contracts and transport helpers consumed across runtime repositories.

## Modules

- `@axiomnode/shared-sdk-client/proxy`: shared HTTP forwarding helpers (JSON mode: `forwardHttp` parses the upstream body).
- `@axiomnode/shared-sdk-client/proxy-raw`: opt-in raw passthrough (`forwardHttpRaw`) that forwards request and response bodies as Buffers, without `JSON.parse`/`JSON.stringify`, for hops that do not inspect or modify the payload.
- `@axiomnode/shared-sdk-client/ai-engine-client`, `/game-categories`, `/private-docs`: the other sub-path exports (see `package.json`).
- `@axiomnode/shared-sdk-client` (root): everything, including the shared game-service runtime and zod schemas.

## Build

```bash
npm ci
npm run build
npm test
```

## Runtime helpers

- `AiEngineClient.generate(params, options)` supports per-request `timeoutMs` and `maxAttempts` overrides.
- `createGameConfigSchema` exposes `GAME_GENERATION_ITEM_TIMEOUT_MS` and `GAME_GENERATION_ITEM_RETRY_MAX_ATTEMPTS` for bounded async generation items.

## Why this matters

Avoid contract/model and transport-helper duplication across runtime repositories.

Schemas are written by hand in `src/game-schemas.ts` and kept aligned with `contracts-and-schemas`.
Static game catalogs are validated against `GameCategoriesSchema` when the module loads.

## CI/CD

- Workflow: `.github/workflows/typescript-sdk-ci.yml`
- Automatic publication when creating tag `typescript-sdk-v*` (requires `NPM_TOKEN`)
