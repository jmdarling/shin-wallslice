# shin-wallslice

One wallpaper for all your screens. Version 0.2.0 accepts a JPEG, PNG, or WebP, offers independent fixed-size crop positioning for six bundled devices, and exports lossless PNGs individually or together in a ZIP. Lit and Web Awesome provide the interface; Fastify and Sharp process images locally. No accounts, database, external AI service, or other container is required.

## Using the workflow

1. Drop one image, paste an image from the clipboard, or choose a file.
2. Select output devices. Smart starts each crop using image entropy; the five anchors position all selected crops together. Drag any crop independently, or focus its boundary and use arrow keys (Shift moves 10 pixels). Reset position restores that device to the current global method. Crops have fixed size and never leave the source. Softness warnings indicate upscaling.
3. Optionally enable OLEDify: a pixel becomes true black when **all three RGB channels are at or below** the integer threshold. Other pixels retain their RGB values. The cutoff is applied after resizing, including in exported PNGs. Previews update automatically; progress appears while outputs are generated.
4. Continue to Download, edit the base name, and download individual PNGs or the ZIP. Names are normalized into safe basenames. The ZIP defaults to `<name>-<device-id>.png` files at its root. Check “Organize into device folders” to use `<device-id>/<name>.png` instead; individual downloads always retain `<name>-<device-id>.png` names. Back preserves the current work; Start over discards it.

The interface follows your browser’s light or dark color-scheme preference, including changes while the application is open. Browsers without a preference use light mode. Theme changes preserve the current workflow and image colors; there is no manual theme setting or saved theme preference.

Only preferences (device selections, global method/anchor, OLEDify enable/threshold, and device folder organization) survive reload or restart. They are shared by this single-user installation and stored in `preferences.json` under the configured data directory (`/data` in Docker). Existing preferences without a folder organization choice default to unchecked. Sources, crop positions, output files, and edited wallpaper names are temporary and never restored. Browser reload begins at Input. Abandoned jobs expire automatically.

## Development and verification

Use Node.js **24 LTS** (`.node-version` / `.nvmrc`) and pnpm **11.25.0**:

```sh
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm test:browser:install
pnpm dev
```

Open [localhost:5173](http://localhost:5173). Vite proxies `/api` to Fastify at `127.0.0.1:3000`. The server compiles TypeScript in watch mode and runs compiled JavaScript with Node's watch mode. Stop both packages with Ctrl+C. Keep port 3000 for the default proxy, or change `packages/client/vite.config.ts` when testing a different port.

```sh
pnpm check
```

| Command             | Purpose                                                                   |
| ------------------- | ------------------------------------------------------------------------- |
| `pnpm lint`         | ESLint with typescript-eslint                                             |
| `pnpm format:check` | Prettier check (`pnpm format` applies formatting)                         |
| `pnpm typecheck`    | Explicit strict TypeScript checks, including tests                        |
| `pnpm test`         | Fastify injection tests and Lit Browser Mode tests in Playwright Chromium |
| `pnpm build`        | Vite client build and TypeScript server compilation                       |

On Linux, Chromium may need OS libraries: `pnpm --filter @shin-wallslice/client exec playwright install --with-deps chromium`.

For production locally, run `pnpm build` then `pnpm start`, and open [localhost:3000](http://localhost:3000). Fastify serves the client and API through one process and port. `GET /api/health` returns `{"status":"ok"}`. Local defaults put `data/` and `tmp/` under the working directory (the server package when launched through pnpm); both are ignored by Git.

## Runtime configuration

All runtime settings come from static JSON. The local `config/default.json` is:

```json
{
  "host": "0.0.0.0",
  "port": 3000,
  "logLevel": "info",
  "dataDirectory": "./data",
  "temporaryDirectory": "./tmp",
  "memoryBudgetMiB": 2048,
  "temporaryStorageMiB": 4096,
  "jobTtlMinutes": 30,
  "maxJobs": 4
}
```

Docker bundles `config/docker.json` as its defaults, with `dataDirectory` set to `/data` and `temporaryDirectory` set to `/tmp/shin-wallslice`; other defaults are identical. `/config/config.json`, when present, **replaces the complete defaults**. Include every setting. Unknown keys, missing settings, invalid values, malformed JSON, unreadable files, and startup failures produce clear errors and a nonzero exit. Restart to apply changes. Environment variables do not configure the application.

| Setting               | Meaning and validation                                                                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `host`                | Nonempty bind address; use `0.0.0.0` for container IPv4 port mapping                                                                                              |
| `port`                | Integer 1–65535; must be available and permitted for the runtime user                                                                                             |
| `logLevel`            | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, or `silent`                                                                                                   |
| `dataDirectory`       | Nonempty writable path; stores only `preferences.json`, replaced atomically                                                                                       |
| `temporaryDirectory`  | Nonempty writable **dedicated application directory**, separate from the data directory; restart deletes its `wallslice-*` directories, including crash leftovers |
| `memoryBudgetMiB`     | Integer 1024–3072; processing memory planning budget, default 2048 MiB for a deployment with 4 GiB available                                                      |
| `temporaryStorageMiB` | Integer 1024–65536; conservative storage reservation budget, default 4096 MiB; must cover at least one complete job                                               |
| `jobTtlMinutes`       | Integer 1–1440; idle lifetime, default 30 minutes                                                                                                                 |
| `maxJobs`             | Integer 1–16; upper bound on temporary jobs, further reduced by the storage budget                                                                                |

Explicit local configuration:

```sh
pnpm --filter @shin-wallslice/server start --config /absolute/path/config.json
```

The explicit file takes precedence and must exist. Relative paths in JSON resolve against the process working directory.

### Memory and temporary storage

The default decoded limit is **55,924,053 pixels** (about 56 MP), allowing both 7680×4320 and 8192×4320 sources with all six devices. Orientation is normalized once before calculating crop coordinates. Only still JPEG, PNG, and WebP are accepted; animated images are rejected.

The decoded limit is `(memoryBudgetMiB - 768) × 1048576 / 24`, rounded down. This reserves 24 bytes per source pixel for decode, orientation, entropy and resizing buffers, plus 768 MiB for upload data, output buffers, ZIP assembly, and process overhead. The upload byte limit is one quarter of the memory budget (512 MiB by default), protecting the buffered upload stage without imposing a small arbitrary file limit. Metadata is inspected with Sharp's decoded-pixel limit before decoding. Image processing and ZIP creation run one operation at a time; additional work receives a retryable busy error. Sharp caching is disabled and its processing concurrency is one. The default is intended for **4 GiB of available application memory**; the planning setting is not an OS-enforced memory ceiling. Apply a container memory limit for deployment enforcement.

Storage admission reserves the upload allowance, eight bytes per maximum source pixel, ten bytes per output pixel across the catalog, and 16 MiB overhead per job. The effective job capacity is the smaller of `maxJobs` and the number of reservations that fit in `temporaryStorageMiB` (three jobs with defaults). This pessimistic reservation covers normalized source PNGs, generated PNGs, and ZIP working space. Actual disk consumption is usually much lower. Provide at least the configured free storage; filesystem-full errors remain retryable. No unbounded render history is kept: each generation invalidates and deletes previous outputs before replacing them. Old URLs fail clearly instead of returning stale or incomplete files.

Start over deletes the job immediately. Idle jobs are removed by a 30-second sweep after their configured lifetime; active image operations finish before cleanup. Expired jobs cannot be used. Shutdown removes the process's jobs; restart removes crash leftovers. Do not share the dedicated temporary directory between multiple running instances. Do not place unrelated files in its `wallslice-*` subdirectories. Preferences are retained separately.

## Docker / home NAS deployment

```sh
docker build -t shin-wallslice:local .
docker run --rm --name shin-wallslice --memory=4g -p 8080:3000 \
  --mount type=volume,src=shin-wallslice-data,dst=/data \
  shin-wallslice:local
```

Open [localhost:8080](http://localhost:8080). The single image uses Node.js 24 LTS and the non-root `node` user (UID/GID **1000**), with one exposed port. The built-in health check reads the effective JSON configuration. `/data` contains persistent flat-file preferences; mount a volume or a NAS share there to retain preferences across container replacement. Bind-mounted directories must be writable and traversable by UID/GID 1000 (for example, set ownership to `1000:1000` on the dedicated directory). Preference read/write failures appear in the interface with a retry action. Temporary storage must also be writable; `/tmp/shin-wallslice` is ephemeral by default. Budget at least 4 GiB of free temporary disk with the defaults.

To replace configuration, copy `config/docker.json` to `config.local.json`, edit it, then mount it read-only:

```sh
docker run --rm --name shin-wallslice --memory=4g -p 8080:3000 \
  --mount type=volume,src=shin-wallslice-data,dst=/data \
  --mount type=bind,src="$(pwd)/config.local.json",dst=/config/config.json,readonly \
  shin-wallslice:local
```

The config must be readable by UID 1000 (for example mode 0644) and parent directories traversable. The application never writes to `/config`. If you change the configured port, update the container port mapping accordingly. `EXPOSE 3000` is metadata and does not override JSON.

Build and exercise both supported architectures using Docker Buildx with emulation available:

```sh
docker buildx build --platform linux/amd64 --load -t shin-wallslice:amd64 .
pnpm docker:smoke shin-wallslice:amd64
docker buildx build --platform linux/arm64 --load -t shin-wallslice:arm64 .
pnpm docker:smoke shin-wallslice:arm64
```

The smoke script runs memory-limited containers, checks HTML/assets, non-root identity, health, configuration replacement and invalid configuration. It completes both 8K workflows with all six presets and OLEDify, verifies exact PNG sizes, cutoff pixels, matching ZIP entries, job disposal, and flat-file preferences. It cleans up containers and fixtures. Temporary fixture paths must be shared with the container engine. To rerun only startup, assets, non-root identity, and configuration checks after a harness or deployment change, append `--configuration-only` after the engine argument (for example, `pnpm docker:smoke shin-wallslice:amd64 podman --configuration-only`). The default smoke run always includes both full 8K workflows.

Podman is also supported; on macOS start your Podman machine first and put `/opt/podman/bin` on PATH:

```sh
podman build --format docker --platform linux/arm64 -t shin-wallslice:arm64 .
pnpm docker:smoke shin-wallslice:arm64 podman
podman build --format docker --platform linux/amd64 -t shin-wallslice:amd64 .
pnpm docker:smoke shin-wallslice:amd64 podman
```

`--format docker` preserves the health check. Host temporary directories must be shared into the VM; set `TMPDIR` to a shared directory if necessary. Publishing images and an Unraid Community Apps template are outside this release.

## Bundled device catalog

`packages/server/src/devices.json` defines stable IDs, display names, and pixel dimensions. The initial six match `specs/v0.2.0.md`; tablet outputs are square. Add a unique lowercase hyphenated ID, name, and positive integer dimensions, then rebuild/release. The same selection, crop, preview, naming and export logic handles every preset. Individual dimensions are capped at 16384 pixels; the catalog must also fit the configured processing/storage budgets. The catalog is repository-managed and cannot be overridden by runtime configuration.
