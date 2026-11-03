# Original-image export verification

Real application verification uses the CC0 Dusk Ridges PNG, two selected device
presets, center crops, and AI disabled. The existing recommendation leaves
OLEDify off for this fixture. All review files use the isolated
`/tmp/shin-wallslice-v150-review` directory.

Captures include the separate v1.4.0 visual identity work present in the review
checkout. Original-export behavior and verification are independent of that
identity work, which is kept outside the originals feature commit.

The [recorded results](verification.json) include the source byte count and
SHA-256 digest. Actual browser ZIP downloads and server saves were compared with
the uploaded source byte for byte in both layouts. Generated PNGs were also
compared with live preview downloads. An original-only conflict blocked all
writes; Cancel preserved its bytes and Replace wrote the reviewed files.
Start over retained saved originals and PNGs.

| State                                        | Capture                                |
| -------------------------------------------- | -------------------------------------- |
| Original-only replacement review, 320px dark | [View](original-conflict-320-dark.png) |
| Flat save result, 1440px light               | [View](saved-flat-1440-light.png)      |
| Organized save result, 320px light           | [View](saved-organized-320-light.png)  |
| Organized save result, 1440px dark           | [View](saved-organized-1440-dark.png)  |

Reproduce with the documented `pnpm dev` command, setting AI to disabled and
data, temporary, and output directories to `data`, `tmp`, and `output` beneath
the isolated review directory above. Run `node scripts/verify-originals.mjs`
with an empty review output directory; it deliberately refuses an already
populated output root. The harness creates its own conflicting original,
downloads actual ZIP files, compares saved bytes, and records the captures.

The unchanged interface and output PNGs keep existing workflow screenshots and
output-only illustrations accurate. These additional captures show the newly
included original in conflict and save-result lists. README and Unraid guidance
describe original inclusion, both layouts, metadata retention, persistence,
backup, and recovery. Configuration, mounts, and installation commands need no
new settings. Historical design evidence is retained.
