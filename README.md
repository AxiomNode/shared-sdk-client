# shared-sdk-client

SDKs compartidos para consumo de APIs de AxiomNode.

## Objetivo

- Ofrecer clientes oficiales por lenguaje.
- Reducir duplicacion de integraciones en consumidores.
- Estandarizar auth, retries y manejo de errores.

## Estructura

- `openapi/`: especificaciones fuente para generacion.
- `tooling/`: scripts de build y publicacion.
- `typescript/`, `kotlin/`, `python/`: implementaciones por lenguaje.

## CI

Incluye `validate-sdk-layout.yml` para validar layout base.
