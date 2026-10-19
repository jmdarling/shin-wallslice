# 0001: Shared, pure crop math for previews and export

- Status: accepted
- Date: 2026-10-19

## Context

The UI shows live previews for every selected device, and users can pan and zoom each one. If the browser and the server computed crops differently, the export would not match what the user approved.

## Decision

All crop geometry lives in `packages/core/src/crop.ts` as a pure, dependency-free function, `computeCrop(source, subject, output, override)`. The browser uses it to draw previews from a downscaled proxy. The server recomputes every crop from the same inputs (source size, subject, target, override) at export time and never accepts client-computed rectangles.

The crop is the largest rectangle with the output's aspect ratio (cover fit). On each axis, it centers on the subject box (pulled 50% toward the focal point) while keeping the whole box in frame. When the box can't fit on an axis, the crop centers on the focal point and reports `subjectClipped`. Overrides replace the center and/or shrink the crop (`zoom` in (0, 1]).

## Consequences

- Previews are instant and exact, with no server round-trip per adjustment.
- The crop algorithm is unit-tested in one place (`packages/core/test/crop.test.ts`).
- Changing the algorithm changes both preview and export together.
