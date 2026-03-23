# TypeScript SDK

Cliente TypeScript para consumo de API Gateway y BFFs.

## Modulos

- `@axiomnode/shared-sdk-client/proxy`: utilidades comunes para forwarding HTTP.
- `@axiomnode/shared-sdk-client/contracts`: esquemas y tipos de requests compartidos.

## Build

```bash
npm install
npm run build

# generar contratos desde contracts-and-schemas
npm run generate:contracts
```

## Objetivo

Evitar duplicacion de objetos de contrato y utilidades de transporte en repositorios de runtime.

Los esquemas se alinean con `contracts-and-schemas/schemas/json/*.v1.json`.

## CI/CD

- Workflow: `.github/workflows/typescript-sdk-ci.yml`
- Publicacion automatica al crear tag `typescript-sdk-v*` (requiere `NPM_TOKEN`)
