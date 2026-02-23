import fs from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const distDir = path.join(projectRoot, "node_modules", "swagger-ui", "dist");
const outDir = path.join(projectRoot, "public", "swagger-ui");

const files = [
  "swagger-ui-bundle.js",
  "swagger-ui-standalone-preset.js",
  "swagger-ui.css"
];

async function copy() {
  await fs.mkdir(outDir, { recursive: true });

  for (const file of files) {
    const src = path.join(distDir, file);
    const dest = path.join(outDir, file);

    try {
      await fs.copyFile(src, dest);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to copy ${file}: ${message}`);
    }
  }

  console.log(`Swagger UI assets copied to ${outDir}`);
}

copy().catch((error) => {
  console.error(error);
  process.exit(1);
});
