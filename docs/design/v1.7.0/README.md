# v1.7.0 activity dock verification

The selected Activity dock direction is implemented across Input, Processing,
and Download. The dock uses the existing Web Awesome appearance and a bottom
summary with expandable, scrollable activity details. Failures and decisions
appear first, followed by working activities and completed results. Status is
expressed in words and symbols, not color alone.

## Behavior

Operations update one entry per task. Preview edits coalesce into the current
render entry. The dock stays collapsed until explicitly expanded, including when tasks complete
or fail. The collapsed summary includes a spinner while any task is working.
Manual expansion remains open until Collapse; Start over resets it to collapsed.
Dismissal preserves unresolved counts and offers a way to restore dismissed
entries. Start over clears wallpaper activity but retains unresolved
application-wide errors; reload starts with fresh activity.

Server-save details remain accessible through **View save details**, including
saved/not-saved paths and explicit Replace/Cancel decisions. Retrying a download
uses its export request rather than an unrelated render. Invalid uploads offer
**Choose another image**. AI fallbacks and manual-edit protection are unchanged.

## Real application verification

Run `pnpm dev` with AI disabled and isolated paths below
`/tmp/shin-wallslice-v170-review` for preferences, temporary files, and output.
The review app is available at <http://127.0.0.1:5173>.
Run `node scripts/verify-activity-dock.mjs` against that instance. The script
uploads the CC0 Dusk Ridges PNG and exercises real image processing, ZIP download,
and server saving, including explicit conflict cancellation. It deliberately
rejects one invalid image, delays local render requests for an activity capture,
and intercepts preference saving with a controlled failure to verify recovery.
No image is submitted to an external AI service.

The script records results in [verification.json](verification.json), including
320px and 1440px layouts in light/dark appearances. It refreshes the six README
workflow screenshots and the OLEDify working screenshot. The latter now shows
the collapsed dock spinner during actual OLEDify rendering;
it does not depict a live external AI provider. Background AI combinations and
failures are exercised in the Lit Chromium suite using controlled responses.

- [Working activity](oledify-working.png)
- [Preference failure on mobile](preference-error-mobile.png)
- [Server conflict review on mobile](server-conflict-mobile.png)
- [Mobile Processing, light](processing-mobile-light.png)
- [Mobile Processing, dark](processing-mobile-dark.png)

## Documentation and deployment review

README workflow, OLEDify/AI, server-save, and troubleshooting guidance now explains
the dock and its recovery controls. Screenshot references use the real updated
application. Setup commands, JSON/environment configuration, flat-file preference
storage, and container packaging require no changes: notification history exists
only in browser memory and adds no configuration or persistent files. Released
image/version references remain pinned to the existing published v1.6.0 release;
the README identifies the dock as v1.7.0 source-build behavior.

No physical mobile device, live screen reader, fresh container image, or NAS
hardware run is included. Browser keyboard/accessibility semantics, responsive
layouts, existing server tests, and distribution checks cover the changed scope.
Developer verification is required before the spec is marked implemented.

## Visual review

Desktop Processing, active OLEDify rendering, the mobile preference failure, and
the mobile conflict review were visually inspected. Failures are ordered first
so their recovery action is visible when the user opens the dock. Long paths wrap; longer
conflict lists scroll inside the dock while Collapse remains available. The
compact dock leaves the workspace usable, and document scrolling exposes content
behind it. Screenshot capture uses reduced motion; the summary spinner remains visible
as a static indicator, alongside the working count.

## Automated checks — 2026-11-08

`pnpm check` passed lint, formatting, strict TypeScript checks, 139 server tests,
100 Lit Chromium tests, production builds, and distribution checks. The Chromium
suite includes manual expansion and spinner checks, notification priority,
dismissal/reset behavior, operation-specific load/download/server-save retries,
and the existing AI/render concurrency and stale-response cases. Required local
networking was enabled for browser tests. No dependency changes were needed.

## Manual-only expansion refinement — 2026-11-08

Following developer review, automatic completion/error expansion was removed.
Only the user opens or closes details; Start over resets to collapsed. The
summary shows a spinner during work, static when reduced motion is enabled.
The refreshed real-app verification passed, and `pnpm check` passed with
139 server tests and 98 Chromium tests plus all other required checks.
Earlier automatic-reveal checks were replaced with manual-state assertions.
