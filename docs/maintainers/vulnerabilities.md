# Container vulnerability review

Scan date: October 20, 2026. Release-candidate scans remain authoritative for the
published artifact; a local image scan is preliminary and is recorded separately.
Full JSON reports retain every severity, including unfixed advisories. The workflow
blocks HIGH/CRITICAL vulnerabilities with available fixes. Unfixed reports remain
visible and need explicit explanation in release notes; a successful gate does not
mean zero vulnerabilities.

## Fixes applied before release

The initial Node 24 Bookworm-based scan reported a fixable `@fastify/static`
route-guard bypass (CVE-2026-15074) and available Perl base-package fixes.
Updated `@fastify/static` to a patched 10.1.1-compatible release and changed all
Docker stages to Node 24 **Trixie slim**, with available runtime package upgrades
installed at build time. This also addresses several util-linux findings whose
fixes are available in Debian Trixie. Package managers are removed from the runtime.
No Node.js major-version or application API change is intended.

References: [Fastify advisory](https://github.com/fastify/fastify-static/security/advisories/GHSA-83w8-p2f5-377r),
[Debian util-linux assessment](https://security-tracker.debian.org/tracker/CVE-2026-53613),
[Debian zlib assessment](https://security-tracker.debian.org/tracker/CVE-2023-45853).

## Remaining findings

The preliminary Trixie ARM64 scan with Trivy **0.76.0** found **0 CRITICAL,
43 HIGH, 58 MEDIUM, 60 LOW, and 1 UNKNOWN** package/advisory instances. Those 43
HIGH instances represent the eight unique advisories below; none had a reported
fixed version in this distribution. No Node-package vulnerability was reported.
The raw local report is `/tmp/wallslice-trivy-arm64-patched.json`; published release
jobs retain their own complete JSON reports as artifacts. Final artifact IDs and
rescan results belong in [the evidence ledger](v1.0.0-evidence.md).

| Advisory                                                                     | Affected package family                                                                          | Assessment and mitigation                                                                                                                         |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| [CVE-2025-69720](https://security-tracker.debian.org/tracker/CVE-2025-69720) | libtinfo6, ncurses-base, ncurses-bin                                                             | ncurses terminal parsing; the HTTP service does not provide an interactive terminal.                                                              |
| [CVE-2026-16742](https://security-tracker.debian.org/tracker/CVE-2026-16742) | libsystemd0, libudev1                                                                            | systemd-homed privilege escalation; no systemd/homed service runs in this image.                                                                  |
| [CVE-2026-54369](https://security-tracker.debian.org/tracker/CVE-2026-54369) | libacl1                                                                                          | libacl symlink traversal; the app does not invoke ACL-management utilities. The initializer uses fixed paths and rejects linked preference files. |
| [CVE-2026-76642](https://security-tracker.debian.org/tracker/CVE-2026-76642) | bsdutils, libblkid1, liblastlog2-2, libmount1, libsmartcols1, libuuid1, login, mount, util-linux | External mount helper post-hooks; the app does not invoke mount helpers.                                                                          |
| [CVE-2026-78408](https://security-tracker.debian.org/tracker/CVE-2026-78408) | bsdutils, libblkid1, liblastlog2-2, libmount1, libsmartcols1, libuuid1, login, mount, util-linux | nsenter cgroup authority; the app does not invoke nsenter or manage cgroups.                                                                      |
| [CVE-2026-78409](https://security-tracker.debian.org/tracker/CVE-2026-78409) | bsdutils, libblkid1, liblastlog2-2, libmount1, libsmartcols1, libuuid1, login, mount, util-linux | Mount subdirectory symlink resolution; no mount-management API is exposed.                                                                        |
| [CVE-2026-78410](https://security-tracker.debian.org/tracker/CVE-2026-78410) | bsdutils, libblkid1, liblastlog2-2, libmount1, libsmartcols1, libuuid1, login, mount, util-linux | Restricted bind-mount path race; the app does not create bind mounts.                                                                             |
| [CVE-2026-9538](https://security-tracker.debian.org/tracker/CVE-2026-9538)   | perl-base                                                                                        | Perl Archive::Tar denial of service; the app uses Sharp and JavaScript ZIP processing, with no Perl/tar API.                                      |

The runtime strips setuid/setgid bits from system executables, so the non-root
application cannot use setuid mount/login utilities to elevate privileges. The
assessments above describe observed application use and deployment boundaries;
they are not upstream fixes or a guarantee against all exploit chains. Monitor
Debian updates and rebuild a new release when fixes become available. The full
report preserves lower-severity findings for review as well.

The application runs as non-root, processes files locally, and provides no shell,
mount-management, or system-login API. This limits the exposure of base-system
utilities; it does not prove every OS advisory is unreachable. Never enable
privileged mode or expose the unauthenticated application directly to the internet.
The Unraid initializer runs only briefly and changes ownership of the dedicated
appdata root/preferences before dropping privileges. Reassess findings if this
boundary or runtime capabilities change. Rebuild a new version for newly available
fixes; do not replace an already published exact tag.
