# shared-sdk-client

Shared SDK repository for AxiomNode services and clients.

## Scope

- Provide reusable client libraries and integration helpers.
- Keep contracts, proxy helpers, and shared domain models in one place.
- Reduce duplication across gateway, BFF, and microservice repositories.

## Ownership boundary

This repository is the distribution layer for shared integration code.

It should own:

- generated or curated reusable client code
- proxy and transport helpers reused by multiple services
- shared catalogs or validation helpers that must remain synchronized across consumers

It should not become a shadow implementation layer for service-specific business logic.

## Structure

- `typescript/`: production-ready SDK package.
- `python/`, `kotlin/`: language-specific scaffolds and docs.
- `openapi/`: reserved OpenAPI sources and generation inputs for future SDK expansion.
- `tooling/`: generation/build/publishing automation.

## Contract sources

- The current TypeScript SDK contract generation is driven by `contracts-and-schemas/schemas/json`.
- `openapi/` is not yet wired into the TypeScript build pipeline.
- Static catalogs exported by the TypeScript SDK are validated against generated JSON Schema contracts during build.

## Main consumers

- `api-gateway`
- `bff-mobile`
- `bff-backoffice`
- `microservice-quizz`
- `microservice-wordpass`
- future Python and Kotlin consumers as those SDKs mature

## Workflows

- `validate-sdk-layout.yml`
	- Trigger: push (`main`, `develop`), pull request, manual dispatch.
	- Purpose: validates expected repository layout.

- `typescript-sdk-ci.yml`
	- Trigger: push (`main`, `develop`), pull request, manual dispatch, and tags `typescript-sdk-v*`.
	- Jobs:
		- build TypeScript SDK and run production `npm audit --omit=dev --audit-level=high`
		- package `.tgz` artifact
		- publish to npm when tag matches `typescript-sdk-v*`

## Release note

When contracts change in `contracts-and-schemas`, regenerate/rebuild the TypeScript SDK and upgrade dependent services in the same rollout window.

## Documentation scope

This repository should document generation sources, published artifacts, consumer expectations, and release coordination. Cross-repository contract policy belongs in `docs` and `contracts-and-schemas`.
