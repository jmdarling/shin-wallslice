# Community Applications submission checklist

Listing is **pending**. Submission and listing approval are not required for v1.0.0
completion. Public image publication, accessible assets, and actual Unraid testing
are required first. The supplied XML is prepared; local validation is not CA acceptance.

## Copyable submission references

| Item                | Value                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| Public repository   | https://github.com/jmdarling/shin-wallslice                                                    |
| Raw Docker template | https://raw.githubusercontent.com/jmdarling/shin-wallslice/main/templates/shin-wallslice.xml   |
| Profile metadata    | https://raw.githubusercontent.com/jmdarling/shin-wallslice/main/ca_profile.xml                 |
| App/profile icon    | https://raw.githubusercontent.com/jmdarling/shin-wallslice/main/docs/assets/icon.svg           |
| License             | https://github.com/jmdarling/shin-wallslice/blob/main/LICENSE (MIT, root OSI-approved license) |
| Image               | `ghcr.io/jmdarling/shin-wallslice:1`                                                           |
| Project             | https://github.com/jmdarling/shin-wallslice                                                    |
| Support             | https://github.com/jmdarling/shin-wallslice/issues                                             |
| Category            | `Tools:Utilities`                                                                              |

The icon is an original vector drawing of one landscape spanning a monitor and phone.
It and the profile text are distributed under the repository MIT license; no third-party
art or attribution is required. SVG avoids blurry scaling in profile/template contexts.
Check actual rendering in CA's preview and Unraid before submission.

Listing copy: **One wallpaper. Every device.** Crop a still image locally into six
phone, tablet, and computer presets, adjust framing and OLED shadows, and download
PNGs or a ZIP. Optional AI connects to your chosen vision service and is off by
default. Single-user trusted-LAN use; no built-in login. One container, non-root
Fastify, 4 GiB RAM and 4 GiB writable temporary storage. Preferences persist in
appdata; images/exports are temporary.

## Single handoff checklist

- [ ] Follow [first release operations](releases.md): make repository public after
      reviewing history, land changes, run CI, publish stable Release and public GHCR.
- [ ] Set package visibility independently; test anonymous pulls and both manifest
      platforms. Record released digest, scans, and runtime evidence in
      [the ledger](v1.0.0-evidence.md).
- [ ] Run `pnpm distribution:check`. Confirm XML/profile structure, MIT license,
      categories, and real URLs. In a logged-out browser open every URL above; check
      icon rendering and template download. Private repository URLs currently fail.
- [ ] Complete the [real Unraid 7.2.3 walkthrough](../unraid.md), including fresh
      appdata permissions, PNG/ZIP downloads, replacement persistence, and image digest.
- [ ] Sign into the official [submission portal](https://ca.unraid.net/submit).
      Submit the public repository URL. Follow its **Validate** step; resolve reported
      missing/invalid fields, license, metadata, category, and repository-access errors.
- [ ] Run **Scan** after validation. Resolve image/URL/icon/template scan findings;
      rerun both steps after meaningful XML changes. A local validator cannot certify
      these external checks. Save actual results; do not claim acceptance before it occurs.
- [ ] If a forum support topic is requested, post the draft below from your maintainer
      account. Replace `<Support>` in `templates/shin-wallslice.xml` with that real topic
      URL; optionally add `<Forum>` under `CommunityApplications` in `ca_profile.xml`.
      Keep the issue link in listing copy for bug reports. Commit, rerun local checks,
      Validate, and Scan. No fabricated topic URL is included here.
- [ ] Submit for moderator review, track feedback, and update docs to claim an Apps
      listing only after approval. Installation via imported template works beforehand.

## Ready-to-post support topic draft

Title: **[Support] shin-wallslice — One wallpaper. Every device.**

shin-wallslice turns one favorite image into wallpapers sized for phones, tablets,
and computers. Processing runs locally: upload JPEG/PNG/WebP, adjust each crop,
optionally deepen OLED shadows, and download PNGs individually or in a ZIP. Optional
AI can suggest names/frame a subject using a vision service you configure; it is off
by default.

Install and operate: https://github.com/jmdarling/shin-wallslice/blob/main/docs/unraid.md

Source and license: https://github.com/jmdarling/shin-wallslice (MIT).

Support and reproducible bug reports: https://github.com/jmdarling/shin-wallslice/issues
Please include image tag/digest, Unraid version/architecture, steps, expected and
actual behavior. Redact credentials, private configuration, and personal images.

Designed for one user on a trusted LAN, without built-in authentication. Allow
4 GiB RAM and 4 GiB temporary disk. Appdata retains preferences; uploaded images
and exports are temporary. Updating is a normal Unraid container update and retains
appdata. Publishing a release does not automatically install it on your server.

## Official requirements reviewed

Checked against [submission help](https://ca.unraid.net/submit/help),
[Docker XML format](https://ca.unraid.net/submit/help/repository-xml), and
[repository profile XML](https://ca.unraid.net/submit/help/repository-info-xml).
The portal requires public active source, a root OSI license, a non-empty root
`ca_profile.xml` Profile, and valid app XML. Recheck these live requirements when
submitting; Validate and Scan are separate official steps.
