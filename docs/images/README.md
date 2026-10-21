# Documentation images

## Source artwork

**Dusk Ridges** is original vector artwork created for this repository's documentation. It depicts a warm moon/sun above layered blue mountain ridges, with dark foreground shadows that demonstrate OLEDify.

- [Editable SVG](dusk-ridges.svg)
- [Upload-ready PNG, 4800 × 3200](dusk-ridges.png)

The Dusk Ridges artwork (the SVG and its rasterized/cropped derivatives) is dedicated to the public domain under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). No external artwork, photography, or AI-generated imagery was used. This dedication applies to the example artwork, not to the application code, UI, or third-party dependencies.

## Captures and exports

The Input, Processing, and Download screenshots are real captures of the current application in light and dark modes at a 1440px desktop viewport. They use an isolated instance with AI disabled, the Dusk Ridges PNG, center anchors, OLEDify off, threshold 16, and phone/tablet selections. The filename base is `dusk-ridges` and device-folder organization is unchecked. The screenshots contain no live credentials or private images. Dark variants are selected automatically by the README's picture elements where supported.

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
