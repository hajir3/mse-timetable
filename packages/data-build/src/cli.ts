#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildDataset } from "./build";

async function main() {
  const [dataDir, outFile] = process.argv.slice(2);
  if (!dataDir || !outFile) {
    console.error("Usage: mse-data-build <dataDir> <outFile>");
    process.exit(1);
  }

  const dataset = await buildDataset(path.resolve(dataDir));
  await mkdir(path.dirname(path.resolve(outFile)), { recursive: true });
  await writeFile(path.resolve(outFile), JSON.stringify(dataset, null, 2));

  console.log(
    `[data-build] wrote ${outFile}: ${dataset.modules.length} modules, ${dataset.sessions.length} sessions, ${dataset.calendarWeeks.length} calendar weeks`,
  );
}

main().catch((err) => {
  console.error(`[data-build] failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
