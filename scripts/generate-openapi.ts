import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import fg from "fast-glob";
import jiti from "jiti";
import ts from "typescript";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { RouteDoc, HttpMethod } from "../lib/next-swagger-auto";

const projectRoot = process.cwd();
const defaultConfig = {
  info: {
    title: "Next Swagger Auto",
    version: "0.1.0",
    description: "FastAPI-style docs for a Next.js app"
  },
  servers: [] as { url: string }[],
  includeUndocumented: true,
  defaultMethods: ["get"] as HttpMethod[]
};

type OpenApiConfig = typeof defaultConfig & {
  includeUndocumented?: boolean;
  defaultMethods?: HttpMethod[];
};

function normalizePath(filePath: string, baseDir: string, isAppRouter: boolean) {
  const relative = path.relative(baseDir, filePath);
  const parts = relative.split(path.sep);

  if (isAppRouter) {
    // Remove the trailing route.ts/tsx/js/jsx
    parts.pop();
  } else {
    const fileName = parts.pop();
    if (fileName) {
      const name = fileName.replace(/\.(tsx|ts|jsx|js)$/, "");
      if (name !== "index") {
        parts.push(name);
      }
    }
  }

  // Drop route groups like (admin)
  const cleaned = isAppRouter
    ? parts.filter(
        (segment) => !(segment.startsWith("(") && segment.endsWith(")"))
      )
    : parts;

  const mapped = cleaned.map((segment) => {
    if (segment.startsWith("[[...") && segment.endsWith("]]")) {
      return `{${segment.slice(5, -2)}}`;
    }
    if (segment.startsWith("[...") && segment.endsWith("]")) {
      return `{${segment.slice(4, -1)}}`;
    }
    if (segment.startsWith("[") && segment.endsWith("]")) {
      return `{${segment.slice(1, -1)}}`;
    }
    return segment;
  });

  return `/${mapped.join("/")}`;
}

function sanitizeSchemaName(value: string) {
  const cleaned = value
    .replace(/^\/+/, "")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return cleaned.length > 0 ? cleaned : "Schema";
}

function stripSchemaMeta(schema: Record<string, unknown>) {
  if ("$schema" in schema) {
    delete schema.$schema;
  }
}

function replaceRefs(
  value: unknown,
  mapRef: (ref: string) => string
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => replaceRefs(item, mapRef));
  }

  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (key === "definitions" || key === "$defs") continue;
      if (key === "$ref" && typeof child === "string") {
        next[key] = mapRef(child);
        continue;
      }
      next[key] = replaceRefs(child, mapRef);
    }
    return next;
  }

  return value;
}

function toSchema(
  docSchema: RouteDoc["request"],
  name: string,
  componentsSchemas: Record<string, unknown>
) {
  if (!docSchema) return undefined;

  const schemaName = sanitizeSchemaName(name);

  const jsonSchema = zodToJsonSchema(docSchema, {
    name: schemaName,
    $refStrategy: "root",
    target: "openApi3"
  }) as Record<string, unknown>;

  stripSchemaMeta(jsonSchema);

  const definitions =
    (jsonSchema.definitions as Record<string, unknown> | undefined) ??
    (jsonSchema.$defs as Record<string, unknown> | undefined);

  const nameMap = new Map<string, string>();

  if (definitions) {
    for (const defName of Object.keys(definitions)) {
      nameMap.set(defName, sanitizeSchemaName(defName));
    }

    for (const [defName, defSchema] of Object.entries(definitions)) {
      if (!defSchema || typeof defSchema !== "object") continue;
      const mappedName = nameMap.get(defName) ?? sanitizeSchemaName(defName);
      const normalizedDef = replaceRefs(defSchema, (ref) => {
        if (ref.startsWith("#/definitions/")) {
          const key = ref.slice("#/definitions/".length);
          const mapped = nameMap.get(key) ?? sanitizeSchemaName(key);
          return `#/components/schemas/${mapped}`;
        }
        if (ref.startsWith("#/$defs/")) {
          const key = ref.slice("#/$defs/".length);
          const mapped = nameMap.get(key) ?? sanitizeSchemaName(key);
          return `#/components/schemas/${mapped}`;
        }
        return ref;
      }) as Record<string, unknown>;

      stripSchemaMeta(normalizedDef);
      componentsSchemas[mappedName] = normalizedDef;
    }
  }

  const normalizedSchema = replaceRefs(jsonSchema, (ref) => {
    if (ref.startsWith("#/definitions/")) {
      const key = ref.slice("#/definitions/".length);
      const mapped = nameMap.get(key) ?? sanitizeSchemaName(key);
      return `#/components/schemas/${mapped}`;
    }
    if (ref.startsWith("#/$defs/")) {
      const key = ref.slice("#/$defs/".length);
      const mapped = nameMap.get(key) ?? sanitizeSchemaName(key);
      return `#/components/schemas/${mapped}`;
    }
    return ref;
  }) as Record<string, unknown>;

  return normalizedSchema;
}

function isZodSchema(value: unknown): value is RouteDoc["request"] {
  return (
    typeof value === "object" &&
    value !== null &&
    "safeParse" in value &&
    typeof (value as { safeParse?: unknown }).safeParse === "function"
  );
}

function normalizeMethods(methods: string[]) {
  const allowed: HttpMethod[] = [
    "get",
    "post",
    "put",
    "patch",
    "delete",
    "head",
    "options"
  ];

  const normalized = methods
    .map((method) => method.toLowerCase())
    .filter((method) => allowed.includes(method as HttpMethod));

  return Array.from(new Set(normalized)) as HttpMethod[];
}

function getTagFromPath(routePath: string) {
  const parts = routePath.split("/").filter(Boolean);
  if (parts[0] === "api" && parts[1]) return parts[1];
  return parts[0];
}

async function inferMethodsFromFile(
  filePath: string,
  fallback: HttpMethod[]
): Promise<HttpMethod[]> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const matches = new Set<string>();
    const regexes = [
      /req\.method\s*===\s*["'`](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)["'`]/g,
      /req\.method\s*!==\s*["'`](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)["'`]/g,
      /case\s+["'`](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)["'`]/g
    ];

    for (const regex of regexes) {
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        matches.add(match[1]);
      }
    }

    if (matches.size > 0) {
      return normalizeMethods(Array.from(matches));
    }
  } catch {
    // ignore
  }

  return fallback;
}

async function loadConfig(): Promise<OpenApiConfig> {
  const tsConfigPath = path.join(projectRoot, "openapi.config.ts");
  const jsConfigPath = path.join(projectRoot, "openapi.config.js");

  try {
    const mod = await import(pathToFileURL(tsConfigPath).href);
    if (mod?.openapiConfig) return mod.openapiConfig as OpenApiConfig;
  } catch (error) {
    // ignore
  }

  try {
    const mod = await import(pathToFileURL(jsConfigPath).href);
    if (mod?.openapiConfig) return mod.openapiConfig as OpenApiConfig;
  } catch (error) {
    // ignore
  }

  return defaultConfig;
}

function loadTsconfigAliases() {
  const configPath = ts.findConfigFile(projectRoot, ts.sys.fileExists, "tsconfig.json");
  if (!configPath) return {};

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) return {};

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configPath)
  );

  const baseUrl = parsed.options.baseUrl
    ? path.resolve(parsed.options.baseUrl)
    : projectRoot;

  const paths = parsed.options.paths ?? {};
  const alias: Record<string, string> = {};

  for (const [key, targets] of Object.entries(paths)) {
    const firstTarget = Array.isArray(targets) ? targets[0] : targets;
    if (!firstTarget) continue;

    const aliasKey = key.replace(/\/\*$/, "");
    const targetPath = firstTarget.replace(/\/\*$/, "");
    alias[aliasKey] = path.resolve(baseUrl, targetPath);
  }

  return alias;
}

export async function generateOpenApi() {
  const config = await loadConfig();
  const alias = loadTsconfigAliases();
  const loader = jiti(projectRoot, { interopDefault: true, alias });

  const appRoots = ["app", "src/app"].filter((dir) =>
    fsSync.existsSync(path.join(projectRoot, dir))
  );
  const pageRoots = ["pages", "src/pages"].filter((dir) =>
    fsSync.existsSync(path.join(projectRoot, dir))
  );

  const appPatterns = appRoots.flatMap((root) => [
    `${root}/**/route.ts`,
    `${root}/**/route.tsx`,
    `${root}/**/route.js`,
    `${root}/**/route.jsx`
  ]);

  const pagePatterns = pageRoots.flatMap((root) => [
    `${root}/api/**/*.ts`,
    `${root}/api/**/*.tsx`,
    `${root}/api/**/*.js`,
    `${root}/api/**/*.jsx`
  ]);

  const files = await fg([...appPatterns, ...pagePatterns], {
    cwd: projectRoot,
    absolute: true,
    ignore: [
      "**/api/openapi/route.*",
      "pages/api/openapi.*",
      "src/pages/api/openapi.*"
    ]
  });

  const spec: Record<string, unknown> = {
    openapi: "3.0.0",
    info: config.info,
    servers: config.servers,
    paths: {},
    components: {
      schemas: {}
    }
  };

  const paths = spec.paths as Record<string, Record<string, unknown>>;
  const componentsSchemas = (spec.components as { schemas: Record<string, unknown> })
    .schemas;

  for (const file of files) {
    const isAppRoute = appRoots.some((root) =>
      file.startsWith(path.join(projectRoot, root) + path.sep)
    );
    const baseDir = isAppRoute
      ? appRoots
          .map((root) => path.join(projectRoot, root))
          .find((root) => file.startsWith(root + path.sep)) ?? projectRoot
      : pageRoots
          .map((root) => path.join(projectRoot, root))
          .find((root) => file.startsWith(root + path.sep)) ?? projectRoot;

    const routePath = normalizePath(file, baseDir, isAppRoute);

    let mod: Record<string, unknown>;
    try {
      mod = loader(file) as Record<string, unknown>;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[next-swagger-auto] Skipping ${file}: ${message}`);
      continue;
    }

    const docsExport = mod.docs as RouteDoc | RouteDoc[] | undefined;
    const docsList = docsExport
      ? Array.isArray(docsExport)
        ? docsExport
        : [docsExport]
      : [];

    const docsByMethod = new Map<string, RouteDoc>();
    for (const doc of docsList) {
      if (doc?.method) {
        docsByMethod.set(doc.method.toLowerCase(), doc);
      }
    }

    let inferredMethods: HttpMethod[] = [];

    if (docsByMethod.size === 0 && config.includeUndocumented) {
      if (isAppRoute) {
        const exportedMethods = Object.keys(mod).filter((key) =>
          [
            "GET",
            "POST",
            "PUT",
            "PATCH",
            "DELETE",
            "HEAD",
            "OPTIONS"
          ].includes(key)
        );
        inferredMethods = normalizeMethods(exportedMethods);
      } else {
        inferredMethods = await inferMethodsFromFile(
          file,
          config.defaultMethods ?? defaultConfig.defaultMethods
        );
      }
    }

    const methodsToProcess = new Set<string>([
      ...Array.from(docsByMethod.keys()),
      ...inferredMethods
    ]);

    if (methodsToProcess.size === 0) continue;

    const requestSchema =
      isZodSchema((mod as { RequestSchema?: unknown }).RequestSchema)
        ? (mod as { RequestSchema: RouteDoc["request"] }).RequestSchema
        : isZodSchema((mod as { requestSchema?: unknown }).requestSchema)
        ? (mod as { requestSchema: RouteDoc["request"] }).requestSchema
        : isZodSchema((mod as { BodySchema?: unknown }).BodySchema)
        ? (mod as { BodySchema: RouteDoc["request"] }).BodySchema
        : isZodSchema((mod as { bodySchema?: unknown }).bodySchema)
        ? (mod as { bodySchema: RouteDoc["request"] }).bodySchema
        : undefined;

    const responseSchema =
      isZodSchema((mod as { ResponseSchema?: unknown }).ResponseSchema)
        ? (mod as { ResponseSchema: RouteDoc["request"] }).ResponseSchema
        : isZodSchema((mod as { responseSchema?: unknown }).responseSchema)
        ? (mod as { responseSchema: RouteDoc["request"] }).responseSchema
        : isZodSchema((mod as { OutputSchema?: unknown }).OutputSchema)
        ? (mod as { OutputSchema: RouteDoc["request"] }).OutputSchema
        : isZodSchema((mod as { outputSchema?: unknown }).outputSchema)
        ? (mod as { outputSchema: RouteDoc["request"] }).outputSchema
        : undefined;

    for (const method of methodsToProcess) {
      if (!paths[routePath]) {
        paths[routePath] = {};
      }

      const doc = docsByMethod.get(method);
      const summary =
        doc?.summary ?? `${method.toUpperCase()} ${routePath}`;
      const tag = getTagFromPath(routePath);
      const tags = doc?.tags ?? (tag ? [tag] : undefined);

      const operation: Record<string, unknown> = {
        summary,
        description: doc?.description,
        tags,
        responses: {}
      };

      const request = doc?.request ?? requestSchema;

      if (request) {
        operation.requestBody = {
          required: true,
          content: {
            "application/json": {
              schema: toSchema(
                request,
                `${routePath}_${method}_request`,
                componentsSchemas
              )
            }
          }
        };
      }

      const responses: Record<string, unknown> = {};

      const response = doc?.response ?? responseSchema;

      if (response) {
        responses["200"] = {
          description: "OK",
          content: {
            "application/json": {
              schema: toSchema(
                response,
                `${routePath}_${method}_response`,
                componentsSchemas
              )
            }
          }
        };
      }

      if (doc?.responses) {
        for (const [status, responseDoc] of Object.entries(doc.responses)) {
          if (!responseDoc.schema) {
            responses[status] = {
              description: responseDoc.description || "Response"
            };
            continue;
          }

          responses[status] = {
            description: responseDoc.description || "Response",
            content: {
              "application/json": {
                schema: toSchema(
                  responseDoc.schema,
                  `${routePath}_${method}_response_${status}`,
                  componentsSchemas
                )
              }
            }
          };
        }
      }

      if (Object.keys(responses).length === 0) {
        responses["200"] = { description: "OK" };
      }

      operation.responses = responses;

      paths[routePath][method] = operation;
    }
  }

  const outputPath = path.join(projectRoot, "openapi-spec.ts");
  const outputDir = path.dirname(outputPath);
  const fileContents = `/*\n * AUTO-GENERATED FILE. DO NOT EDIT.\n */\n\nexport const openapiSpec = ${JSON.stringify(
    spec,
    null,
    2
  )} as const;\n`;

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPath, fileContents, "utf-8");

  console.log(`OpenAPI spec written to ${outputPath}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateOpenApi().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
