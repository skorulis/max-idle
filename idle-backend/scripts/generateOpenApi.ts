import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildOpenApiDocument } from "../src/apiContract.js";

async function main(): Promise<void> {
  const outputPath = path.resolve(process.cwd(), "openapi/openapi.json");
  const outputDir = path.dirname(outputPath);

  await mkdir(outputDir, { recursive: true });
  const document = buildOpenApiDocument();
  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  console.log(`OpenAPI spec written to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
