# shared-sdk-client

Last updated: 2026-05-08.

Shared SDK repository for AxiomNode services and clients.

## Responsibility

- Provide reusable client libraries and integration helpers.
- Keep contracts, proxy helpers, and shared domain models in one place.
- Reduce duplication across gateway, BFF, and microservice repositories.

Current platform status: `contracts-and-schemas` remains the contract source of truth. SDK changes should follow contract updates and be coordinated with downstream service/client rollout windows.

## Runtime role

### Ownership boundary

This repository is the distribution layer for shared integration code.

It should own:

- generated or curated reusable client code
- proxy and transport helpers reused by multiple services
- shared catalogs or validation helpers that must remain synchronized across consumers

It should not become a shadow implementation layer for service-specific business logic.

## Runtime surface

### Structure

- `typescript/`: the SDK package. It is an internal TypeScript library consumed by the AxiomNode Node services and is the only implemented language.

The former `python/`, `kotlin/`, `openapi/` and `tooling/` folders only contained placeholder READMEs (no code) and were removed. They can be reintroduced together with a real implementation.

## Dependencies and contracts

### Contract sources

- The SDK defines its own zod schemas in `typescript/src/game-schemas.ts`; there is no code generation step. `contracts-and-schemas` is the reference for the HTTP contracts and is kept aligned by hand.
- Static catalogs exported by the SDK (`game-categories.ts`) are validated against `GameCategoriesSchema` when the module loads.

### Main consumers

- `api-gateway`
- `bff-mobile`
- `bff-backoffice`
- `microservice-quizz`
- `microservice-word-pass`
- `microservice-users`

## Local setup

### Workflows

- `validate-sdk-layout.yml`
	- Trigger: push (`main`, `develop`), pull request, manual dispatch.
	- Purpose: validates expected repository layout.

- `typescript-sdk-ci.yml`
	- Trigger: push (`main`, `develop`), pull request, manual dispatch, and tags `typescript-sdk-v*`.
	- Jobs:
		- build TypeScript SDK and run production `npm audit --omit=dev --audit-level=high`
		- package `.tgz` artifact
		- publish to npm when tag matches `typescript-sdk-v*`

## Documentation

- `typescript/README.md`

## Deployment and operations notes

### Release note

When contracts change in `contracts-and-schemas`, regenerate/rebuild the TypeScript SDK and upgrade dependent services in the same rollout window.

### Documentation scope

This repository should document generation sources, published artifacts, consumer expectations, and release coordination. Cross-repository contract policy belongs in `docs` and `contracts-and-schemas`.

## References
