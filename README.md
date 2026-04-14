# shared-sdk-client

Shared SDK repository for AxiomNode services and clients.

## Scope

- Provide reusable client libraries and integration helpers.
- Keep contracts, proxy helpers, and shared domain models in one place.
- Reduce duplication across gateway, BFF, and microservice repositories.

## Structure

- `typescript/`: production-ready SDK package.
- `python/`, `kotlin/`: language-specific scaffolds and docs.
- `openapi/`: reserved OpenAPI sources and generation inputs for future SDK expansion.
- `tooling/`: generation/build/publishing automation.

## Contract sources

- The current TypeScript SDK contract generation is driven by `contracts-and-schemas/schemas/json`.
- `openapi/` is not yet wired into the TypeScript build pipeline.
- Static catalogs exported by the TypeScript SDK are validated against generated JSON Schema contracts during build.

## Workflows

- `validate-sdk-layout.yml`
	- Trigger: push (`main`, `develop`), pull request, manual dispatch.
	- Purpose: validates expected repository layout.

- `typescript-sdk-ci.yml`
	- Trigger: push (`main`, `develop`), pull request, manual dispatch, and tags `typescript-sdk-v*`.
	- Jobs:
		- build TypeScript SDK
		- package `.tgz` artifact
		- publish to npm when tag matches `typescript-sdk-v*`

## Release note

When contracts change in `contracts-and-schemas`, regenerate/rebuild the TypeScript SDK and upgrade dependent services in the same rollout window.
