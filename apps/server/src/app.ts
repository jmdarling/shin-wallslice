import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import compress from '@fastify/compress';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import type { Catalog } from './catalog.js';
import type { Config } from './config.js';
import type { SubjectDetector } from './detection/types.js';
import { AppError } from './errors.js';
import type { Pipeline } from './pipeline.js';
import { metaRoutes } from './routes/meta.js';
import { sourceRoutes } from './routes/sources.js';
import type { SourceStore } from './sources/store.js';

export interface AppContext {
  version: string;
  config: Config;
  catalog: Catalog;
  store: SourceStore;
  detector: SubjectDetector;
  pipeline: Pipeline;
  namingEnabled: boolean;
}

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

export async function buildApp(ctx: AppContext): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: ctx.config.logLevel,
      // Never log request bodies (images) or headers that may carry credentials.
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
    bodyLimit: 1024 * 1024,
  }).withTypeProvider<TypeBoxTypeProvider>();

  await app.register(compress, { global: true, threshold: 1024 });
  await app.register(multipart, {
    limits: { fileSize: ctx.config.maxUploadBytes, files: 1, fields: 5 },
    throwFileSizeLimit: true,
  });

  app.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send(errorBody(error.code, error.message));
    }
    if (error.validation) {
      return reply.code(400).send(errorBody('invalid_request', error.message));
    }
    if (error.code === 'FST_REQ_FILE_TOO_LARGE' || error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply
        .code(413)
        .send(errorBody('payload_too_large', `The upload exceeds ${ctx.config.maxUploadMb} MB.`));
    }
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.code(error.statusCode).send(errorBody('invalid_request', error.message));
    }
    request.log.error(error);
    return reply.code(500).send(errorBody('internal_error', 'Something went wrong.'));
  });

  await app.register(metaRoutes, { ctx });
  await app.register(sourceRoutes, { ctx });

  // Serve the built web app (when present) with an SPA fallback.
  const webIndex = join(ctx.config.webDistDir, 'index.html');
  const hasWeb = await access(webIndex).then(
    () => true,
    () => false,
  );
  if (hasWeb) {
    await app.register(fastifyStatic, { root: ctx.config.webDistDir, wildcard: false });
    const indexHtml = await readFile(webIndex);
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api/')) {
        return reply.type('text/html').send(indexHtml);
      }
      return reply.code(404).send(errorBody('not_found', 'Not found.'));
    });
  } else {
    app.log.warn(`Web build not found at ${ctx.config.webDistDir}; serving the API only.`);
    app.setNotFoundHandler((_request, reply) =>
      reply.code(404).send(errorBody('not_found', 'Not found.')),
    );
  }

  return app;
}
