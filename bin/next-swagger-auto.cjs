#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const cwd = process.cwd();
const args = process.argv.slice(2);
const command = args[0] || "init";

const deps = {
  dependencies: {
    "swagger-ui": "^5.18.3",
    "zod": "^3.23.0",
    "zod-to-json-schema": "^3.23.0"
  },
  devDependencies: {
    "chokidar": "^3.6.0",
    "concurrently": "^8.2.2",
    "fast-glob": "^3.3.2",
    "jiti": "^1.21.0",
    "tsx": "^4.7.0",
    "typescript": "^5.3.3"
  }
};

const scripts = {
  "generate:openapi": "tsx scripts/generate-openapi.ts",
  "dev:docs": "tsx scripts/watch-openapi.ts",
  "prepare:swagger-ui": "tsx scripts/copy-swagger-ui.ts",
  predev: "npm run prepare:swagger-ui && npm run generate:openapi",
  prebuild: "npm run prepare:swagger-ui && npm run generate:openapi"
};

function log(message) {
  process.stdout.write(`${message}\n`);
}

function warn(message) {
  process.stderr.write(`${message}\n`);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function relativeImport(fromFile, toFile) {
  const rel = path.relative(path.dirname(fromFile), toFile);
  const withDot = rel.startsWith(".") ? rel : `./${rel}`;
  return toPosix(withDot);
}

function writeFileIfMissing(filePath, content) {
  if (fs.existsSync(filePath)) {
    log(`exists  ${path.relative(cwd, filePath)}`);
    return false;
  }

  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
  log(`create  ${path.relative(cwd, filePath)}`);
  return true;
}

function detectRouter() {
  const appDirs = ["src/app", "app"].map((dir) => path.join(cwd, dir));
  const pagesDirs = ["src/pages", "pages"].map((dir) => path.join(cwd, dir));

  const appDir = appDirs.find((dir) => fs.existsSync(dir));
  const pagesDir = pagesDirs.find((dir) => fs.existsSync(dir));

  if (appDir) {
    return { type: "app", base: appDir, relBase: path.relative(cwd, appDir) };
  }

  if (pagesDir) {
    return { type: "pages", base: pagesDir, relBase: path.relative(cwd, pagesDir) };
  }

  return null;
}

function updatePackageJson() {
  const packagePath = path.join(cwd, "package.json");
  if (!fs.existsSync(packagePath)) {
    warn("package.json not found. Skipping script/dependency updates.");
    return;
  }

  const raw = fs.readFileSync(packagePath, "utf8");
  const data = JSON.parse(raw);

  data.dependencies = data.dependencies || {};
  data.devDependencies = data.devDependencies || {};
  data.scripts = data.scripts || {};

  for (const [name, version] of Object.entries(deps.dependencies)) {
    if (!data.dependencies[name]) data.dependencies[name] = version;
  }

  for (const [name, version] of Object.entries(deps.devDependencies)) {
    if (!data.devDependencies[name]) data.devDependencies[name] = version;
  }

  for (const [name, script] of Object.entries(scripts)) {
    if (!data.scripts[name]) data.scripts[name] = script;
  }

  fs.writeFileSync(packagePath, JSON.stringify(data, null, 2) + "\n", "utf8");
  log("update  package.json");
}

function ensureGitignore() {
  const ignorePath = path.join(cwd, ".gitignore");
  const entries = ["openapi-spec.ts", "public/swagger-ui"];

  if (!fs.existsSync(ignorePath)) {
    fs.writeFileSync(ignorePath, entries.join("\n") + "\n", "utf8");
    log("create  .gitignore");
    return;
  }

  const current = fs.readFileSync(ignorePath, "utf8");
  let updated = current;
  for (const entry of entries) {
    if (!current.includes(entry)) {
      updated += (updated.endsWith("\n") ? "" : "\n") + entry + "\n";
    }
  }

  if (updated !== current) {
    fs.writeFileSync(ignorePath, updated, "utf8");
    log("update  .gitignore");
  }
}

function init() {
  const router = detectRouter();
  if (!router) {
    warn("No app/ or pages/ directory found. Run this in a Next.js project.");
    process.exit(1);
  }

  const libDir = path.join(cwd, "lib");
  const scriptsDir = path.join(cwd, "scripts");

  writeFileIfMissing(
    path.join(cwd, "openapi.config.ts"),
    `export const openapiConfig = {\n  info: {\n    title: \"Next Swagger Auto\",\n    version: \"0.1.0\",\n    description: \"FastAPI-style docs for Next.js\"\n  },\n  servers: [],\n  includeUndocumented: true,\n  defaultMethods: [\"get\"]\n};\n`
  );

  writeFileIfMissing(
    path.join(libDir, "next-swagger-auto.ts"),
    `import type { ZodTypeAny } from \"zod\";\n\nexport type HttpMethod =\n  | \"get\"\n  | \"post\"\n  | \"put\"\n  | \"patch\"\n  | \"delete\"\n  | \"head\"\n  | \"options\";\n\nexport type RouteDoc = {\n  method: HttpMethod;\n  summary?: string;\n  description?: string;\n  tags?: string[];\n  request?: ZodTypeAny;\n  response?: ZodTypeAny;\n  responses?: Record<\n    string,\n    {\n      description?: string;\n      schema?: ZodTypeAny;\n    }\n  >;\n};\n\nexport function defineRoute(doc: RouteDoc) {\n  return doc;\n}\n`
  );

  writeFileIfMissing(
    path.join(libDir, "docs-page.tsx"),
    `\"use client\";\n\nimport { useEffect, useRef } from \"react\";\n\nfunction loadScript(src: string) {\n  return new Promise<void>((resolve, reject) => {\n    if (document.querySelector(\`script[src=\\\"\${src}\\\"]\`)) {\n      resolve();\n      return;\n    }\n\n    const script = document.createElement(\"script\");\n    script.src = src;\n    script.async = true;\n    script.onload = () => resolve();\n    script.onerror = () => reject(new Error(\`Failed to load \${src}\`));\n    document.body.appendChild(script);\n  });\n}\n\nexport function DocsPage() {\n  const containerRef = useRef<HTMLDivElement | null>(null);\n\n  useEffect(() => {\n    let ui: { destroy?: () => void } | null = null;\n    let active = true;\n\n    const mount = async () => {\n      await loadScript(\"/swagger-ui/swagger-ui-bundle.js\");\n      await loadScript(\"/swagger-ui/swagger-ui-standalone-preset.js\");\n\n      if (!active || !containerRef.current) return;\n\n      const SwaggerUIBundle = (window as any).SwaggerUIBundle;\n\n      if (typeof SwaggerUIBundle !== \"function\") {\n        console.error(\"Swagger UI bundle not available on window.\");\n        return;\n      }\n\n      ui = SwaggerUIBundle({\n        domNode: containerRef.current,\n        url: \"/api/openapi\",\n        docExpansion: \"none\",\n        persistAuthorization: true,\n        presets: [\n          SwaggerUIBundle.presets?.apis,\n          (window as any).SwaggerUIStandalonePreset\n        ].filter(Boolean)\n      });\n    };\n\n    void mount().catch((error) => {\n      console.error(\"Failed to mount Swagger UI:\", error);\n    });\n\n    return () => {\n      active = false;\n      if (ui?.destroy) ui.destroy();\n      if (containerRef.current) {\n        containerRef.current.innerHTML = \"\";\n      }\n    };\n  }, []);\n\n  return (\n    <>\n      <link rel=\"stylesheet\" href=\"/swagger-ui/swagger-ui.css\" />\n      <div ref={containerRef}>Loading docs...</div>\n    </>\n  );\n}\n`
  );

  const generateSource = fs.readFileSync(
    path.join(__dirname, "..", "scripts", "generate-openapi.ts"),
    "utf8"
  );
  const watchSource = fs.readFileSync(
    path.join(__dirname, "..", "scripts", "watch-openapi.ts"),
    "utf8"
  );
  const copySource = fs.readFileSync(
    path.join(__dirname, "..", "scripts", "copy-swagger-ui.ts"),
    "utf8"
  );

  writeFileIfMissing(path.join(scriptsDir, "generate-openapi.ts"), generateSource);
  writeFileIfMissing(path.join(scriptsDir, "watch-openapi.ts"), watchSource);
  writeFileIfMissing(path.join(scriptsDir, "copy-swagger-ui.ts"), copySource);

  if (router.type === "app") {
    const docsFile = path.join(router.base, "docs", "page.tsx");
    const docsImport = relativeImport(docsFile, path.join(cwd, "lib", "docs-page"));

    writeFileIfMissing(docsFile, `export { DocsPage as default } from \"${docsImport}\";\n`);

    const routeFile = path.join(router.base, "api", "openapi", "route.ts");
    const specImport = relativeImport(routeFile, path.join(cwd, "openapi-spec"));

    writeFileIfMissing(
      routeFile,
      `import { NextResponse } from \"next/server\";\nimport { openapiSpec } from \"${specImport}\";\n\nexport const dynamic = \"force-static\";\n\nexport function GET() {\n  return NextResponse.json(openapiSpec);\n}\n`
    );
  } else {
    const docsFile = path.join(router.base, "docs.tsx");
    const docsImport = relativeImport(docsFile, path.join(cwd, "lib", "docs-page"));

    writeFileIfMissing(
      docsFile,
      `import dynamic from \"next/dynamic\";\n\nconst DocsPage = dynamic(() => import(\"${docsImport}\").then((mod) => mod.DocsPage), {\n  ssr: false\n});\n\nexport default DocsPage;\n`
    );

    const routeFile = path.join(router.base, "api", "openapi.ts");
    const specImport = relativeImport(routeFile, path.join(cwd, "openapi-spec"));

    writeFileIfMissing(
      routeFile,
      `import type { NextApiRequest, NextApiResponse } from \"next\";\nimport { openapiSpec } from \"${specImport}\";\n\nexport default function handler(_req: NextApiRequest, res: NextApiResponse) {\n  res.status(200).json(openapiSpec);\n}\n`
    );
  }

  updatePackageJson();
  ensureGitignore();

  log("\nDone. Run:");
  log("  npm install");
  log("  npm run dev");
}

if (command === "init") {
  init();
} else {
  warn("Usage: next-swagger-auto init");
  process.exit(1);
}
