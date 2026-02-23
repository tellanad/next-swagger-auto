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

## Auto Docs From Existing Routes

By default, the generator includes any **route handler** it can detect. For App Router, it scans all `app/**/route.*` files and reads exported handlers like `GET`, `POST`, etc. For Pages Router, it scans `pages/api/**` and tries to infer methods by scanning `req.method` checks. If it cannot infer, it falls back to `defaultMethods` in `openapi.config.ts`.

If you want full request/response schemas without wrapping, export Zod schemas with one of these names:

`RequestSchema`, `requestSchema`, `BodySchema`, `bodySchema`

`ResponseSchema`, `responseSchema`, `OutputSchema`, `outputSchema`

## Example route

`app/api/chat/route.ts` exports a `docs` object using `defineRoute`, plus a sample `POST /api/chat` handler.

## Customize

Update `openapi.config.ts` to change title, description, or servers.
