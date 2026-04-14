# TypeScript SDK

TypeScript client SDK for `api-gateway`, BFFs, and internal service integrations.

## Modules

- `@axiomnode/shared-sdk-client/proxy`: shared HTTP forwarding helpers.
- `@axiomnode/shared-sdk-client/contracts`: shared request/response contracts.

## Build

```bash
npm install
npm run build

# generate contracts from contracts-and-schemas
npm run generate:contracts
```

## Goal

Avoid contract/model and transport-helper duplication across runtime repositories.

Schemas are aligned with `contracts-and-schemas/schemas/json/*.v1.json`.
Static game catalogs are validated against the generated `GameCategoriesSchema` during build.

## CI/CD

- Workflow: `.github/workflows/typescript-sdk-ci.yml`
- Automatic publication when creating tag `typescript-sdk-v*` (requires `NPM_TOKEN`)
