# shin-wallslice

An automated wallpaper manager, starting with a runnable foundation. Version 0.1.0 displays a Lit placeholder styled with Web Awesome and exposes a Fastify health endpoint. Wallpaper processing and persistence are planned for future versions.

## Local development

Install Node.js **24 LTS** (see `.node-version` / `.nvmrc`) and pnpm **11.25.0**. For example, after installing Node 24:

```sh
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm test:browser:install
pnpm dev
```

Open [localhost:5173](http://localhost:5173). Vite updates the browser automatically when client files change. It proxies `/api` to Fastify at `127.0.0.1:3000`. The server first builds, then runs TypeScript compilation in watch mode alongside `node --watch dist/index.js`; changes to emitted JavaScript restart Node. Stop both packages with Ctrl+C. Default ports are 5173 for Vite and 3000 for Fastify. Keep the server on port 3000 for this default proxy, or update the development proxy in `packages/client/vite.config.ts` when testing a different server port.

The health endpoint is `GET /api/health`, returning HTTP 200 with `{"status":"ok"}`.

## Local verification

From a clean checkout, install dependencies and Chromium as shown above, then run:

```sh
pnpm check
```

This runs the following commands; each can also be run independently and returns a nonzero status on failure:

| Command             | Purpose                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| `pnpm lint`         | ESLint with typescript-eslint                                                                   |
| `pnpm format:check` | Prettier check                                                                                  |
| `pnpm typecheck`    | Explicit strict TypeScript checks for both packages, including tests                            |
| `pnpm test`         | Server Vitest injection/configuration tests and Lit Browser Mode tests with Playwright Chromium |
| `pnpm build`        | Vite client build and TypeScript server compilation                                             |

`pnpm format` applies formatting. On Linux, Chromium may require system libraries: run `pnpm --filter @shin-wallslice/client exec playwright install --with-deps chromium` on a machine where you can install OS packages.

To run the production build locally:

```sh
pnpm build
pnpm start
```

Open [localhost:3000](http://localhost:3000). Fastify serves the HTML, bundled JavaScript/CSS, and `/api/health` through one Node process and port. Vite is not used at runtime. Run from this checkout with its built client present.

## Runtime configuration

The bundled `config/default.json` contains the complete defaults:

```json
{
  "host": "0.0.0.0",
  "port": 3000,
  "logLevel": "info"
}
```

| Setting    | Meaning                                                  | Validation                                                            |
| ---------- | -------------------------------------------------------- | --------------------------------------------------------------------- |
| `host`     | Listen address; `0.0.0.0` permits container port mapping | Nonempty string; the OS must be able to bind the address              |
| `port`     | HTTP listener port                                       | Integer from 1 to 65535; available and permitted for the runtime user |
| `logLevel` | Fastify logging verbosity                                | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, or `silent`       |

At startup the server reads `/config/config.json` if present; otherwise it reads the bundled defaults. A replacement **replaces the entire file**, so all three settings are required. Unknown keys are rejected to catch misspellings. Malformed JSON, invalid settings, unreadable replacement files, and listener failures produce a diagnostic and a nonzero exit. Restart after changing configuration; there is no runtime reload. Environment variables are not used for application configuration.

For an explicit local replacement, create a complete JSON file and run:

```sh
pnpm --filter @shin-wallslice/server start --config /absolute/path/config.json
```

The explicit `--config` path takes precedence and must exist. Relative paths resolve from the server package working directory when launched through pnpm. An example alternate port is `{ "host": "0.0.0.0", "port": 3456, "logLevel": "warn" }`.

## Docker deployment and local smoke check

With Docker running:

```sh
docker build -t shin-wallslice:local .
docker run --rm --name shin-wallslice -p 8080:3000 shin-wallslice:local
```

Open [localhost:8080](http://localhost:8080). This single image requires no database, external service, or sidecar. The runtime uses Node.js 24 LTS, one exposed port (3000 by default), and the image's non-root `node` user (UID/GID 1000). The built-in health check reads the effective JSON configuration.

To mount replacement configuration read-only (first create the complete file):

```sh
docker run --rm --name shin-wallslice -p 8080:3456 \
  --mount type=bind,src="$(pwd)/config.local.json",dst=/config/config.json,readonly \
  shin-wallslice:local
```

This example assumes `config.local.json` sets port 3456. Map the **configured** container port; `EXPOSE 3000` is metadata and does not override JSON. Keep the listen host `0.0.0.0` for IPv4 port mapping. The file must be readable by UID 1000 (for example mode 0644), and containing directories must be traversable. The application never writes to `/config`. `/data` is reserved for future persistent flat files; this version does not read or write application data and does not require a data mount.

Run the automated local smoke check against the built image:

```sh
pnpm docker:smoke
# Or: pnpm docker:smoke your-image:tag
```

It creates temporary containers with random localhost ports, checks the HTML and referenced JS/CSS assets plus the health JSON, confirms a non-root runtime user, verifies a read-only replacement changes the port, and checks malformed and invalid configuration cause clear nonzero startup failures. It removes its containers and temporary fixtures afterward. On Docker Desktop, allow sharing of the OS temporary directory if prompted.

The Dockerfile supports both Linux architectures using the official multi-platform Node image. Build and smoke-test each architecture locally with a Buildx builder that supports it (Docker Desktop includes emulation):

```sh
docker buildx build --platform linux/amd64 --load -t shin-wallslice:amd64 .
pnpm docker:smoke shin-wallslice:amd64
docker buildx build --platform linux/arm64 --load -t shin-wallslice:arm64 .
pnpm docker:smoke shin-wallslice:arm64
```

For a combined local multi-platform archive:

```sh
docker buildx build --platform linux/amd64,linux/arm64 \
  --output type=oci,dest=/tmp/shin-wallslice.oci.tar .
```

Image publishing, GitHub Actions, and an Unraid Community Apps template are outside this version's scope.

## Using Podman

The same Dockerfile and smoke script also work with Podman. Make sure your Podman machine is running on macOS (`podman machine start` if needed). If its executable is not on your shell path, add `/opt/podman/bin` to `PATH`.

```sh
podman build --format docker --platform linux/arm64 -t shin-wallslice:arm64 .
pnpm docker:smoke shin-wallslice:arm64 podman
podman build --format docker --platform linux/amd64 -t shin-wallslice:amd64 .
pnpm docker:smoke shin-wallslice:amd64 podman
```

The smoke script's optional second argument selects the container engine; Docker remains the default. The amd64 build on an arm64 host requires working emulation in the Podman machine. `--format docker` preserves the Dockerfile's health check. Run a persistent local instance with:

```sh
podman run --rm --name shin-wallslice -p 8080:3000 shin-wallslice:arm64
```

Configuration mounts and port mappings work as in the Docker examples. The smoke check's temporary directory must be shared into the Podman machine so it can bind-mount the configuration fixtures. If your machine does not share the default OS temporary directory, set `TMPDIR` to a shared host directory before running the smoke command.
