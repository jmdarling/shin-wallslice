# v1.3.0 verification

The developer verified the running application and explicitly signed off on
2026-10-21. The supplied spec is marked `implemented`, including the revised 15%
qualifying percentage and clarified local-fallback wording.

## Deterministic checks

The full root check passed; the final expanded suites passed **130 server tests**
and **74 Chromium tests**. Lint, formatting, explicit type checks, builds, and
distribution checks also passed. `pnpm check` covers root lint, formatting, explicit TypeScript checks, server
Vitest/Fastify injection, Lit Browser Mode in Chromium, builds, and distribution
checks. The OLEDify tests use deterministic provider responses to verify inclusive
classification boundaries, visible-pixel accounting, adaptive bounds, request
budgets, effective versus no-op trials, malformed judgments, independent tasks,
Retry, cancellation/expiry/shutdown, job isolation, and accepted exports while
analysis is pending. Browser tests verify new-image defaults, pending navigation,
automatic on/off completion, preserved manual edits (including restoring a value),
Retry, and new-image reset. Existing render-generation tests cover superseded
responses and disabled stale downloads.

## Live configured-provider review

[Live evidence](live-review.json) is from actual requests through the configured
OpenAI-compatible connection, separate from mocked transport tests. It records no
endpoint, model identifier, tokens, or other private settings. Each original and
recommended PNG uses identical full-composition framing. These are bounded
comparison images, not full-size device exports. The originals and resulting
recommendations are linked from the JSON; the evaluated cutoff list records each
acceptable/unacceptable judgment.

- Dusk Ridges: 13.367% near-black, below the original 20% default (and the revised 15% default). Correctly skipped
  the additional task and retained OLEDify off at 16. This is the repository's CC0
  documentation artwork.
- Dark-background artwork: a `linear(0.5)` darkened derivative of CC0 Dusk
  Ridges, 49.128% near-black. With explicit developer permission, evaluated
  127 (no), 63 (no), 31 (no), 15 (yes), 23 (yes), 27 (no), 25 (no), 24 (yes);
  recommended **24**. Visual inspection finds that the foreground becomes black
  while the mountain shapes remain recognizable, but the sky gradient gains a
  visible horizontal hard boundary near its top and faint details are lost. The
  provider missed this artifact despite the explicit prompt. This is further
  evidence that users must inspect previews and can choose a lower cutoff or off.
- Earthrise: 77.722% near-black. Evaluated 127 (no), 63 (yes), 95 (yes), 111 (no),
  103 (yes), 107 (yes), 109 (no), 108 (no); recommended **107**. Visual inspection
  finds that the model accepted loss of Earth's faint edge glow and small hard
  transitions/black pinholes near shaded lunar detail. Bright Earth and lunar
  composition remain recognizable. This is a concrete limitation of the model's
  best-effort judgment, not evidence that 107 is artifact-free. Manual lower
  cutoffs or off remain available.
- Shadow gradient with hard dark rectangle: 61.397% near-black. Evaluated 127 (no),
  63 (no), 31 (no), 15 (no), 7 (yes), 11 (yes), 13 (no), 12 (no); recommended **11**.
  Visual inspection finds a visible transition where the left gradient becomes
  black; the rectangle's hard edges remain intact. Even low cutoffs can create
  noticeable transitions in smooth gradients. The fixture is generated locally
  by `scripts/verify-oledify.mjs`; it is a synthetic stress case, not photography.

The photographic fixture is NASA's [Earthrise](https://science.nasa.gov/resource/image-earthrise/),
credited to NASA/William Anders. The tested download was
[the NASA JPEG](https://assets.science.nasa.gov/dynamicimage/assets/science/esd/climate/2023/12/August-2013_1920x1200.jpg),
1280 × 800. Its PNG review copies preserve the JPEG's decoded pixels.

The developer explicitly authorized the darkened CC0 artwork submission on
2026-10-21 after automatic approval review initially blocked it. The approved
evaluation completed; no verification permission remains pending.

To reproduce after building, set `WALLSLICE_REVIEW_PHOTO` to a local photo path and
run `node scripts/verify-oledify.mjs` with a configured private AI connection. This
submits images and may incur provider costs. Existing successful cases are retained
from `live-review.json`; remove that evidence file to rerun all cases. The script uses the ordinary runtime
configuration and never prints its credentials. Do not substitute private photos
unless you intend to send them to that service.

## Running UI and captures

The existing development app at `http://127.0.0.1:5173` was confirmed to serve the
updated code: a real upload returned the OLEDify analysis state and displayed its
local percentage and skipped-task feedback. Fastify runs at port 3000. Both
process working directories match this repository. The app was left running.

[UI evidence](ui-review.json) records Processing and Download at 1440, 390, and
320px in light/dark appearances. Chromium checked page overflow and control bounds
at all twelve combinations; none overflowed. Visual inspection of the narrow dark
Processing and desktop light Download captures confirms readable feedback and
usable controls. The upload was a temporary Dusk Ridges job and was deleted after
capture. Capture preferences were changed only in that browser, not written to
shared saved preferences. These captures used AI enabled, entropy/center framing,
OLEDify off at 16, phone/tablet outputs, and server saving enabled. The source is a
noncandidate, so no OLEDify comparison was submitted by this capture job; naming
and subject detection followed their existing rules.

Reproduce the captures with `node scripts/verify-oledify-ui.mjs` against a running
development instance (optionally set `WALLSLICE_REVIEW_URL`). With AI enabled, its
upload still submits naming/detection as disclosed.

Desktop Processing/Download captures also refresh `docs/images/` for the README.
The original threshold-32 comparison illustration retains identical framing and
accurate labels; the pixel transformation is unchanged. Historic design evidence
for previous versions is unchanged.

The developer subsequently lowered the default qualifying percentage from 20% to
15%. All recorded review cases retain the same classification at 15%, so their
provider comparisons and screenshots remain applicable. The RGB cutoff remains
32; the updated deterministic fixture verifies the inclusive 15% boundary.
