import { parseArgs } from 'node:util';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

try {
  const { values } = parseArgs({ options: { config: { type: 'string' } } });
  const config = await loadConfig(values.config);
  const app = buildApp(config);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void app.close().catch((error) => {
        console.error(error);
        process.exitCode = 1;
      });
    });
  }
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
