# Next Swagger Auto (Scaffold)

This is a minimal Next.js App Router scaffold that generates OpenAPI specs from Zod schemas and serves Swagger UI at `/docs`.

## Quick start

1. `npm install`
2. `npm run dev`
3. Open `http://localhost:3000/docs`

## Init CLI

To scaffold docs routes and scripts in any Next.js project:

1. `npx next-swagger-auto init`
2. `npm install`
3. `npm run dev`

The OpenAPI spec is generated at `openapi-spec.ts` via `npm run generate:openapi`. During `npm run dev`, a watcher keeps it up to date when you edit `app/api/**/route.*` or `openapi.config.*`. The docs UI reads the spec from `/api/openapi` and loads Swagger UI assets from `/swagger-ui/`.

## Example route

`app/api/chat/route.ts` exports a `docs` object using `defineRoute`, plus a sample `POST /api/chat` handler.

## Customize

Update `openapi.config.ts` to change title, description, or servers.
