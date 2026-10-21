# Release operations

The release workflow publishes `ghcr.io/jmdarling/shin-wallslice`. The initial
version is **1.0.0** and its public image is published;
[the evidence ledger](v1.0.0-evidence.md) distinguishes local checks from real
publication, account settings, and NAS verification.

## One-time GitHub setup

1. Make the repository public after reviewing its tracked contents and history for
   private material. Public source and raw icon/template URLs are CA prerequisites.
   The checkout and local private JSON are separate; never publish local config.
2. Enable GitHub Actions and allow the pinned actions in the workflows. Native
   `ubuntu-24.04` and `ubuntu-24.04-arm` runners must be available. CI needs no AI key.
3. After the first Verify run, protect `main` with required checks **Source checks**,
   **Container (amd64)**, and **Container (arm64)**. Select their actual displayed
   check contexts in GitHub, require PR review, dismiss stale approvals, require
   CODEOWNERS review, and disallow force pushes. Test a failing PR blocks merge.
   Workflow files alone do not configure branch protection. Private repositories
   may need an eligible plan for these settings.
4. Allow Actions to publish packages. For an existing GHCR package, grant this
   repository Actions write access. Release jobs use their own `GITHUB_TOKEN` with
   `packages: write`; do not add a long-lived release PAT.
5. The first push may create a **private** package. In the package's settings change
   visibility to **Public** and confirm repository linkage/Actions access. Repository
   visibility does not prove package visibility. Expect initial anonymous verification
   to fail until this one-time change; use the exact-digest recovery below.
6. Configure issue automation separately using [its guide](automation.md). It has no
   access to the release job's package credentials.

## Publish the first release

1. Land these changes through a reviewed PR with all Verify checks passing. Install
   the pinned dependencies locally and run `pnpm check`. No workflow can run from
   uncommitted local files; CI evidence must name the pushed commit.
2. For future versions, update root/client/server `package.json` together and update
   versioned Compose, docs, notes, and the distribution version validator. Install
   with the pinned pnpm and retain any lockfile changes. Choose stable `vX.Y.Z` only.
3. Draft a GitHub Release for `v1.0.0` at the reviewed commit. Use
   [the release-note draft](v1.0.0-release-notes.md). Publish it to start **Release**.
   Drafts, prereleases, and non-release pushes cannot move stable aliases. A manual
   retry requires an already published stable release and checks package versions.
4. Watch Source checks and both native container checks. Candidate jobs build and
   push per-architecture artifacts with provenance and SBOM, run full wallpaper and
   persistence smoke tests on those exact digests, and scan for HIGH/CRITICAL CVEs.
   Fixable HIGH/CRITICAL findings block publication. Full reports retain unfixed
   findings too; explain their impact and mitigation in the evidence ledger and
   release notes. See [the vulnerability review](vulnerabilities.md). Investigate
   new findings, update dependencies/base packages, and do not claim a clean scan
   when unresolved findings remain.
5. Publish assembles the verified candidates into exact `:1.0.0`. It records the
   manifest/digest in **release-manifest** and the job summary, checks both runtime
   platforms, pulls with an empty credential config and runs post-publication smoke,
   then promotes `:1`, `:1.0`, and `:latest`. Older version reruns preserve newer
   aliases. All aliases resolve to the verified manifest digest. Stable release
   runs serialize repository-wide; there is no unbounded automatic retry.
6. If needed, make the package public and run recovery (below). Verify from a clean
   machine without registry login:

   ```sh
   docker pull ghcr.io/jmdarling/shin-wallslice:1.0.0
   docker buildx imagetools inspect ghcr.io/jmdarling/shin-wallslice:1.0.0
   node scripts/docker-smoke.mjs ghcr.io/jmdarling/shin-wallslice:1.0.0
   node scripts/container-persistence.mjs ghcr.io/jmdarling/shin-wallslice:1.0.0
   ```

7. Download workflow evidence (90-day retention), archive it with the release,
   record the exact digest and scan findings, and replace pending entries in the
   release-note draft with observed results. Include installation links, versions,
   rollback, and compatibility. Do not invent a digest. Check every public raw
   template/icon/profile link anonymously. Then execute [real Unraid verification](../unraid.md)
   and finally [CA submission preparation](community-applications.md). Listing
   approval is outside this version's completion criteria; real image publication
   and the other end-to-end checks are required.

## Failures and exact-artifact recovery

Before exact publication, failures leave stable aliases unchanged.
If parallel jobs race to create the initial GHCR package and one manifest push is
denied, first verify the package is linked to this repository and has Actions
write access. Retry only the failed job with a fresh token after creation; no
exact release tag exists at that point. Do not broaden credentials to bypass a
package ACL failure. Fix the problem
and rerun only after inspecting diagnostics. Candidate tags are unique per run and
attempt. Delete unused candidate package versions only after confirming no release
manifest references them. Never delete an exact release to disguise replacement.

If an exact tag already exists, ordinary publication fails clearly. Copy its digest
from the saved workflow evidence, inspect revision/version, and choose **Release →
Run workflow** on main with `tag=v1.0.0` and `recovery_digest=sha256:…` (replace the
ellipsis with the recorded full digest). The workflow requires it to equal the
existing exact tag, reruns source checks and both native artifact smoke tests/scans,
then repeats anonymous verification and monotonic alias promotion **without rebuilding
or replacing the exact image**. This handles first-package visibility failures and
interrupted alias promotion. A failure during promotion can leave aliases partially
advanced; recovery finishes them. A vulnerability or code defect in an already
published exact release requires a new version; never silently overwrite it.

## Metadata and attestations

```sh
docker image inspect ghcr.io/jmdarling/shin-wallslice:1.0.0 --format '{{json .Config.Labels}}'
docker buildx imagetools inspect ghcr.io/jmdarling/shin-wallslice:1.0.0 --format '{{json .Provenance}}'
docker buildx imagetools inspect ghcr.io/jmdarling/shin-wallslice:1.0.0 --format '{{json .SBOM}}'
```

Prefer `image@sha256:…` using the recorded digest for audit/reproduction. Labels name
source, version, revision, and MIT license. Runtime files include production server
dependencies, compiled server/client, public defaults, gosu, and the entrypoint;
they exclude local JSON, tests, fixtures, source tooling, and package managers.

Official references checked during implementation:
[GHCR](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry),
[image publication](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images),
[multi-platform builds](https://docs.docker.com/build/ci/github-actions/multi-platform/).
