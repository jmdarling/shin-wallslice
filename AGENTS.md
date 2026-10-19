# AGENTS.md

Guidance for AI coding agents (and humans) working in this repository. This file follows the open [AGENTS.md](https://agents.md) convention. `CLAUDE.md` simply imports it.

## Project

**shin-wallslice** form-fits wallpapers to devices. A user drops in one image and picks target devices. The app detects the subject locally and outputs one wallpaper per device at the exact resolution, with the subject centered. It is a GUI-first, single-user, self-hosted tool that ships as one Docker container.

- **The source of truth for scope and behaviour is [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md).** Read it before making non-trivial changes. If a change conflicts with it, update the requirements in the same PR (or ask), and never silently diverge.
- Status: requirements captured, implementation not started.
- `wallslice` and `wallslice-again` are older sibling projects, kept for **reference only**. Do not copy code from them wholesale or add dependencies on them.

## Stack (decided, do not swap without discussion)

| Concern | Choice |
|---|---|
| Runtime | Node.js 24 LTS, ESM, TypeScript `strict` |
| Package manager | **pnpm** workspaces (never npm/yarn/bun lockfiles) |
| Server | **Fastify** (not Express/Hono) |
| Frontend | **Lit 3** custom elements + **Vite**, state via `@lit-labs/signals` |
| Styling | Plain CSS + custom properties (design tokens), light/dark via `prefers-color-scheme` + toggle. No CSS frameworks or component libraries |
| Images | **sharp** |
| Subject detection | **onnxruntime-node** with bundled models, local only in v1 |
| Persistence | **None.** No database. Device catalog = JSON in repo; ephemeral files under `DATA_DIR`; config = env vars |
| Packaging | Single Docker image, `node:24-bookworm-slim`, multi-arch amd64 + arm64, PUID/PGID |
| Quality | ESLint (typescript-eslint) + Prettier, enforced in CI |

Ask the user before introducing a new runtime dependency that is large, native, or overlaps an existing choice.

## Layout (planned)

```text
apps/server     Fastify API, detection, rendering, serves the built web app
apps/web        Lit + Vite UI
packages/core   Shared pure logic: crop math, types, device schema/loader
devices/        Device catalog: one JSON file per device + JSON Schema
models/         Model manifest (URLs + checksums); binaries are fetched at build, not committed
docker/         Entrypoint, Unraid template
docs/           REQUIREMENTS.md, ADRs (docs/adr/NNNN-title.md)
```

## Commands (once scaffolded)

```sh
pnpm install
pnpm dev          # server + web in watch mode
pnpm lint         # eslint
pnpm format       # prettier --write
pnpm typecheck    # tsc --noEmit across workspaces
pnpm build
docker build -t shin-wallslice .
```

Before declaring work done, run `pnpm lint && pnpm typecheck && pnpm build` and make sure they pass.

## Architecture rules

1. **The crop math is pure and shared.** `packages/core` crop functions take plain numbers/objects and have no Node or DOM imports. The browser uses them for live previews and the server for export, so the two must stay identical. The server always recomputes crops; it never trusts client-sent geometry beyond explicit overrides.
2. **The pipeline is UI-agnostic.** Detect → crop → render lives in importable modules, not inside Fastify route handlers. A future CLI/watch mode must be able to call it directly.
3. **Pluggable providers.** Subject detection sits behind a `SubjectDetector` interface and AI naming behind a `NameSuggester` interface (Anthropic / OpenAI / OpenAI-compatible). Never call a vendor SDK outside its adapter.
4. **Local-first.** v1 must work fully offline. Cloud calls (naming only) are optional, env-gated, time-limited, and non-fatal.
5. **No hidden state.** Nothing user-specific is persisted server-side. Browser `localStorage` is for UI conveniences only.
6. **Device data is validated.** Every file in `devices/` must pass the JSON Schema. The server refuses to start on an invalid catalog. Tablets (`rotates: true`) output a square of `max(w, h)`.
7. **Model licensing.** Only bundle model weights whose licenses allow redistribution in an MIT project. Record each model's source, version, license, and checksum in `models/`.

## Conventions

- TypeScript `strict` + `noUncheckedIndexedAccess`. No `any` without a justifying comment.
- ESM only. Use `node:` prefixes for built-ins.
- Lit components: one element per file, tag names prefixed `sw-` (e.g. `sw-device-picker`), file name matches the tag (`sw-device-picker.ts`). Use reactive properties for inputs, events for outputs (`sw-` prefixed custom events), and signals for shared app state.
- CSS: use tokens (`--sw-*`) only, with no raw colors in components. Both themes must reach WCAG AA contrast.
- Fastify: every route declares request and response schemas (TypeBox). Errors use a consistent `{ error: { code, message } }` shape.
- Device ids and output names are kebab-case slugs.
- Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:` …).
- Record significant decisions as short ADRs in `docs/adr/`.

## Security notes

- URL ingest: http/https only, size/time limits, refuse loopback and link-local targets (§4.3 of the requirements).
- Enforce the upload size and decode pixel limits (`limitInputPixels`) on every input path.
- Sanitize every user-provided name before it touches the filesystem, and never let it escape `OUTPUT_DIR`.
- Never log API keys or full image payloads.
