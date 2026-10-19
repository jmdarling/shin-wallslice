import { createReadStream } from 'node:fs';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { singleDownloadName, slugify, type SourceResponse } from '@shin-wallslice/core';
import type { AppContext } from '../app.js';
import { badRequest } from '../errors.js';
import { fetchImageUrl } from '../sources/url-fetch.js';
import type { SourceMeta } from '../sources/store.js';
import {
  BinaryResponseSchema,
  errorResponses,
  NameSuggestionResponseSchema,
  RenderRequestSchema,
  SaveResponseSchema,
  SourceParamsSchema,
  SourceResponseSchema,
  SubjectResponseSchema,
  UrlSourceRequestSchema,
} from '../schemas.js';

function toResponse(meta: SourceMeta): SourceResponse {
  return {
    id: meta.id,
    width: meta.size.width,
    height: meta.size.height,
    proxyUrl: `/api/sources/${meta.id}/proxy`,
    proxyWidth: meta.proxySize.width,
    proxyHeight: meta.proxySize.height,
    baseName: meta.baseName,
  };
}

export const sourceRoutes: FastifyPluginAsyncTypebox<{ ctx: AppContext }> = async (app, { ctx }) => {
  const { pipeline, store, config } = ctx;

  app.post(
    '/api/sources',
    { schema: { response: { 201: SourceResponseSchema, ...errorResponses } } },
    async (request, reply) => {
      if (!request.isMultipart()) throw badRequest('invalid_request', 'Expected a multipart upload.');
      const file = await request.file({ limits: { fileSize: config.maxUploadBytes, files: 1 } });
      if (!file) throw badRequest('invalid_request', 'No file was uploaded.');
      const buffer = await file.toBuffer();
      const meta = await pipeline.ingest(buffer, file.filename || 'pasted-image');
      return reply.code(201).send(toResponse(meta));
    },
  );

  app.post(
    '/api/sources/url',
    { schema: { body: UrlSourceRequestSchema, response: { 201: SourceResponseSchema, ...errorResponses } } },
    async (request, reply) => {
      const fetched = await fetchImageUrl(request.body.url, {
        maxBytes: config.maxUploadBytes,
        allowPrivate: config.urlFetchAllowPrivate,
      });
      const meta = await pipeline.ingest(fetched.buffer, fetched.url.pathname || fetched.url.hostname);
      return reply.code(201).send(toResponse(meta));
    },
  );

  app.get(
    '/api/sources/:id/proxy',
    { schema: { params: SourceParamsSchema, response: { 200: BinaryResponseSchema, ...errorResponses } } },
    async (request, reply) => {
      await store.readMeta(request.params.id);
      return reply
        .type('image/jpeg')
        .header('cache-control', 'private, max-age=86400, immutable')
        .send(createReadStream(store.proxyPath(request.params.id)));
    },
  );

  app.get(
    '/api/sources/:id/subject',
    { schema: { params: SourceParamsSchema, response: { 200: SubjectResponseSchema, ...errorResponses } } },
    async (request) => pipeline.subject(request.params.id),
  );

  app.post(
    '/api/sources/:id/name-suggestion',
    {
      schema: {
        params: SourceParamsSchema,
        response: { 200: NameSuggestionResponseSchema, ...errorResponses },
      },
    },
    async (request) => ({ name: await pipeline.suggestName(request.params.id) }),
  );

  app.post(
    '/api/sources/:id/render',
    {
      schema: {
        params: SourceParamsSchema,
        body: RenderRequestSchema,
        response: { 200: BinaryResponseSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const { targets, name, subject } = request.body;
      const { planned } = await pipeline.plan(request.params.id, targets, subject);
      const baseName = slugify(name);
      if (planned.length === 1) {
        const [item] = planned as [(typeof planned)[number]];
        const { width, height } = item.crop.outputSize;
        const png = await pipeline.render(request.params.id, item);
        return reply
          .type('image/png')
          .header(
            'content-disposition',
            `attachment; filename="${singleDownloadName(baseName, item.target.key, width, height)}"`,
          )
          .send(png);
      }
      const zip = await pipeline.zip(request.params.id, planned, baseName);
      return reply
        .type('application/zip')
        .header('content-disposition', `attachment; filename="${baseName}.zip"`)
        .send(zip);
    },
  );

  app.post(
    '/api/sources/:id/save',
    {
      schema: {
        params: SourceParamsSchema,
        body: RenderRequestSchema,
        response: { 200: SaveResponseSchema, ...errorResponses },
      },
    },
    async (request) => {
      const { targets, name, subject } = request.body;
      const { planned } = await pipeline.plan(request.params.id, targets, subject);
      return { files: await pipeline.save(request.params.id, planned, name) };
    },
  );
};
