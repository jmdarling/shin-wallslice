import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { AppConfigResponse } from '@shin-wallslice/core';
import { ConfigResponseSchema, DevicesResponseSchema, HealthResponseSchema } from '../schemas.js';
import type { AppContext } from '../app.js';

export const metaRoutes: FastifyPluginAsyncTypebox<{ ctx: AppContext }> = async (app, { ctx }) => {
  app.get('/api/health', { schema: { response: { 200: HealthResponseSchema } } }, async () => ({
    status: 'ok' as const,
    detector: { name: ctx.detector.name, modelsLoaded: ctx.detector.ready },
  }));

  app.get('/api/config', { schema: { response: { 200: ConfigResponseSchema } } }, async () => {
    const response: AppConfigResponse = {
      version: ctx.version,
      outputVolumeAvailable: await ctx.pipeline.outputAvailable(),
      namingEnabled: ctx.namingEnabled,
      limits: {
        maxUploadMb: ctx.config.maxUploadMb,
        maxInputMegapixels: ctx.config.maxInputMegapixels,
      },
    };
    return response;
  });

  app.get('/api/devices', { schema: { response: { 200: DevicesResponseSchema } } }, async () => ({
    devices: ctx.catalog.devices,
  }));
};
