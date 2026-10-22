# v1.3.1 verification

Status: implemented; developer verified the running application and explicitly
signed off on 2026-10-21.

## Behavior and automated checks

One nonblocking OLEDify toast combines two independent phases: AI cutoff tuning
and OLEDify preview/output rendering. Switches, threshold changes, automatic
choices, and render Retry participate in the rendering lifecycle. AI Retry shows
tuning progress immediately while its request is pending. Inline feedback retains
local fallback explanations, recommendations, protected manual settings, errors,
and Retry; it no longer repeats the working announcement.

`pnpm check` passed lint, formatting, explicit TypeScript, **130 server tests**,
**83 Chromium Lit tests**, production builds, and distribution checks. New browser
coverage verifies:

- Initial automatic fallback rendering overlapping AI tuning, followed by AI-only
  navigation and enabled PNG/ZIP/save controls, and the automatic-result render
  handoff before exports become usable again.
- Independent AI/render failures and Retry, including a deferred Retry POST and
  a failed render's retry toast, without overwriting manually edited settings.
- Expiry, service shutdown, Start over/replacement, disconnected components, and
  stale responses that cannot revive another image's progress.
- Keyboard switch control, retained focus, a single polite atomic status region,
  spinner, pointer-event pass-through, and toast bounds at 320, 390, and 1440px in
  light and dark appearances.

Existing browser checks continue to verify rapid edits, superseded render
responses, crop preservation, preview/output consistency, current-render export
guards, and independent naming/detection behavior. No server algorithm or runtime
configuration changed. The 15%/32 candidate rule and local cutoff 16 are unchanged.

## Real application captures with controlled transport

The captures use the actual built Lit client, Fastify API, Sharp rendering, and
PNG outputs in an isolated app at `http://127.0.0.1:3101`. The vision transport is a
**deterministic local mock**, not live model judgment. No image is sent to an
external service and no private configuration or credentials are used.

To reproduce after `pnpm build`:

```sh
node scripts/serve-oledify-toast-review.mjs
```

The helper listens on 3101 and serves its mock vision provider on 3102. Both bind
to loopback. It uses isolated `/tmp/shin-wallslice-v131-review` data, scratch, and
output directories, adds four seconds before render requests, and waits ten
seconds per AI comparison so working states can be inspected. Mock judgments
accept cutoffs at or below 24. These delays and judgments exist only in the review
helper, not in application runtime settings or production behavior. Stop the
helper with Ctrl+C when finished.

Upload the repository's CC0 [dark artwork](../v1.3.0/dark-artwork.png), a darkened
Dusk Ridges derivative. It qualifies at 49.128% near-black. Capture conditions:
1280 × 720 desktop viewport, automatic dark appearance, default phone/tablet
selections, Smart (AI) with the mock's no-subject entropy fallback, local cutoff 16. Switching OLEDify off during tuning demonstrates overlap and manual-edit
protection without restarting the search.

| Capture                                                    | Observed behavior                                                                                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Processing: tuning](processing-tuning-dark.png)           | Initial outputs are ready; one AI-tuning toast remains.                                                                                                       |
| [Processing: overlap](processing-overlap-dark.png)         | Switching off queues a render; one toast shows AI tuning and preview/output rendering together. The fallback and manual-protection explanation remain inline. |
| [Download: tuning](download-tuning-dark.png)               | Navigation retains the tuning toast; ZIP/Save are available for completed outputs, with no inline tuning announcement.                                        |
| [Download: completed](download-completed-dark.png)         | Completed recommendation stays inline, manual settings stay protected, and the progress toast is gone.                                                        |
| [Processing: render only](processing-render-only-dark.png) | A later switch change displays only the rendering phase, without restarting the completed AI task.                                                            |

In the Download capture the toast's visible bounds were x=915.20–1264 and
bottom=704 within the 1280 × 720 viewport. DOM inspection confirmed `role=status`,
`aria-live=polite`, and `pointer-events:none`. Browser tests cover the narrower
viewports and both appearances; no dedicated human screen-reader session was
performed. Screenshots are real app captures, not UI mockups; the transport is
mocked solely to make timing deterministic. This release changes status
presentation and does not reevaluate the earlier live-provider image judgments.

## Documentation and running app

The README OLEDify walkthrough and AI failure/timing guidance describe the shared
working toast and inline terminal feedback. Setup/configuration guides, examples,
and environment settings were reviewed: no new configuration or command changes
are required. Existing non-working Processing/Download captures remain accurate;
the new working-state illustration supplements them. Historical specs and design
evidence are unchanged.

The existing documented development instance at `http://localhost:5173` remains
available for developer verification. The controlled review app also remains
available for reference; its recommendations are mocked as stated above.
Developer sign-off was received on 2026-10-21 and the spec is marked implemented.
