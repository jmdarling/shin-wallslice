#!/usr/bin/env node
// Download the ONNX models listed in models/manifest.json and verify their SHA-256 checksums.
// Usage: node scripts/fetch-models.mjs [targetDir]   (default: ./models)
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const manifestPath = new URL('../models/manifest.json', import.meta.url);
const targetDir = process.argv[2] ?? new URL('../models/', import.meta.url).pathname;
const { models } = JSON.parse(await readFile(manifestPath, 'utf8'));

async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

await mkdir(targetDir, { recursive: true });
for (const model of models) {
  const destination = join(targetDir, model.file);
  const existing = await sha256(destination).catch(() => undefined);
  if (existing === model.sha256) {
    console.log(`✓ ${model.file} (cached)`);
    continue;
  }
  console.log(`↓ ${model.file} from ${model.url}`);
  const response = await fetch(model.url);
  if (!response.ok) throw new Error(`Download failed for ${model.file}: HTTP ${response.status}`);
  const temporary = `${destination}.download`;
  await writeFile(temporary, Buffer.from(await response.arrayBuffer()));
  const actual = await sha256(temporary);
  if (actual !== model.sha256) {
    await rm(temporary, { force: true });
    throw new Error(`Checksum mismatch for ${model.file}: expected ${model.sha256}, got ${actual}`);
  }
  await rename(temporary, destination);
  console.log(`✓ ${model.file}`);
}
