# shin-wallslice

One wallpaper for all your screens. Version 0.2.0 accepts a JPEG, PNG, or WebP, offers independent fixed-size crop positioning for six bundled devices, and exports lossless PNGs individually or together in a ZIP. Lit and Web Awesome provide the interface; Fastify and Sharp process images locally. No accounts, database, external AI service, or other container is required.

## Using the workflow

1. Drop one image, paste an image from the clipboard, or choose a file.
2. Select output devices. Smart (AI) frames the main subject when AI is enabled; Smart (entropy) uses local image entropy separately for each device. The five anchors position all selected crops together. Drag any crop independently, or focus its boundary and use arrow keys (Shift moves 10 pixels). Reset position restores that device to the current global method. Crops have fixed size and never leave the source. Softness warnings indicate upscaling.
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

Runtime settings load from bundled JSON defaults, one optional partial JSON override, then application-specific environment variables. The local `config/default.json` is:

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
  "maxJobs": 4,
  "ai": { "enabled": false }
}
```

Docker bundles `config/docker.json` as its defaults, with `dataDirectory` set to `/data` and `temporaryDirectory` set to `/tmp/shin-wallslice`; other defaults are identical.

Select exactly one override file in this order: explicit `--config`, `/config/config.json`, then repository-root `config/local.json`. Automatic discovery is independent of the server working directory for both `pnpm dev` and `pnpm start`. Missing automatic files fall back to the next source or defaults; a missing explicit file fails. An unreadable or malformed selected file fails without fallback. Alternative files are never combined.

JSON files now **partially override** defaults. Existing complete files still work; when migrating, remove unchanged fields if desired. Nested `ai` fields merge individually, so a JSON token alone preserves default AI enablement and a configured endpoint/model. Unknown settings and invalid supplied values fail startup even if an environment override would replace them. AI endpoint/model requirements are checked on the effective configuration. Diagnostics omit supplied values and credentials.

Copy `config/local.example.json` to `config/local.json`, choose your endpoint/model, and enter a private token. The local file is ignored by Git and excluded from Docker context/images. Existing `.env` files are also excluded; dotenv files are **not automatically loaded**. Configuration files are read-only to the application. Relative configured paths still resolve against the process working directory. Restart to apply changes; there is no settings editor or configuration persistence.

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

### Environment variables

Only the following `SHIN_WALLSLICE_` variables configure the application. Each supplied variable overrides its JSON field and preserves sibling fields. Unset variables preserve lower-priority values.

| Setting               | Environment variable                   | Parsing                                                                     |
| --------------------- | -------------------------------------- | --------------------------------------------------------------------------- |
| `host`                | `SHIN_WALLSLICE_HOST`                  | Nonempty string                                                             |
| `port`                | `SHIN_WALLSLICE_PORT`                  | Integer 1–65535                                                             |
| `logLevel`            | `SHIN_WALLSLICE_LOG_LEVEL`             | Exact lowercase level listed above                                          |
| `dataDirectory`       | `SHIN_WALLSLICE_DATA_DIRECTORY`        | Nonempty path                                                               |
| `temporaryDirectory`  | `SHIN_WALLSLICE_TEMPORARY_DIRECTORY`   | Nonempty path                                                               |
| `memoryBudgetMiB`     | `SHIN_WALLSLICE_MEMORY_BUDGET_MIB`     | Integer 1024–3072                                                           |
| `temporaryStorageMiB` | `SHIN_WALLSLICE_TEMPORARY_STORAGE_MIB` | Integer 1024–65536                                                          |
| `jobTtlMinutes`       | `SHIN_WALLSLICE_JOB_TTL_MINUTES`       | Integer 1–1440                                                              |
| `maxJobs`             | `SHIN_WALLSLICE_MAX_JOBS`              | Integer 1–16                                                                |
| `ai.enabled`          | `SHIN_WALLSLICE_AI_ENABLED`            | Exactly `true` or `false`                                                   |
| `ai.baseUrl`          | `SHIN_WALLSLICE_AI_BASE_URL`           | HTTP(S) URL without credentials, query, fragment, or surrounding whitespace |
| `ai.model`            | `SHIN_WALLSLICE_AI_MODEL`              | Nonempty string                                                             |
| `ai.token`            | `SHIN_WALLSLICE_AI_TOKEN`              | String without line breaks; empty clears the optional bearer token          |

Integers accept only unsigned decimal digits with no whitespace, sign, leading zeros (except `0`), exponent, fraction, or hex notation, and must satisfy their ranges. Strings are used as supplied; whitespace-only strings are invalid except for the token. Empty values are invalid for every type except `ai.token`. Boolean values are case-sensitive. Invalid input fails startup with a nonzero exit. Environment `SHIN_WALLSLICE_AI_ENABLED=false` prevents AI requests even when JSON enables AI. Local and container starts share these rules. Unrelated environment variables have no effect.

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

Open [localhost:8080](http://localhost:8080). The single image uses Node.js 24 LTS and the non-root `node` user (UID/GID **1000**), with one exposed port. The built-in health check reads the effective environment-aware configuration. `/data` contains persistent flat-file preferences; mount a volume or a NAS share there to retain preferences across container replacement. Bind-mounted directories must be writable and traversable by UID/GID 1000 (for example, set ownership to `1000:1000` on the dedicated directory). Preference read/write failures appear in the interface with a retry action. Temporary storage must also be writable; `/tmp/shin-wallslice` is ephemeral by default. Budget at least 4 GiB of free temporary disk with the defaults.

To override configuration, copy `config/local.example.json` to ignored `config/local.json`, edit the needed fields, then mount it read-only:

```sh
docker run --rm --name shin-wallslice --memory=4g -p 8080:3000 \
  --mount type=volume,src=shin-wallslice-data,dst=/data \
  --mount type=bind,src="$(pwd)/config/local.json",dst=/config/config.json,readonly \
  shin-wallslice:local
```

The config must be readable by UID 1000 (for example mode 0644) and parent directories traversable. The application never writes to `/config`. If you change the configured port, update the container port mapping accordingly. `EXPOSE 3000` is metadata and does not override effective configuration.

For Docker or NAS container settings, configure AI entirely through environment variables (placeholder credentials below). Map the effective container port and restart after changing settings:

```sh
docker run --rm --name shin-wallslice --memory=4g -p 8080:3456 \
  --mount type=volume,src=shin-wallslice-data,dst=/data \
  -e SHIN_WALLSLICE_HOST=0.0.0.0 \
  -e SHIN_WALLSLICE_PORT=3456 \
  -e SHIN_WALLSLICE_AI_ENABLED=true \
  -e SHIN_WALLSLICE_AI_BASE_URL=https://api.openai.com/v1 \
  -e SHIN_WALLSLICE_AI_MODEL=your-vision-capable-model \
  -e SHIN_WALLSLICE_AI_TOKEN=replace-with-your-private-token \
  shin-wallslice:local
```

In Unraid or another NAS UI, add these names as container environment variables and enter the corresponding values. An environment token can also accompany a JSON endpoint/model. Environment variables keep keys out of tracked configuration, but users with access to container configuration can read them; they are not a secret vault. Avoid putting real credentials in shared command history. The server never writes credentials to preferences or other managed persistent data, client assets, API/health responses, logs, or diagnostics.

Build and exercise both supported architectures using Docker Buildx with emulation available:

```sh
docker buildx build --platform linux/amd64 --load -t shin-wallslice:amd64 .
pnpm docker:smoke shin-wallslice:amd64
docker buildx build --platform linux/arm64 --load -t shin-wallslice:arm64 .
pnpm docker:smoke shin-wallslice:arm64
```

The smoke script runs memory-limited containers, checks HTML/assets, non-root identity, health, partial JSON overrides, environment-only AI authentication, overridden-port health and invalid configuration. It completes both 8K workflows with all six presets and OLEDify, verifies exact PNG sizes, cutoff pixels, matching ZIP entries, job disposal, and flat-file preferences. It cleans up containers and fixtures. Temporary fixture paths must be shared with the container engine. To rerun only startup, assets, non-root identity, and configuration checks after a harness or deployment change, append `--configuration-only` after the engine argument (for example, `pnpm docker:smoke shin-wallslice:amd64 podman --configuration-only`). The default smoke run always includes both full 8K workflows.

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

## Optional AI naming and subject detection

AI is disabled by default (`"ai": { "enabled": false }`). Older complete JSON
configurations without `ai` remain valid and make no AI requests. To enable it,
add this object to your private partial runtime JSON configuration:

```json
"ai": {
  "enabled": true,
  "baseUrl": "https://api.openai.com/v1",
  "model": "your-vision-capable-model",
  "token": "your-api-token"
}
```

`baseUrl` is the API root: the server appends `/chat/completions` (for example,
`http://nas-host:1234/v1` becomes `http://nas-host:1234/v1/chat/completions`).
HTTP is supported for local self-hosted services. URLs cannot contain credentials,
query strings, or fragments. `model` must identify a model that accepts image input
through Chat Completions; compatibility with that API does not imply support for
provider-specific APIs. `token` is optional for services without authentication;
when supplied it is used as a server-side bearer token. Use the partial JSON file
mounted read-only at `/config/config.json` in Docker as described above, then
restart to apply changes. No credentials or connection settings are sent to the
browser. Service availability is checked only after accepted uploads, so an unavailable
service never prevents startup or local processing.

**Enabling AI automatically sends an image representation to your configured
service after every accepted upload**, including drag-and-drop and clipboard
images. Naming and subject detection independently use the same full oriented source before crops or OLEDify, resized
without enlargement to fit 1024 × 1024 pixels, flattened onto white, and encoded as
JPEG at quality 80 (at most 2 MiB). Preparation has a 30-second Sharp processing timeout and runs within the existing exclusive
image-processing stage and decoded-pixel limit; only this small representation is
retained in each temporary job for Retry. Image text is treated as content rather
than instructions. Naming aims for about three meaningful words and includes a
recognizable show/game title only when identifiable; recognition is best effort.

Requests have a 30-second total timeout and a 64 KiB response limit. Redirects
are rejected to avoid forwarding credentials to another endpoint. There are no
automatic retries. Pending or failed naming never blocks local processing, name
editing, navigation, or downloads. Retry starts another request only after failure,
with at most one naming request per job. A suggestion replaces the filename default
(or clipboard `wallpaper` fallback) only if the name field has never been edited,
even if an edit cleared it or restored its original value. Download uses the name
current when clicked. Failed naming retains the current name and offers Retry;
upstream error details and credentials are not exposed.

Start over, expiry, and shutdown cancel outstanding AI work. Abandoned requests
are bounded by the timeout and existing job capacity; reload starts a fresh workflow
and cannot apply an old result. Suggestions and representations are temporary,
share the job lifecycle, and are never persisted or restored after reload/restart.

### Smart crop methods

AI is optional. First use selects **Smart (AI)** when enabled and **Smart
(entropy)** otherwise. Legacy saved Smart preferences migrate the same way;
anchors retain their selection. The resolved preference is saved in the existing
flat-file preferences. Explicit AI, entropy, and anchor selections survive Back,
Start over, new images, reloads, and restarts with persistent data. Explicit entropy
stays entropy when AI is enabled. With AI disabled the AI choice is unavailable;
a saved AI selection resolves to entropy, and no service requests are made.

Every accepted upload automatically starts one subject-detection task as well as
naming, regardless of the crop method selected. Rejected uploads start neither.
Detection uses the configured vision model and connection with the same optional
bearer token, 30-second request timeout, 64 KiB response bound, and redirect
protection described above. It analyzes the bounded full oriented representation,
not a device crop or OLEDified output. Normalized bounds map directly to the
oriented source dimensions, avoiding distortion from rounded representation sizes.
Image preparation uses the existing decoded-pixel budget and exclusive processing
stage; each job retains at most one shared JPEG of at most 2 MiB for both tasks.

Detection asks for the main subject's bounds, including a coherent group when
appropriate, or an explicit no-clear-subject response for abstract patterns.
Validated bounds frame each fixed-size device crop within source limits. Crops
contain the full subject or group when it fits. For tighter crops, detection also
identifies an optional focal region, such as the entire face/head for a person or
important details across a group. For prominent people or illustrated characters,
held weapons/equipment and nearby props are secondary to the person and face; a
standalone object can still be the main subject in an object-focused image. Framing prioritizes that region while preserving
as much of the remaining subject as possible. Without a clear focal region, it
centers the subject bounds. Focal bounds must lie within the subject bounds. Recognition and framing are
best effort; manual adjustment remains available.

Processing opens while detection runs, using entropy previews. A visible status
explains pending previews or a service failure. Progress messages disappear when
work completes successfully. A no-clear-subject result is explained beside the crop
method instead of in a persistent toast. Detection never blocks positioning, navigation, name editing, or downloads.
Late results update only untouched selected crops while AI is active. Any manual
positioning counts as an edit even if it returns to the original location. Changing
the global method resets selected positions; Reset position restores only its device
and makes it eligible for a pending result. New devices use the current method.
Changes regenerate matching previews and exports; downloads wait for those outputs.
A download already initiated retains its framing.

No clear subject uses per-device entropy crops with an explanation. Connection,
authentication, rate-limit, vision, timeout, preparation, and invalid-response
failures also use entropy for eligible crops, with a nonblocking message and
**Retry subject detection**. Manual edits and the saved AI preference remain intact.
Retry starts only one concurrent detection attempt and never restarts naming;
there is no automatic retry loop. A failed preparation can be attempted again.
Naming and detection succeed or fail independently. Results are reused across
devices, method changes, resets, OLEDify, navigation, and downloads. They share the
temporary-job lifecycle, are cancelled or bounded when abandoned, and are not
persisted across reloads or restarts. Credentials and upstream error bodies are
never included in detection status or diagnostics.
