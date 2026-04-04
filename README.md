# shared-sdk-client

Shared SDK repository for AxiomNode services and clients.

## Scope

- Provide reusable client libraries and integration helpers.
- Keep contracts, proxy helpers, and shared domain models in one place.
- Reduce duplication across gateway, BFF, and microservice repositories.

## Structure

- `typescript/`: production-ready SDK package.
- `python/`, `kotlin/`: language-specific scaffolds and docs.
- `openapi/`: API sources used for SDK generation.
- `tooling/`: generation/build/publishing automation.

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
