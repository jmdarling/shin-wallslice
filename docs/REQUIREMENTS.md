# shin-wallslice — Requirements

> Status: **v1 requirements, all open questions resolved** (see §13). Captured 2026-10-19. v1 implementation in progress (see §14).
> Items marked **[FUTURE]** are out of scope for v1 but must not be designed out.

## 1. Vision

shin-wallslice **form-fits wallpapers to devices**. A user drops in one wallpaper (for example, one downloaded from the internet) and picks one or more target devices, such as an iPhone 18 Pro Max, a 2020 M1 MacBook Air, and an 11" M5 iPad Pro. shin-wallslice then produces one wallpaper per device at that device's exact resolution, intelligently cropped so **the subject of the image stays centered and intact**.

It should be **correct the first time**. Manual adjustment is available but should rarely be needed.

### 1.1 Lineage

shin-wallslice is a ground-up rewrite. It takes ideas from, but shares no code with:

| Project                                | Takeaways                                                                                                                 | Departures                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `wallslice` (Bun, CLI)                 | JSON-per-device catalog with a JSON Schema                                                                                | Bun runtime, CLI-first                                                                  |
| `wallslice-again` (Node, Express, Vue) | sharp pipeline, square output for rotating tablets, AI naming, Docker/Unraid packaging, `<output>/<device>/<name>` layout | CLI-first, Express, Vue, OpenAI-only naming, sharp `attention` as the only "smart" crop |

shin-wallslice is **GUI-first**. A CLI with "watch" / unattended mode is planned for a later version (§12).

### 1.2 Users and context

- **Single user**, self-hosted on a home server or NAS (e.g. Unraid), reached over the LAN in a browser on desktop or mobile.
- No accounts, no multi-tenancy, no authentication in v1.
- No user-specific persisted customizations in v1 (§5.3).

## 2. Glossary

| Term            | Meaning                                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Source**      | The single input wallpaper image for the current session.                                                            |
| **Device**      | A named target with a native screen resolution and metadata (§5).                                                    |
| **Target**      | A device selected for the current session, plus any per-target overrides.                                            |
| **Output size** | The pixel size actually written for a target. Equals the device resolution, or a square for rotating devices (§5.2). |
| **Subject**     | The visually important region of the source: a bounding box, a weighted focal point, and a confidence score (§6).    |
| **Crop rect**   | The rectangle of the source, in source pixel coordinates, that is resized to the output size.                        |
| **Export**      | Rendering the final images server-side and delivering them (§8).                                                     |

## 3. Scope summary (v1)

**In scope**

- Web UI: single page with live previews (§7).
- One source image at a time.
- Inputs: JPEG, PNG, WebP, AVIF via file picker or drag-and-drop, clipboard paste, or pasted URL (§4).
- Built-in device catalog shipped as JSON in the repo, plus ad-hoc custom W×H for the session (§5).
- **Local-only** automatic subject detection: ONNX saliency model, ONNX face detector, and a sharp heuristic fallback (§6).
- Automatic crop computation per target, with optional global and per-target manual overrides (§6.4).
- Upscaling with a visible warning when the source is too small (§6.5).
- PNG output with simple names, plus optional AI-suggested names the user can edit (§8.3).
- Delivery: per-image download, ZIP download, Web Share API, and write to a mounted output volume (§8).
- Single Docker image (multi-arch amd64 and arm64) with PUID/PGID support and an Unraid template (§10).

**Out of scope for v1**: listed in §12.

## 4. Input

### 4.1 Accepted sources

| Method                      | Notes                              |
| --------------------------- | ---------------------------------- |
| File picker / drag-and-drop | Anywhere on the page.              |
| Clipboard paste             | `Ctrl/Cmd+V` of image data.        |
| Paste URL                   | The server fetches the URL (§4.3). |

### 4.2 Formats and limits

- Formats: **JPEG, PNG, WebP, AVIF**. HEIC/HEIF is **not** supported in v1.
- Apply EXIF orientation on ingest. Strip EXIF metadata from outputs.
- Normalize color to sRGB. Preserve embedded ICC profiles on decode.
- Animated inputs (animated WebP/PNG): use the first frame.
- Default limits, configurable by env: **max 100 MB upload**, **max ~50 megapixels decoded** (sharp `limitInputPixels`). Over-limit input is rejected with a clear error. Tiled processing for 100 MP+ is [FUTURE].
- Transparent PNGs are allowed. Flatten onto black for export unless the output format supports alpha (PNG does, so alpha is preserved).

### 4.3 URL fetch rules

- `http`/`https` only. Follow at most 5 redirects. 30 s timeout. Same size and pixel limits as uploads.
- Content type is verified by sniffing the decoded bytes, not by trusting headers.
- SSRF hardening even on a LAN tool: by default, refuse loopback, link-local (incl. `169.254.169.254`), and the container's own address. Private LAN ranges are **allowed** by default (fetching from a NAS is a valid use) and can be turned off by env.

## 5. Devices

### 5.1 Device catalog

- The built-in catalog is **JSON files in the repository**, one file per device, validated against a JSON Schema at build time (lint) and at server startup (fail fast).
- New permanent devices are added by PR. There is no in-app device editor.
- Proposed device record:

```jsonc
{
  "$schema": "../schema/device.schema.json",
  "id": "apple-ipad-pro-11-m5", // stable slug, unique; used in filenames/folders
  "name": "iPad Pro 11-inch (M5)",
  "brand": "Apple",
  "category": "tablet", // phone | tablet | laptop | desktop | monitor | other
  "year": 2025,
  "resolution": { "width": 1668, "height": 2420 }, // native panel pixels, portrait-natural for phones/tablets
  "rotates": true, // optional; defaults by category (§5.2)
  "aliases": ["ipad pro 11 m5"], // optional; search terms
  "source": "https://www.apple.com/ipad-pro/specs/", // optional; spec citation
}
```

- The UI groups devices by **category**, then **brand**. It supports search by name, brand, year, and alias.
- **Launch catalog** (each resolution must be taken from the manufacturer's official spec page, and that source URL recorded in a `source` field in the device file):
  - **Carried over**: MacBook Air M1 2020 (2560×1600), iPhone 16 Pro (1206×2622), iPad Pro 11" M5 (1668×2420), iPad Pro 12.9" 3rd gen, and generic FHD / WQHD / 4K.
  - **iPhone 18 Pro Max: 1320×2868** (6.9", 460 ppi, per Apple's spec page).
  - **Current Apple lineup**: all current iPhone, iPad, MacBook Air, MacBook Pro, iMac, and Studio Display models.
  - **Generic monitors**: FHD 1920×1080, QHD 2560×1440, 4K 3840×2160, 5K 5120×2880, 6K 6016×3384, 8K 7680×4320, ultrawide 3440×1440, super-ultrawide 5120×1440.
  - **Popular Android**: current Google Pixel and Samsung Galaxy S flagships, plus current Galaxy Z Fold (both displays as separate devices; the inner display has `rotates: true`).
- Device files gain an optional `source` (URL) field for the spec citation.
- **Shipped launch catalog (30 devices).** Omitted until reliable specs are found (sources disagreed or none were found): Galaxy Z Fold 8 (cover + inner), Pixel 11 Pro Fold, base Pixel 11, iPhone 17e, MacBook (A18 Pro / "Neo"), iMac 24". Apple and Samsung spec pages could not be fetched directly from the build environment, so some `source` fields cite reputable third-party spec listings (Macworld, Engadget, DPReview, Wikipedia, iosref). **Re-verify these against manufacturer pages and update the `source` URLs.**

### 5.2 Rotating devices → square output

Devices used in **both orientations** (tablets) get a **square** output size of `max(width, height)` on each side. The wallpaper then looks right in portrait and landscape. Example: iPad Pro 11" M5 (1668×2420) → **2420×2420**.

- `rotates` defaults to `true` for `tablet` and `false` for every other category. It can be overridden per device in the catalog.
- Phones and laptops, whose orientation is effectively fixed, use their native aspect ratio.
- For a square output, the subject should sit inside the **central region visible in both orientations**, i.e. the intersection of the portrait and landscape windows. In practice, centering the subject in the square handles this. The preview should be able to show the portrait and landscape visible windows as an overlay.

### 5.3 Custom (ad-hoc) devices

- The user can add a **custom target** by typing a width × height (with an optional label and a "rotates → square" toggle) for the current session.
- Custom targets are **not** stored server-side. The UI may remember recent custom sizes and the last-used device selection in browser `localStorage` (a convenience only).
- Validation: integers from 16 to 16384 px per side.

## 6. Subject detection and crop algorithm

### 6.1 Goals

1. The subject is **centered** in every crop and, where the aspect ratio allows, **fully contained**.
2. Results are **deterministic** for the same input and settings.
3. Detection runs **once per source**. Crops for all targets derive from that single result, so adding a target is instant.

### 6.2 Detection pipeline (v1, local only)

Detection runs server-side on a downscaled working copy (e.g. longest side 1024 px):

1. **Salient-object segmentation (ONNX)**: a small salient-object / dichotomous-segmentation model **decided: ISNet `isnet-general-use`** from the DIS project produces a saliency mask.
2. **Face detection (ONNX)**: **decided: YuNet** from OpenCV Zoo. Faces raise the weight of their region and must be included in the subject box when present.
3. **Fusion**: threshold the mask, take the dominant connected component(s), and combine with face boxes. The output is:
   - `box`: subject bounding box (normalized 0–1 coordinates),
   - `focal`: saliency-weighted centroid (normalized), biased toward faces,
   - `confidence`: 0–1.
4. **Fallback**: if the models fail or confidence is below a threshold, fall back to sharp's `attention` strategy, then to image center. The method used is reported.

- Runtime: `onnxruntime-node` (CPU). Model files are **bundled into the image at build time**, with pinned versions and checksums. No network access is needed at runtime.
- **Licensing constraint**: only use models whose licenses permit redistribution in an MIT project (e.g. Apache-2.0, MIT). Avoid non-commercial weights (e.g. many InsightFace models).
  - **YuNet**: MIT (OpenCV Zoo: "All files in this directory are licensed under MIT License"). ✅
  - **ISNet**: the DIS code is Apache-2.0, but the repo **does not state a license for the pretrained weights**, which were trained on DIS5K (a dataset with its own terms of use). That is acceptable for this personal self-hosted tool. ⚠️ **Before publishing the image publicly on GHCR**, confirm redistribution terms with the authors, or download the weights at first container start instead of baking them into the image. Record this in `models/`.
  - ISNet adds about 170 MB to the image. Measured: ~2.2–2.4 s per image for ISNet + YuNet on CPU (24 MP-class source), within the §9.6 budget.
  - Swapping models later (e.g. U²-Netp for size, BiRefNet for quality) is a `SubjectDetector` change only.
- Code is organized behind a `SubjectDetector` interface so detectors can be swapped or combined. This is how [FUTURE] hybrid cloud-vision detection plugs in.

### 6.3 Crop computation (pure function)

For each target, given source size `S`, subject `{box, focal}`, and output size `O`:

1. **Base crop**: the largest rectangle with aspect `O.w/O.h` that fits in `S` (cover fit). This keeps as much of the image as possible.
2. **Position**: center the crop on the subject.
   - If the subject `box` fits inside the crop, center on the **box center**, nudged toward `focal`.
   - If it does not fit (e.g. a wide subject on a tall phone), center on `focal` and accept clipping.
3. **Clamp** to the source bounds.
4. **Zoom** (optional, per-target override only): a scale factor ≤ 1 relative to the base crop, kept around the same center.

- Crop math lives in a **shared, dependency-free package** used by both the server (export) and the browser (live preview), so the preview matches the export exactly.
- When the subject cannot fit, outpainting / generative fill is [FUTURE]. Letterboxing and blurred fill are **not** planned.

### 6.4 Manual overrides (optional)

Both levels are optional and never required for a good result.

- **Global subject override**: the user drags or resizes the subject box (and focal point) on the source. Every target recomputes from it.
- **Per-target override**: in a target's preview, the user drags to pan and scrolls or pinches to zoom that target's crop rect (aspect locked). A "reset to auto" control is always available.
- Per-target overrides take precedence over the global subject for that target only.
- Overrides last for the session only.

### 6.5 Upscaling

If a crop rect is smaller than the output size in either dimension:

- Upscale to the exact output size with a high-quality resampler (sharp `lanczos3`).
- Show a **visible warning** on that target ("Upscaled 1.8×, may look soft"), including the scale factor.
- No AI super-resolution in v1 ([FUTURE]).

### 6.6 Low confidence

When detection confidence is low or the fallback was used, flag the affected targets with a subtle "check this crop" hint. Never block export.

## 7. User interface

### 7.1 Principles

- **One page, live**: no wizard and no "jobs" concept visible to the user.
- Image-forward, minimal chrome.
- **Follows the system light/dark theme**, with a manual toggle stored in `localStorage`.
- Responsive. Usable on a phone (export with Web Share is a primary mobile use).
- Accessible: keyboard operable, visible focus, labelled controls, WCAG AA contrast.

### 7.2 Flow

1. **Empty state**: a large drop zone with "drop, paste, or enter a URL".
2. **Source loaded**: the source shows with the detected subject overlay (box + focal point; toggleable). Detection status and method are shown.
3. **Device picker**: searchable and grouped by category and brand, plus "Add custom size". The last selection is restored from `localStorage`.
4. **Preview grid**: one card per target, showing the live crop preview (rendered client-side from a downscaled proxy using the shared crop math), the device name, the output size, and any warnings (upscaled, low confidence, square/rotating overlay). Cards support per-target pan and zoom (§6.4).
5. **Naming**: a single base name field (§8.3), with the AI suggestion shown when available.
6. **Export bar**: Download ZIP · Save to output folder (shown only when configured) · Share (shown only when the Web Share API with files is supported) · per-card download.

### 7.3 Frontend architecture

- **Lit 3** custom elements, TypeScript strict, bundled with **Vite**.
- State: **`@lit-labs/signals`** (TC39 signals) for app state. `@lit/context` may be used for dependency injection where it helps.
- Styling: plain CSS with **custom properties** as design tokens (colors, spacing, radii) for light/dark. Shadow-DOM-scoped styles per component. **No CSS framework and no component library.**
- Previews render with `<canvas>` or CSS `object-view-box` / transforms over a single downscaled proxy image. No server round-trip per adjustment.

## 8. Output and delivery

### 8.1 Rendering

- Final images are rendered **server-side with sharp** from the full-resolution source, using the crop rects computed by the shared crop package.
- Format: **PNG** in v1 (lossless, alpha preserved). The format is modelled as a setting so JPEG, WebP, and AVIF can be added later without restructuring.
- Output is sRGB with EXIF stripped.

### 8.2 Delivery channels

| Channel            | Behaviour                                                                                                                                                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Per-image download | One button per target card.                                                                                                                                                                                                                                                                                        |
| ZIP download       | All targets in one ZIP, streamed. Inside the ZIP: `<device-id>/<name>.png`.                                                                                                                                                                                                                                        |
| Web Share API      | `navigator.share({ files })` where supported (iOS/Android to Photos, AirDrop, etc.). Hidden when unsupported.                                                                                                                                                                                                      |
| Output volume      | Writes to the mounted output directory (default `/output`) as `<output>/<device-id>/<name>.png`. Shown only when the directory is configured and writable. **On name collision, the existing file is overwritten**, which makes re-exporting while iterating painless. The UI states this next to the Save button. |

### 8.3 Naming

- Default base name: the sanitized source filename (or the URL's last path segment, or `pasted-image` for clipboard input).
- File name per target: `<base-name>.png` inside the device folder. For single-file downloads, `<base-name>_<device-id>_<W>x<H>.png`.
- **Optional AI-suggested name**: when a naming provider is configured (§9.3), the server asks a vision model for a short descriptive name (prefer about 3 words; include the subject, and franchise/character if recognizable), as `wallslice-again` did. The suggestion pre-fills the name field and the **user can always edit it**. Without a provider, the feature is hidden.
- Names are sanitized to filesystem-safe kebab-case and length-limited.

## 9. Backend

### 9.1 Stack

- **Node.js 24 LTS**, TypeScript strict, ESM.
- **pnpm** workspaces.
- **Fastify** with JSON-Schema-validated routes (TypeBox schemas shared with the frontend where useful) and `@fastify/multipart`, `@fastify/static`, `@fastify/compress`.
- **sharp** for decode, resize, and encode. **onnxruntime-node** for detection.
- ZIP streaming: **`yazl`** (zero-dependency, streaming). PNG entries are _stored_, not re-deflated.

### 9.2 Persistence: no database

- **No database.** All state is either:
  - **in the repo** (device catalog JSON), or
  - **ephemeral** on disk under the data directory (default `/data`): uploaded sources, downscaled proxies, and cached detection results, keyed by a random session/source id.
- Ephemeral files expire (default **24 h** TTL, swept on startup and periodically).
- Configuration comes from **environment variables only** (no settings UI and no settings file in v1).

### 9.3 Configuration (env)

| Variable                                                  | Default                        | Purpose                                                                  |
| --------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------ |
| `PORT`                                                    | `3000`                         | HTTP port                                                                |
| `DATA_DIR`                                                | `/data`                        | Ephemeral working files                                                  |
| `OUTPUT_DIR`                                              | `/output`                      | Output volume; the feature is disabled if missing or unwritable          |
| `MAX_UPLOAD_MB`                                           | `100`                          | Upload limit                                                             |
| `MAX_INPUT_MEGAPIXELS`                                    | `50`                           | Decode limit                                                             |
| `TEMP_TTL_HOURS`                                          | `24`                           | Ephemeral file lifetime                                                  |
| `URL_FETCH_ALLOW_PRIVATE`                                 | `true`                         | Allow fetching from private LAN ranges                                   |
| `PUID` / `PGID`                                           | `99` / `100` (Unraid defaults) | Run-as user/group (§10)                                                  |
| `NAMING_PROVIDER`                                         | unset                          | `anthropic` \| `openai` \| `openai-compatible`; unset disables AI naming |
| `NAMING_MODEL`                                            | provider default               | Vision model id                                                          |
| `NAMING_BASE_URL`                                         | unset                          | For `openai-compatible` (Ollama, LM Studio, etc.)                        |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `NAMING_API_KEY` | unset                          | Credentials                                                              |
| `LOG_LEVEL`                                               | `info`                         | Fastify/pino log level                                                   |
| `HOST`                                                    | `0.0.0.0`                      | Bind address                                                             |
| `UMASK`                                                   | `022`                          | File creation mask (container entrypoint)                                |
| `WORK_CONCURRENCY`                                        | `2`                            | Concurrent sharp/ONNX jobs                                               |
| `MODELS_DIR` / `DEVICES_DIR` / `WEB_DIST_DIR`             | image paths                    | Locations of bundled models, catalog and web build                       |

### 9.4 AI naming adapter

- A `NameSuggester` interface with implementations for **Anthropic**, **OpenAI**, and **OpenAI-compatible** endpoints (covering local Ollama / LM Studio).
- It receives a small downscaled JPEG (e.g. ≤ 768 px), never the full original.
- 15 s timeout. Failure is non-fatal and falls back to the default name.
- Default models when `NAMING_MODEL` is unset: Anthropic `claude-opus-5-5` (low effort, server-side refusal fallback enabled); OpenAI `gpt-5-mini`. `openai-compatible` requires `NAMING_MODEL`.
- When enabled, a name is suggested automatically after each upload and can be re-requested with the "Suggest" button; the user can always edit it.
- The same adapter pattern will host the [FUTURE] cloud subject detector.

### 9.5 API

| Method & path                           | Purpose                                                                          |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| `GET /api/health`                       | Liveness and readiness (models loaded)                                           |
| `GET /api/config`                       | Feature flags for the UI (output volume available, naming enabled, limits)       |
| `GET /api/devices`                      | Device catalog                                                                   |
| `POST /api/sources`                     | Upload (multipart, field `file`). Returns `id`, dimensions, proxy URL, base name |
| `POST /api/sources/url`                 | `{ url }`: server fetches the image (§4.3). Same response as above               |
| `GET /api/sources/:id/proxy`            | Downscaled preview image                                                         |
| `GET /api/sources/:id/subject`          | Detection result (`box`, `focal`, `confidence`, `method`)                        |
| `POST /api/sources/:id/name-suggestion` | AI name (when enabled)                                                           |
| `POST /api/sources/:id/render`          | `{ targets[], name }` → single PNG or ZIP stream                                 |
| `POST /api/sources/:id/save`            | `{ targets[], name }` → write to the output volume, returns paths                |

`targets[]` carries the device id or custom size plus any overrides. **The server recomputes the crop rects with the shared crop package**: client-supplied rects are treated as overrides, not as trusted geometry.

### 9.6 Concurrency and performance

- Single-user, but requests can overlap. Limit concurrent sharp/ONNX work with a small in-process queue (e.g. a concurrency of 1–2) rather than a job system.
- Performance targets on a typical home server CPU, for a 24 MP source:
  - Detection: under 3 s.
  - Preview updates: instant (client-side).
  - Export of 5 targets: under 5 s.

## 10. Packaging and deployment

- **One Docker image, no companion containers.**
- Base: `node:24-bookworm-slim` (glibc, which both sharp and onnxruntime-node prebuilt binaries need). Multi-stage build: pnpm install, build web and server, prune to production deps, copy models.
- **Multi-arch: `linux/amd64` + `linux/arm64`**, built and published to **GHCR** via GitHub Actions (buildx).
- **PUID/PGID**: the entrypoint creates or adjusts a user to `PUID:PGID` and drops privileges (e.g. via `gosu`/`setpriv`) so files written to `/output` have the right NAS ownership.
- Volumes: `/data` (ephemeral, optional to persist) and `/output` (optional).
- `HEALTHCHECK` hits `/api/health`.
- Ship an **Unraid Community Applications template** (XML) and a `docker-compose.yml` example.
- Target image size: aim for **under 600 MB** with models. Measured: ~283 MB compressed / ~600 MB unpacked (amd64). Native binaries for other platforms (onnxruntime, musl sharp) are pruned at build time.
- The base image is a build arg (`NODE_IMAGE`, default `node:24-bookworm-slim`) so a Docker Hub mirror can be used when rate-limited.

## 11. Engineering standards

- TypeScript `strict` everywhere (plus `noUncheckedIndexedAccess`).
- **ESLint** (typescript-eslint, with lit and wc plugins for the UI) and **Prettier**, enforced in CI on every PR.
- CI (GitHub Actions): install, lint, typecheck, build, and Docker build (both arches on main/tags).
- **Unit tests for `packages/core` only, with Vitest**: crop math (cover fit, subject centering, clamping, zoom), the rotating→square rule, upscale-factor detection, and validation of the device catalog schema (every file in `devices/`). These run in CI. Server and UI tests are not required in v1.
- Conventional Commits.
- Repository layout (proposed):

```text
shin-wallslice/
  apps/
    server/          # Fastify API, detection, rendering, static hosting of web build
    web/             # Lit + Vite frontend
  packages/
    core/            # shared: crop math, types, device schema + loader (no Node/DOM deps in crop math)
  devices/           # device catalog JSON (one file per device) + schema
  models/            # model manifest (urls + checksums); binaries fetched at docker build, git-ignored
  docker/            # entrypoint, unraid template
  docs/              # REQUIREMENTS.md, ADRs
  AGENTS.md
  CLAUDE.md          # imports AGENTS.md
```

## 12. Future roadmap (not v1, but design for it)

| Item                                                                                                                      | Design hook in v1                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **CLI + watch / unattended mode**: watch a folder, auto-generate for preset devices                                       | Core pipeline (detect → crop → render) is UI-agnostic and lives in importable modules, not in route handlers |
| **Hybrid subject detection**: local + optional cloud vision model                                                         | `SubjectDetector` interface; provider adapter pattern from naming                                            |
| **AI outpainting** for subjects that don't fit                                                                            | Crop computation reports "subject clipped" per target                                                        |
| Batch (multiple sources)                                                                                                  | Source-id–scoped state; nothing global per "current image" on the server                                     |
| More output formats (JPEG, WebP, AVIF; HEIC)                                                                              | Format is a setting, not hard-coded                                                                          |
| HEIC/HEIF input                                                                                                           | Input decoding is isolated behind one function                                                               |
| Safe zones / UI overlays (clock, Dynamic Island, dock, menu bar)                                                          | Device schema is versioned and extensible                                                                    |
| Parallax / zoom margins                                                                                                   | Same                                                                                                         |
| Saved presets / custom devices persisted                                                                                  | Would require minimal JSON persistence in `/data`                                                            |
| AI super-resolution for upscaled targets                                                                                  | Upscale step isolated                                                                                        |
| Optional basic auth                                                                                                       | Fastify hook point                                                                                           |
| Large-image (100 MP+) tiled processing                                                                                    | Limits are configurable                                                                                      |
| Broader tests: server and API tests, Playwright E2E, golden-image crop fixtures (also useful for a future model bake-off) | Pure core package; `SubjectDetector` interface                                                               |

## 13. Decision log (formerly open questions)

| #   | Question                                            | Decision                                                                                                                       |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1   | iPhone 18 Pro Max resolution and the launch catalog | 1320×2868 (Apple spec page). Catalog = carried-over devices + current Apple lineup + generic monitors + popular Android (§5.1) |
| 2   | Detection models                                    | ISNet `isnet-general-use` + YuNet, no bake-off. ISNet weight license caveat noted (§6.2)                                       |
| 3   | Output-volume collision policy                      | Overwrite                                                                                                                      |
| 4   | Tests in v1                                         | Vitest unit tests for `packages/core` only                                                                                     |
| 5   | ZIP library                                         | `yazl`                                                                                                                         |
| 6   | Default port                                        | 3000                                                                                                                           |

## 14. Implementation status

| Area                                                                                                                                                                                                        | Status                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `packages/core` (crop math, devices, naming, catalog validation) + Vitest                                                                                                                                   | ✅ Done                                                     |
| Device catalog (30 devices)                                                                                                                                                                                 | ✅ Done (see §5.1 for omissions and source re-verification) |
| Server: ingest (upload / URL with SSRF guards), proxy, detection (ISNet + YuNet + attention fallback), render, ZIP, save, AI naming adapters                                                                | ✅ Done                                                     |
| Web UI: drop / paste / URL, subject overlay with manual box, device picker + custom sizes, live canvas previews with pan / zoom / orientation guides, warnings, download / ZIP / save / share, light / dark | ✅ Done                                                     |
| Docker image (PUID/PGID, health check), compose example, Unraid template, CI (lint, format, typecheck, test, build, multi-arch GHCR publish)                                                                | ✅ Done; multi-arch publish runs in GitHub Actions          |
| Re-verify device spec sources against manufacturer pages; add omitted devices                                                                                                                               | ⏳ Follow-up                                                |
| ISNet weight redistribution terms (before publishing the image publicly)                                                                                                                                    | ⏳ Follow-up (§6.2)                                         |
