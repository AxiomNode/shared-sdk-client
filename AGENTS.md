# AGENTS

## Repo purpose
Shared SDK and integration helper repository for AxiomNode services and clients.

## Key paths
- typescript/: the SDK implementation (an internal TypeScript library; the only implemented language)

## Local commands
- From `typescript/`: `npm ci`, `npm run build`, `npm test`.

## CI/CD notes
- validate-sdk-layout checks repository structure.
- typescript-sdk-ci builds and packs the package and publishes on version tags.

## LLM editing rules
- Keep SDK behavior aligned with contracts-and-schemas versions.
- Update docs/changelogs when generated client APIs change.
- Avoid breaking changes without explicit versioning notes.
