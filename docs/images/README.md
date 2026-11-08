# Documentation images

## v1.7.0 activity dock

The six workflow screenshots now show the unified activity dock in the real
application at 1440px, in light and dark appearances. Input has the default
phone/tablet choices; Processing and Download use the CC0 Dusk Ridges PNG,
Smart entropy crops, and local per-image OLEDify defaults. The OLEDify working
image shows rendering delayed by the local verification harness so progress
can be inspected; it does not involve an external AI service. Mobile errors,
conflict decisions, and capture conditions are documented in the
[v1.7.0 verification notes](../design/v1.7.0/README.md). Older sections below
record historical capture conditions. Output-only artwork remains unchanged.

## v1.6.0 Input selection and source dimensions

The light and dark Input screenshots show the upload box above the shared output-device choices
and live **2420 × 2868 px** recommendation for the first-use phone/11-inch tablet
selection. These are real full-page captures from the development app with AI
disabled, at a 1440px desktop width and 1000px viewport height. The Input page has
no uploaded image; its Dusk Ridges illustration remains the bundled example.
[Capture conditions and desktop/mobile evidence](../design/v1.6.0/README.md)
include 320px light/dark checks, keyboard/touch selection, and real uploads.
Processing and Download screenshots retain their existing conditions below;
their controls and generated output appearance are unchanged by this version.

## v1.5.0 original exports

The existing workflow screens and generated device PNGs retain their appearance,
so their screenshots and output illustrations remain accurate. New real-app
[conflict and save-result captures](../design/v1.5.0/README.md) show the original
file in both output layouts at 320px and 1440px in light/dark appearances. The
source is the same CC0 Dusk Ridges PNG; original ZIP and server-save bytes were
compared with the upload, including after Start over.

## Source artwork

**Dusk Ridges** is original vector artwork created for this repository's documentation. It depicts a warm moon/sun above layered blue mountain ridges, with dark foreground shadows that demonstrate OLEDify.

- [Editable SVG](dusk-ridges.svg)
- [Upload-ready PNG, 4800 × 3200](dusk-ridges.png)

The Dusk Ridges artwork (the SVG and its rasterized/cropped derivatives) is dedicated to the public domain under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). No external artwork, photography, or AI-generated imagery was used. This dedication applies to the example artwork, not to the application code, UI, or third-party dependencies.

## Captures and exports

The Processing and Download screenshots are real captures of the application in light and dark modes at a 1440px desktop viewport. They use an isolated instance with AI disabled, the Dusk Ridges PNG, center anchors, OLEDify off, threshold 16, and phone/tablet selections. The filename base is `dusk-ridges` and device-folder organization is unchecked. The screenshots contain no live credentials or private images. Dark variants are selected automatically by the README's picture elements where supported. Current Input capture conditions are documented above.

`export-iphone-18-pro-max.png`, `export-m5-ipad-pro-11-inch.png`, and `export-generic-16x9-4k.png` are actual server-generated PNGs with center crops, OLEDify disabled, and dimensions matching their presets. `export-generic-16x9-4k-oled.png` uses the same crop with OLEDify enabled at threshold **32**.

`device-outputs.png` arranges the original and those actual outputs with labels. `oledify-comparison.png` arranges the two 4K outputs side by side. Only the presentation copies are resized for these comparison figures; the linked source and individual exports retain their full dimensions. The server's OLEDify output was checked pixel by pixel: channels become zero exactly when all three original RGB channels are at or below 32; other pixels and alpha are retained.

To recreate the content, run an AI-disabled instance, upload the source, select the documented presets and center anchor, then export once with OLEDify off and once with threshold 32. Capture the three workflow pages in both browser color schemes. Use the actual downloaded outputs for the comparison figures; do not draw replacement UI or crop examples by hand.

## v1.1.0 identity refresh

The six workflow images now show the selected Passepartout identity and its
reduced-copy refinement. They are actual captures from the development app,
not proposal mockups. Mobile and 320px captures, the original proposals,
side-by-side comparisons, and verification evidence live in
[the design review](../design/v1.1.0/README.md).
The output-only examples remain accurate and were retained.
The Input example uses the same CC0 source artwork, bundled as an SVG in the
client; the upload/export verification uses the original PNG.

## v1.2.0 server output

The Download light/dark captures were refreshed from the running implementation
with server saving enabled. Input and Processing remain accurate and were retained;
the historical v1.1.0 design captures remain historical evidence. The source,
presets, center crops, and OLEDify settings above are unchanged.

Reproduce using the documented `pnpm dev` command with
`SHIN_WALLSLICE_OUTPUT_DIRECTORY=/tmp/shin-wallslice-v120-review/output`, AI disabled,
and isolated data/scratch directories; then run `node scripts/verify-server-output.mjs`.
The script captures light/dark at 1440, 390, and 320px, checks control overflow,
compares actual saved PNGs to final-preview bytes, cancels conflicts, exercises
both layouts, and checks persistence after Start over. It writes only its sample
wallpapers into the configured output directory. It replaces existing sample
names only through the app's explicit Replace control. Do not use a production
instance with private active jobs for documentation verification.

[Verification and additional captures](../design/v1.2.0/verification.json).

## v1.3.0 automatic OLEDify

Processing and Download light/dark captures now include local recommendation
feedback. They use the updated development app with AI and server saving enabled;
Dusk Ridges is a noncandidate (13.367% near-black), so OLEDify stays off at cutoff
16 and the additional vision search is skipped. Naming/detection still follow
their existing submission rules. Capture preferences were kept local to the
browser. The original threshold-32 export comparison remains accurately labeled
and uses identical framing. Input captures are retained from the earlier
AI-disabled session. See [v1.3.0 evidence](../design/v1.3.0/README.md) for
1440/390/320px light/dark captures, live original/trial evaluation, and limitations.

## v1.3.1 working toast

`oledify-working.png` is a real 1280 × 720 dark-appearance capture showing one
toast with both AI tuning and OLEDify preview/output rendering. The isolated app
uses the existing CC0 dark Dusk Ridges derivative, real Fastify/Sharp outputs, and
a delayed deterministic local provider, not an external model. No private image
or credential is used. [Capture and verification details](../design/v1.3.1/README.md).
The earlier idle Processing/Download captures remain accurate; this image adds
the changed working-state guidance.
