# Matcheador Backend (NestJS)

Backend REST para Render que centraliza auth/JWT, RBAC, validaciones de negocio y orquestación contra Apps Script data-layer.

## Run

```bash
npm install
npm run start:dev
```

## Build

```bash
npm run build
npm run start
```

## Variables de entorno

Copiar `.env.example` y completar valores:

- `PORT`
- `NODE_ENV`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `CORS_ORIGINS`
- `APPS_SCRIPT_BASE_URL`
- `BACKEND_KEY`
- `UPSTREAM_TIMEOUT_MS_DEFAULT`
- `UPSTREAM_RETRY_MAX`
- `CACHE_TTL_PROFILE_SEC`
- `CACHE_TTL_LISTS_SEC`

## Contrato de respuesta

- Success: `{ ok: true, data }`
- Error: `{ ok: false, error: { code, message, details } }`

## Healthcheck

`GET /health`
