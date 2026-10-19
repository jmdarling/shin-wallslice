import { mkdir, readFile } from 'node:fs/promises';
import { buildApp } from './app.js';
import { loadCatalog } from './catalog.js';
import { loadConfig } from './config.js';
import { LocalSubjectDetector } from './detection/local-detector.js';
import { Limiter } from './limiter.js';
import { createNameSuggester } from './naming/index.js';
import { Pipeline } from './pipeline.js';
import { SourceStore } from './sources/store.js';

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

async function main(): Promise<void> {
  const config = loadConfig();
  const { version } = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { version: string };

  // Refuse to start on an invalid catalog (AGENTS.md rule 6).
  const catalog = await loadCatalog(config.devicesDir);

  await mkdir(config.dataDir, { recursive: true });
  if (!config.isProduction) await mkdir(config.outputDir, { recursive: true });
  const store = new SourceStore(config.dataDir);
  await store.init();

  const startupLog: Array<() => void> = [];
  const logger = {
    info: (message: string) => startupLog.push(() => app.log.info(message)),
    warn: (message: string) => startupLog.push(() => app.log.warn(message)),
  };
  const detector = await LocalSubjectDetector.create(config.modelsDir, config.maxInputMegapixels, logger);
  const namer = createNameSuggester(config.naming);

  const pipeline = new Pipeline({
    store,
    catalog,
    detector,
    namer,
    limiter: new Limiter(config.workConcurrency),
    maxInputMegapixels: config.maxInputMegapixels,
    outputDir: config.outputDir,
    logger: { warn: (message) => app.log.warn(message) },
  });

  const app = await buildApp({
    version,
    config,
    catalog,
    store,
    detector,
    pipeline,
    namingEnabled: namer !== undefined,
  });
  for (const log of startupLog) log();
  app.log.info(
    `Loaded ${catalog.devices.length} devices; detector models ${detector.ready ? 'loaded' : 'MISSING (fallback active)'}; ` +
      `AI naming ${namer ? `enabled (${namer.provider})` : 'disabled'}.`,
  );

  const sweep = () =>
    store
      .sweep(config.tempTtlMs)
      .then((removed) => removed > 0 && app.log.info(`Removed ${removed} expired source(s).`))
      .catch((error: unknown) => app.log.warn(`Sweep failed: ${String(error)}`));
  await sweep();
  const timer = setInterval(sweep, SWEEP_INTERVAL_MS);
  timer.unref();

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      app.log.info(`Received ${signal}, shutting down.`);
      void app.close().then(() => process.exit(0));
    });
  }

  await app.listen({ host: config.host, port: config.port });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
