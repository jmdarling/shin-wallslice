# shin-wallslice

Form-fit any wallpaper to all your devices. Drop in an image, pick your phones, tablets, laptops and monitors, and get a correctly sized wallpaper for each one, with the subject kept centered.

- **Smart crops, locally.** Subject detection runs inside the container (ISNet saliency + YuNet faces via ONNX Runtime). No cloud services required.
- **Live previews.** Every device preview updates instantly in the browser using the same crop math as the export.
- **Optional tweaks.** Drag the subject box to correct detection for every device, or pan and zoom a single device's crop.
- **Tablets done right.** Devices used in both orientations get a square wallpaper that works in portrait and landscape.
- **Get files out your way.** Download one, download a ZIP, share to Photos / AirDrop, or save straight to a NAS folder.
- **Optional AI names.** Plug in Anthropic, OpenAI or any OpenAI-compatible server (Ollama, LM Studio) for descriptive file names.

See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) for the full specification and [AGENTS.md](AGENTS.md) for contributor and agent guidance.

## Run with Docker

```sh
docker run -d --name shin-wallslice -p 3000:3000 \
  -e PUID=1000 -e PGID=1000 \
  -v "$PWD/output:/output" \
  ghcr.io/jmdarling/shin-wallslice:latest
```

Open http://localhost:3000. See [`docker-compose.yml`](docker-compose.yml) for a compose example and [`docker/unraid/shin-wallslice.xml`](docker/unraid/shin-wallslice.xml) for an Unraid template.

| Variable                                                  | Default              | Purpose                                                                |
| --------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------- |
| `PORT`                                                    | `3000`               | HTTP port                                                              |
| `PUID` / `PGID` / `UMASK`                                 | `99` / `100` / `022` | Ownership of files written to `/output`                                |
| `OUTPUT_DIR`                                              | `/output`            | "Save to output folder" target; hidden in the UI if not writable       |
| `DATA_DIR`                                                | `/data`              | Temporary uploads (expire after `TEMP_TTL_HOURS`, default 24)          |
| `MAX_UPLOAD_MB` / `MAX_INPUT_MEGAPIXELS`                  | `100` / `50`         | Input limits                                                           |
| `URL_FETCH_ALLOW_PRIVATE`                                 | `true`               | Allow fetching image URLs from private LAN addresses                   |
| `NAMING_PROVIDER`                                         | unset                | `anthropic`, `openai` or `openai-compatible`; unset disables AI naming |
| `NAMING_MODEL` / `NAMING_BASE_URL`                        | provider default     | Model and endpoint (both required for `openai-compatible`)             |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `NAMING_API_KEY` | unset                | Credentials for the naming provider                                    |

Output layout: `<output>/<device-id>/<name>.png`. Saving again with the same name overwrites the file.

## Develop

Requires Node.js 24 and pnpm (via Corepack).

```sh
corepack enable
pnpm install
pnpm models        # download + verify the ONNX models into ./models (~180 MB)
pnpm dev           # core (watch) + API on :3000 + Vite UI on :5173
```

Before pushing: `pnpm check` (lint, format check, typecheck, tests, build).

Build the image locally with `docker build -t shin-wallslice .`. If Docker Hub rate-limits you, add `--build-arg NODE_IMAGE=mirror.gcr.io/library/node:24-bookworm-slim`.

### Adding a device

Add `devices/<id>.json` (the file name must match `id`; phones and tablets are listed portrait) and cite the manufacturer spec page in `source`. `pnpm test` validates the whole catalog.

## Model licenses

| Model                                                                                       | Use                  | License                                                                                             |
| ------------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------- |
| [ISNet](https://github.com/xuebinqin/DIS) `isnet-general-use`                               | Subject segmentation | Code Apache-2.0; the weights have no stated license (see [REQUIREMENTS §6.2](docs/REQUIREMENTS.md)) |
| [YuNet](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet) 2023mar | Face detection       | MIT                                                                                                 |

## License

MIT
