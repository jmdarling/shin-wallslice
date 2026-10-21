# No architecture-specific binaries are copied from the host.
FROM node:24-trixie-slim AS base
WORKDIR /app
RUN npm install --global pnpm@11.25.0

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/client/package.json packages/client/package.json
COPY packages/server/package.json packages/server/package.json
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages ./packages
RUN pnpm build

FROM base AS production-dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/client/package.json packages/client/package.json
COPY packages/server/package.json packages/server/package.json
RUN pnpm install --prod --frozen-lockfile --filter @shin-wallslice/server...

FROM node:24-trixie-slim AS runtime
ARG VERSION=1.2.0
ARG REVISION=unknown
LABEL org.opencontainers.image.source="https://github.com/jmdarling/shin-wallslice" \
      org.opencontainers.image.version=$VERSION \
      org.opencontainers.image.revision=$REVISION \
      org.opencontainers.image.licenses="MIT"
RUN apt-get update && apt-get upgrade -y --no-install-recommends && apt-get install -y --no-install-recommends gosu && rm -rf /var/lib/apt/lists/* /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /opt/yarn* /usr/local/bin/yarn* /usr/local/bin/corepack
RUN find /usr -xdev -type f -perm /6000 -exec chmod a-s {} +
WORKDIR /app
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/packages/server/node_modules ./packages/server/node_modules
COPY packages/server/package.json ./packages/server/package.json
COPY --from=build /app/packages/server/dist ./packages/server/dist
COPY --from=build /app/packages/client/dist ./packages/client/dist
COPY config/docker.json ./config/default.json
COPY --chmod=755 scripts/container-entrypoint.sh /usr/local/bin/wallslice-entrypoint
RUN mkdir -p /config /data && chown node:node /config /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD ["node", "--input-type=module", "-e", "import { loadConfig } from './packages/server/dist/config.js'; const c = await loadConfig(); const host = ['0.0.0.0', '::'].includes(c.host) ? '127.0.0.1' : c.host; const r = await fetch('http://' + (host.includes(':') ? '[' + host + ']' : host) + ':' + c.port + '/api/health'); if (!r.ok || (await r.json()).status !== 'ok') process.exit(1);"]
ENTRYPOINT ["wallslice-entrypoint"]
CMD ["node", "packages/server/dist/index.js"]
