# syntax=docker/dockerfile:1.7
# Single self-contained image: API + web UI + bundled ONNX models. No companion containers.

# Official Node image; override with e.g. mirror.gcr.io/library/node:24-bookworm-slim
# when Docker Hub rate limits apply.
ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    # The CPU execution provider ships inside onnxruntime-node; skip the CUDA download.
    ONNXRUNTIME_NODE_INSTALL=skip
RUN corepack enable
WORKDIR /app

# --- Build: install, compile, and produce a pruned production server bundle ---------------
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages/core packages/core
COPY apps apps
COPY devices devices
RUN pnpm build
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @shin-wallslice/server deploy --prod --legacy /out/server
# Keep only this platform's native binaries (onnxruntime ships every OS/arch; sharp ships musl too).
RUN set -eu; cd /out/server/node_modules/.pnpm; \
    arch="$(node -p process.arch)"; \
    for bin in onnxruntime-node@*/node_modules/onnxruntime-node/bin/napi-v*; do \
      find "$bin" -mindepth 1 -maxdepth 1 ! -name linux -exec rm -rf {} +; \
      find "$bin/linux" -mindepth 1 -maxdepth 1 ! -name "$arch" -exec rm -rf {} +; \
    done; \
    rm -rf @img+sharp-libvips-linuxmusl-* @img+sharp-linuxmusl-*

# --- Models: verified by checksum (local copies in ./models are reused when present) ------
FROM base AS models
COPY models/ /app/models/
COPY scripts/fetch-models.mjs /app/scripts/fetch-models.mjs
RUN node /app/scripts/fetch-models.mjs /app/models && rm -f /app/models/*.download

# --- Runtime -------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
LABEL org.opencontainers.image.title="shin-wallslice" \
      org.opencontainers.image.description="Form-fit wallpapers to every device" \
      org.opencontainers.image.source="https://github.com/jmdarling/shin-wallslice" \
      org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data \
    OUTPUT_DIR=/output \
    MODELS_DIR=/app/models \
    DEVICES_DIR=/app/devices \
    WEB_DIST_DIR=/app/web \
    PUID=99 \
    PGID=100 \
    UMASK=022

WORKDIR /app
COPY --from=build /out/server /app/server
COPY --from=build /app/apps/web/dist /app/web
COPY --from=models /app/models /app/models
COPY devices /app/devices
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod 0755 /usr/local/bin/entrypoint.sh && mkdir -p /data /output

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "/app/server/dist/index.js"]
