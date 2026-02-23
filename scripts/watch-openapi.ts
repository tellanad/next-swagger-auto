import chokidar from "chokidar";
import { generateOpenApi } from "./generate-openapi";

const watchPaths = [
  "app/**/route.ts",
  "app/**/route.tsx",
  "app/**/route.js",
  "app/**/route.jsx",
  "src/app/**/route.ts",
  "src/app/**/route.tsx",
  "src/app/**/route.js",
  "src/app/**/route.jsx",
  "pages/api/**/*.ts",
  "pages/api/**/*.tsx",
  "pages/api/**/*.js",
  "pages/api/**/*.jsx",
  "src/pages/api/**/*.ts",
  "src/pages/api/**/*.tsx",
  "src/pages/api/**/*.js",
  "src/pages/api/**/*.jsx",
  "openapi.config.ts",
  "openapi.config.js"
];

let running = false;
let pending = false;

async function run() {
  if (running) {
    pending = true;
    return;
  }

  running = true;
  try {
    await generateOpenApi();
  } finally {
    running = false;
    if (pending) {
      pending = false;
      void run();
    }
  }
}

const watcher = chokidar.watch(watchPaths, {
  ignoreInitial: false
});

watcher.on("all", async () => {
  await run();
});

process.on("SIGINT", async () => {
  await watcher.close();
  process.exit(0);
});
