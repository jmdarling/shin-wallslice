# v1.1.0 design review

Status: Passepartout implemented and explicitly signed off by the developer on
2026-10-21. The original proposals below remain static design artifacts.

Open the [comparison index](index.html) for all 36 primary mockups and six state
sheets. Every thumbnail links to a full-size PNG. Desktop is 1440px wide; mobile
is 390px wide. Captures include the whole page, including content below the fold.
The [supplied spec](../../../specs/v1.1.0.md) tracks selection and implementation.

## Current interface audit

- The large repeated headline pushes the actual crop work down. The proposals
  reserve large type for Input and use smaller task headings during editing.
- The header prints the whole workflow with equal weight. All proposals show
  the current stage with a filled marker and a textual label.
- Rounded translucent panels give the original, controls, and each crop similar
  importance. Each proposal gives those three things different spatial roles.
- The native file picker and dark neutral buttons lack a coherent relationship
  to the green surfaces. Each proposal defines a primary action, secondary
  action, selection mark, and visible focus treatment.
- The source preview repeats the full image above full-image crop editors.
  Passepartout makes it a reference strip, Cut Bench uses a compact source tray,
  and Screen Room separates it from the device-shaped results.
- The existing crop boundary and dark scrim communicate framing well. Preserve
  their white/black double edge, manual positioning, and reset behavior.
- Mobile currently stacks a large controls panel ahead of the crops. These
  proposals retain normal document scrolling with compact groups and clear
  headings. No hidden drawers or new interaction models are required.

## Shared comparison fixture

Use the repository's CC0 **Dusk Ridges**, 4800 × 3200, for every proposal.
Select iPhone 18 Pro Max (1320 × 2868) and M5 iPad Pro 11-inch (2420 × 2420).
Show Smart (AI) selected, all five spatial anchors, Smart (entropy), OLEDify
enabled at 32, and independent crop positioning with Reset position.
Download uses the AI-suggested, manually editable name `dusk-ridges` and checked
device-folder organization. Filenames are `dusk-ridges-iphone-18-pro-max.png`
and `dusk-ridges-m5-ipad-pro-11-inch.png`; ZIP is `dusk-ridges.zip`.
The previews are illustrative crops of the same source, not verified exports.
The Input image is an explicitly labeled example, not a preselected upload.

AI-enabled Input retains the image-sharing disclosure. With AI disabled, omit
Smart (AI), the disclosure, and AI status, leaving entropy and anchors available.
Pending detection keeps local framing available; pending naming allows editing
and download. State sheets show these cases alongside failures and warnings.

## 1. Passepartout

**Idea:** prepare an image as carefully as a print in a mat. The memorable
element is the generous, pale surround around an untouched image.

Core colors (light / dark):

| Role          | Light     | Dark      |
| ------------- | --------- | --------- |
| Mat           | `#F1F0F7` | `#201E2A` |
| Paper         | `#FFFFFF` | `#2B2838` |
| Ink           | `#292438` | `#F4F0FF` |
| Secondary ink | `#61586F` | `#C8BFD9` |
| Iris / action | `#624696` | `#D1B5FF` |
| Boundary      | `#867A98` | `#9486AA` |

Type: Georgia for task headings, Avenir Next for controls and body; fallback
to serif and sans-serif respectively. Display 52px, task heading 36px, body
16px, supporting copy 14px. Serif is confined to image-related headings.

Layout: left-aligned titles and controls; centered images inside generous mats.
Desktop has a narrow settings column and two adjacent crop mats; mobile stacks
settings, reference, then each crop. Download groups naming above the image pair.

```text
brand                       Input / Processing / Download
Task heading
settings  | source reference
          | phone mat          tablet mat
          | Next: Download
```

Controls: rectangular buttons with gently rounded corners, underline-like
section separators, radios with checkmarks, fully outlined focus rings.
Principles: the artwork carries color; white space distinguishes reference from
output; text remains calm and direct. Web Awesome buttons use the iris brand
tokens, with native controls sharing the same border and selection colors.

Tradeoff: more scrolling than Cut Bench; Georgia is familiar rather than custom.
The gallery metaphor suits choosing wallpaper without pretending to be an art
marketplace. Avoid decorative captions and ornamental serif labels.

## 2. Cut Bench

**Idea:** a precise workbench for turning one source into dimensioned pieces.
The memorable element is the blue stage rail and tightly aligned crop tools.

Core colors (light / dark):

| Role | Light | Dark |
| Work surface | `#E8EDF2` | `#17222D` |
| Tool surface | `#FFFFFF` | `#233442` |
| Ink | `#132C44` | `#EDF6FF` |
| Secondary ink | `#475E72` | `#BBCCDC` |
| Blueprint / action | `#1554B4` | `#9AC4FF` |
| Boundary | `#6D8296` | `#7F9AAF` |

Type: DIN Condensed bold for headings, Verdana for controls and body. Fallback
to a condensed sans-serif and sans-serif. Display 60px, task 40px, body 15px,
supporting copy 13px. Dimensions remain in proportional body type, not tiny
monospaced annotations.

Layout: a desktop vertical stage rail aligns with the settings and image bench.
Input is split between the upload tool and an example framing diagram. Processing
uses one compact source tray above the crops. Mobile turns the rail into a
horizontal stage row and stacks the bench with 44px minimum controls.

```text
brand
1 Input       | task heading
2 Processing  | settings | reference tray
3 Download    |          | phone      tablet
              |          | Next: Download
```

Controls: squared corners, firm borders, compact labeled tool groups, a solid
blue primary action, checked selected tiles. Web Awesome uses small radius and
blue brand tokens. Geometry communicates output precision; no ruler ticks,
fake coordinates, or decorative technical metadata.

Tradeoff: highest information density; less relaxed on mobile. Long names must
wrap instead of compressing type. The stage rail costs desktop width but helps
locate the user within the three actual sequential stages.

## 3. Screen Room

**Idea:** see how the wallpaper will live on your screens. The memorable element
is the device-shaped image presentation, carried across Input and Download.

Core colors (light / dark):

| Role | Light | Dark |
| Room | `#FAF4E5` | `#29271F` |
| Work surface | `#FFFFFF` | `#363328` |
| Ink | `#343020` | `#FFF5D8` |
| Secondary ink | `#675E43` | `#D2C6A2` |
| Ochre / action | `#785315` | `#F1C86C` |
| Boundary | `#938568` | `#A39878` |

Type: Optima for display and headings, Trebuchet MS for controls/body, with
sans-serif fallback. Display 52px, task 34px, body 16px, supporting copy 14px.
The open humanist headings echo the curved screen surrounds.

Layout: centered Input composition, left-aligned task labels thereafter.
Processing puts crops in the main area with settings to the right on desktop;
mobile places settings before crops in document order. Download presents a
device gallery after a compact naming/action bar. No image color filters.

```text
brand                     1 Input  2 Processing  3 Download
                    Input invitation
               example devices | upload

Processing: source + phone/tablet | settings
Download:   name + ZIP action, then device gallery
```

Controls: pill-shaped primary actions, softly rounded group surfaces, explicit
checkmarks, and a separate square focus ring. Device frames belong to final
preview images; editing surfaces retain rectangular source geometry. Web Awesome
buttons use pill radius and ochre tokens; input fields use a smaller radius.

Tradeoff: device silhouettes consume space and are illustrative rather than
hardware-accurate. Optima needs a portable font decision before shipping beyond
macOS; a licensed self-hosted humanist face or an agreed fallback can resolve it.
Avoid a dark cinematic backdrop: both appearances must support everyday tools.

## Review before mockups

Reviewed each plan against the spec and frontend-design skill before rendering:

- Passepartout originally suggested print captions everywhere. Removed them:
  filenames and actual dimensions provide the useful captions. The violet-gray
  mat avoids the common cream/serif/terracotta combination.
- Cut Bench originally used ruler ticks and monospace metadata. Removed them:
  the app has no physical measurement system. Actual device dimensions and the
  three real stages justify the remaining structure.
- Screen Room originally used floating cards and decorative gradients. Removed
  both: device shapes carry the identity, flat surfaces keep settings legible.
  Amber is a restrained action color rather than a decorative image tint.
- All plans preserve Lit, Web Awesome, local processing, AI recovery, manual
  crop controls, naming, downloads, and the existing three stages. No runtime
  theme chooser, new server behavior, or selectable design concepts are proposed.
- Exploration uses installed fonts without downloads. Final font packaging and
  fallback metrics must be settled and verified with the selected implementation.

## Recommendation and decision

Recommend **Passepartout**: it gives the image room, retains clear crop geometry,
and has the best balance of legibility and calm for a home-hosted wallpaper tool.
Cut Bench is strongest for frequent adjustments; Screen Room best emphasizes
the destination devices. This recommendation does not select a direction.

Selection: **Passepartout**, explicitly selected on 2026-10-21. Cut Bench and
Screen Room are superseded proposals. Preserve the original mockups as design
history. The developer requested much less interface text: remove promotional
headlines and explanatory captions from Processing and Download; retain workflow
location, option labels, dimensions, filenames, essential framing cues, AI
disclosure, and actionable status. Naming status appears at Download, where it
can be acted on. The front-page introduction may remain. These refinements take
precedence over the copy in the original mockups. See the [implemented captures and side-by-side comparisons](implemented/index.html)
and [workflow verification](implemented/verification.json).

## State treatments

Each appearance has a state sheet linked in the comparison index. Focus is a
3px external action-color ring with a surface gap; disabled controls use explicit
unavailable copy and muted text rather than opacity alone. Pending work has a
static progress symbol plus text, preserving access to independent work. Error
messages identify the failed task and offer Retry; warnings say when detail may
soften. A warning is not styled as a failed action. Motion is unnecessary for
these artifacts; final pending indicators must respect reduced motion.

## Reproduction and verification

Run `node docs/design/v1.1.0/render.mjs` with the repository's installed Playwright
and Chromium. It builds the inert HTML studies, 36 primary PNGs, six state PNGs,
and the comparison index. No production code is imported or modified. Artifacts
carry explicit direction, screen, viewport, appearance, and mockup labels.

Rendering checks verify image loading, expected labels and action copy, and no
horizontal overflow at 1440px, 390px, and an extra 320px stress width. Visual
inspection and any corrections are recorded in the supplied spec. These checks
validate the studies, not the production acceptance criteria; actual export and
full application verification follow developer selection and implementation.

## Implementation and visual review

The [implementation gallery](implemented/index.html) contains actual application
captures at 1440px, 390px, and 320px in both appearances, plus side-by-side views
of the selected proposal and implementation. The [verification harness](verify-app.mjs)
exercises real source upload, controls, exports, OLEDify, and both ZIP layouts
against `pnpm dev`; it also refreshes the README workflow images. It uses an
isolated AI-disabled instance. AI-enabled states and recovery are covered in the
Lit Chromium tests, without requests to a real external AI provider.

Material adaptations from the original mockups:

- Removed Input's supporting tagline after developer review; the heading leads
  directly into file selection.
- The stage indicator replaces visible Processing/Download headlines. Accessible
  page headings remain. The source reference carries dimensions alone.
- Remove marketing subtitles, source commentary, repeated manual-positioning
  paragraphs, the closing slogan, and explanatory text beside the anchor grid.
  Keep the crop's short drag cue and accessible keyboard instructions.
- OLEDify uses **True black shadows**, **Threshold**, and the slider. Detailed
  pixel-cutoff behavior remains in the README rather than repeating per screen.
- **Download ZIP** replaces the filename repeated inside the primary button.
  The editable name and individual filenames already identify the output; long
  names wrap in filename captions rather than expanding the primary action.
- Device headings appear before each preview, consistently with Processing.
  Gallery mats retain the original palette, outlines, and image proportions.
- Keep AI disclosure at Input. Naming progress is shown at Download; detection
  progress and actionable failures remain visible when they affect framing.

Normal and secondary text, warnings, selections, essential boundaries, and focus
colors are covered by browser contrast assertions for both appearances. Actual
captures were visually checked for stage hierarchy, readable controls, image mats,
focus, and narrow layouts. The design adds no animation; pending spinners are hidden
under reduced motion while their status text remains visible. Fonts use installed Georgia/Avenir Next with system
fallbacks; exact glyph shapes vary by platform.

Setup, configuration, Unraid, and contributor guidance were reviewed: no setup or
runtime configuration change is needed. README workflow wording now matches the
option labels and mobile placement. Output-only illustrations remain accurate.
