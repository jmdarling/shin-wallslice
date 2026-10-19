import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import type { RuntimeConfig } from './config.js';

export function buildApp(
  config: RuntimeConfig,
  clientRoot = fileURLToPath(new URL('../../client/dist/', import.meta.url)),
) {
  const app = Fastify({ logger: { level: config.logLevel } });
  app.get('/api/health', async () => ({ status: 'ok' }));
  app.register(fastifyStatic, { root: clientRoot });
  return app;
}
