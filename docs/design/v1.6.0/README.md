# v1.6.0 verification

Input now shares Processing's output-device controls and saved selection. Its
source recommendation uses the largest selected output width and largest
selected output height, including the catalog's square tablet outputs. No new
configuration, preference schema, service, or storage location is introduced.

## Real application review

Run the documented `pnpm dev` command with Node.js 24 and AI disabled. This review
used `SHIN_WALLSLICE_DATA_DIRECTORY=/tmp/shin-wallslice-v160-review/data` and
`SHIN_WALLSLICE_TEMPORARY_DIRECTORY=/tmp/shin-wallslice-v160-review/tmp`, with the
Vite app at <http://127.0.0.1:5173>. No image was submitted to an external provider.

`node scripts/verify-source-size.mjs` exercises the actual browser, API, image
processing, and flat-file preferences. It requires that isolated review instance,
changes its saved device choices, then leaves Input with the first-use defaults.
[Structured results](verification.json) record the checks and captures:

- Default phone/tablet selection: 2420 × 2868 px; all presets: 3840 × 2868 px;
  landscape alone: 3840 × 2160 px; independent maxima update before upload.
- Keyboard Space changes selection without moving focus, and the dimension
  status exposes polite, atomic announcements with a descriptive label. Touch
  taps change and restore the recommendation at 320px in both appearances.
- Empty selection survives reload, allows a real Dusk Ridges upload, and keeps
  Download disabled. Selecting a laptop on Processing initializes its crop,
  enables Download after rendering, and carries back through Start over.
- A corrupt PNG is rejected and a later upload succeeds. A generated 64 × 64 PNG
  is accepted, displays the existing upscaling warning, and reaches Download with
  completed output. The recommendation imposes no new input restriction.
- Input choices are written to the existing `preferences.json`. A separate stop/restart of
  `pnpm dev` verified the restored catalog selection and Input recommendation;
  existing server tests also verify preference retention across server recreation.

Captures use the real Input page, AI disabled, first-use phone/tablet choices, and
the bundled Dusk Ridges example. Desktop captures are 1440px wide, mobile captures
320px wide, with a 1000px viewport height and full-page output. Controls were
checked for horizontal bounds and 44px targets. All four captures were visually
inspected for readable labels, recommendation text, focus/control visibility, and
overflow. Desktop captures also replace the README's Input images.

| Appearance | Desktop                  | Mobile                                   |
| ---------- | ------------------------ | ---------------------------------------- |
| Light      | [Input](input-light.png) | [Input at 320px](input-mobile-light.png) |
| Dark       | [Input](input-dark.png)  | [Input at 320px](input-mobile-dark.png)  |

## Automated coverage and documentation review

`pnpm check` passed lint, formatting, strict TypeScript checks, 139 server tests,
92 Lit Chromium tests, production builds, and distribution checks. The successful
run used local networking for test servers after the restricted environment
blocked loopback binding. Recommendation whitespace assertions were corrected
before the successful run.

Lit Chromium coverage includes bundled dimension examples, removal of maxima,
single and empty selections, catalog loading/failure, delayed preference saves,
save failure/recovery, keyboard focus, reload restoration, and carryover after
file-picker/drop/paste uploads. Existing crop, export, theme, responsive layout,
and preference tests remain in place, including Processing changes followed by
Start over and reload.

README usage, device-sizing, and persistence guidance now describe selection on
both pages and advisory dimensions. Setup/configuration examples, Docker/Compose,
and Unraid guidance were reviewed: existing settings, commands, mounts, and flat
file persistence remain valid. Processing and Download controls and output
appearance are unchanged, so their existing screenshots remain accurate. Input
screenshots and alt text were refreshed; affected links and image references were
checked.

No live screen-reader session or physical mobile device was used; accessible
status semantics, focus retention, keyboard input, and emulated touch were checked
in Chromium. No new container build or NAS hardware test was needed for this
client-only behavior; required distribution checks cover the existing packaging.

The developer verified the running application and explicitly signed off on
2026-11-07, selecting “Verified; sign off (Recommended)”. The spec is marked
`implemented`.

## Input layout follow-up — 2026-11-07

At the developer's request, the drop/paste upload box now spans the Input page
above the output-device selection. It also precedes the selection in document
and keyboard order and on narrow screens. The example illustration sits beside
the device panel on desktop and below it on mobile. All four Input captures and
the README images were refreshed from the running app, and the real workflow
verification script passed again with the revised layout. The 11 focused Input,
selection, and responsive-layout Chromium tests passed, as did the client
TypeScript check, lint, build, formatting, and distribution checks.
