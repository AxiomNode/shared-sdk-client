# AGENTS

## Repo purpose
Shared SDK and integration helper repository for AxiomNode services and clients.

## Key paths
- typescript/: primary SDK implementation
- python/ and kotlin/: language scaffolds/docs
- openapi/: sources for generation
- tooling/: generation, validation, packaging scripts

## Local commands
- Build/test commands are language-specific; start in the target SDK folder.

## CI/CD notes
- validate-sdk-layout checks repository structure.
- typescript-sdk-ci builds packages and publishes on version tags.

## LLM editing rules
- Keep SDK behavior aligned with contracts-and-schemas versions.
- Update docs/changelogs when generated client APIs change.
- Avoid breaking changes without explicit versioning notes.
