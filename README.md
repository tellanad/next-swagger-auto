# Next Swagger Auto

FastAPI-style Swagger docs for Next.js with zero manual route wiring. It scans your API routes, generates an OpenAPI 3 spec, and serves Swagger UI at `/docs`.

## Features
- App Router and Pages Router support
- Auto-detects API routes
- Optional Zod schema extraction for request/response
- Swagger UI included (no React warnings)
- Works in dev and build with automatic regeneration

## Quick Start

1. Install the package.
```bash
npm i next-swagger-auto
```

2. Initialize in your Next.js project.
```bash
npx next-swagger-auto init
```

3. Install dependencies and run.
```bash
npm install
npm run dev
```

4. Open:
```
http://localhost:3000/docs
```

## What the Init CLI Creates
- `openapi.config.ts`
- `lib/docs-page.tsx`
- `lib/next-swagger-auto.ts`
- `scripts/generate-openapi.ts`
- `scripts/watch-openapi.ts`
- `scripts/copy-swagger-ui.ts`
- Docs route (`app/docs/page.tsx` or `pages/docs.tsx`)
- OpenAPI route (`app/api/openapi/route.ts` or `pages/api/openapi.ts`)

## How Auto-Detection Works

App Router:
- Scans all `app/**/route.*` files
- Uses exported handlers (`GET`, `POST`, `PUT`, etc.)

Pages Router:
- Scans `pages/api/**`
- Tries to infer methods by reading `req.method` checks
- Falls back to `defaultMethods` if inference fails

## Optional Zod Schemas (No Wrapper Required)
If you want request/response schemas in Swagger, export Zod schemas with one of these names in your route file:

Request:
- `RequestSchema`
- `requestSchema`
- `BodySchema`
- `bodySchema`

Response:
- `ResponseSchema`
- `responseSchema`
- `OutputSchema`
- `outputSchema`

Example:
```ts
import { z } from "zod";
import { NextResponse } from "next/server";

export const RequestSchema = z.object({
  message: z.string()
});

export const ResponseSchema = z.object({
  reply: z.string()
});

export async function POST(request: Request) {
  const body = await request.json();
  return NextResponse.json({ reply: `You said: ${body.message}` });
}
```

## Configuration
Edit `openapi.config.ts`:
```ts
export const openapiConfig = {
  info: {
    title: "My API",
    version: "1.0.0",
    description: "My service docs"
  },
  servers: [{ url: "http://localhost:3000" }],
  includeUndocumented: true,
  defaultMethods: ["get", "post"]
};
```

## Scripts Added
- `generate:openapi` generates `openapi-spec.ts`
- `dev:docs` watches and regenerates
- `prepare:swagger-ui` copies Swagger UI assets
- `predev` and `prebuild` run generation automatically

## Troubleshooting

No operations defined in spec:
- Ensure you have API routes in `app/**/route.*` or `pages/api/**`.
- If a `.js` route contains TypeScript types, rename it to `.ts`.

Swagger UI is blank:
- Run `npm run prepare:swagger-ui` and reload.

## License
MIT
