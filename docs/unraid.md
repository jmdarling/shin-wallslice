# Install on Unraid 7.2.3

The public image supports Linux amd64 and arm64. Community Applications listing is
pending; the supplied template supports installation now, before listing approval.
See [v1.0.0 release evidence](maintainers/v1.0.0-evidence.md) for the tested image,
scans, and the real-NAS checks that still need developer verification.

## Import and install

Enable Docker in Settings. Open the Unraid web terminal
and paste these two commands (no Git, Node.js, image build, or XML editing):

```sh
mkdir -p /boot/config/plugins/dockerMan/templates-user
curl --fail --location https://raw.githubusercontent.com/jmdarling/shin-wallslice/main/templates/shin-wallslice.xml --output /boot/config/plugins/dockerMan/templates-user/my-shin-wallslice.xml
```

Go to **Docker → Add Container**, choose **shin-wallslice** from user templates,
check the dedicated appdata path, and click **Apply**. Default host port is 8080;
change it if occupied. Container port stays 3000. Open the container's **WebUI**
(`http://YOUR_UNRAID_IP:8080/`, substituting your server's LAN address), then enable
**Autostart** on the Docker tab. Once approved for Apps, search for shin-wallslice
there and install using the same choices.

Allow 4 GiB application RAM and 4 GiB free temporary disk storage. The default
writable container layer holds `/tmp/shin-wallslice`. A dedicated scratch bind mount
is optional; prepare it for UID/GID 1000 separately. Do not mount a small RAM-backed
`/tmp` without budgeting its memory. Only preferences persist under `/data`; images
and exports expire and disappear on restart/replacement. Download them first.

Use a trusted LAN: single-user shared preferences, no built-in login. Optional AI is
off. No other service container is required for ordinary processing.

## Identity and first-run permissions

The image defaults to `USER node` (1000:1000), suitable for Docker named volumes.
Unraid's template includes `--user=0:0` solely to run the image's startup initializer
on a freshly created host bind directory. It changes only the `/data` mount root
(owner 1000:1000, mode 750) and the existing `preferences.json` (mode 640), without
recursion. It rejects symbolic links and multiply linked preference files, then
`exec gosu 1000:1000` starts Node as non-root PID 1. Privileged mode is off. There
are no PUID/PGID settings. Do not override the entrypoint.

Map a dedicated application directory, never `/mnt/user`, the appdata share root,
or a directory shared with another application. Existing UID/GID 1000 preferences
remain usable without migration. Restored preference files are repaired by this
same bounded initializer. Other files and unrelated host paths are untouched.
Custom data paths require their own permissions; initialization always targets
`/data` only. `scripts/container-persistence.mjs` verifies a root-owned 0755 fresh
bind directory, PID 1 identity, named volumes, and replacement persistence.

## Advanced configuration

Ordinary installation requires no JSON mount. In **Advanced View**, the template
includes blank **AI API base URL**, **AI model**, and masked **AI token** fields.
Leave these blank with **enable AI** set to `false` for local processing. To enable
AI, fill in your real service URL ending in `/v1`, its vision model identifier, and
an optional bearer token, then set **enable AI** to `true` and Apply. No manually
added variables are needed.

Blank URL/model fields preserve JSON/default settings in image **1.0.1 or later**;
nonempty invalid values still fail startup, and enabled AI needs both URL and model.
A blank token clears any JSON token; fill in the token field if your service needs
one. Existing installations should update the image before using the new template.
Re-run the import commands above to refresh the available user template; existing
saved container templates may retain their old fields. Preserve your port/appdata
mappings and private settings when selecting the refreshed template.

Alternatively mount a pre-existing readable partial JSON file to
`/config/config.json`, Read Only. Keep secrets private. Defaults, selected JSON,
and environment precedence follow the [configuration reference](../README.md#configuration).
Unraid environment values are stored in its saved template: protect flash backups.

## Operate, update, and roll back

Use the container menu for logs and restart; health normally becomes `healthy`
within 30 seconds. Check in the terminal:

```sh
curl --fail http://127.0.0.1:8080/api/health
docker inspect --format '{{.State.Health.Status}}' shin-wallslice
docker logs --tail 50 shin-wallslice
```

The supplied repository tracks major alias `:1`. **Check for Updates**, then
**Update**, replaces the container using the saved mappings. Publication makes an
update available; it never installs an update on your server automatically.
Restart alone does not load a new image. Preserve appdata during replacement.

For pinning or rollback, edit **Repository** to
`ghcr.io/jmdarling/shin-wallslice:1.0.0` (or another verified exact release), Apply,
and retain the same `/data` mapping. Download active work and back up
`preferences.json` plus private configuration first. Restore backups while stopped.
Removing the container should retain appdata; deleting appdata removes preferences.
See [backup and removal](../README.md#back-up-and-restore).

## Actual NAS verification

The developer reports that the initial NAS test worked and all functionality
passed. This environment has no direct NAS access; use this checklist to verify
changes on **real Unraid 7.2.3**, using a dedicated appdata directory, and record results in
[verification evidence](maintainers/v1.0.0-evidence.md):

- Import template, select it, Apply with normal port/path choices; no permission repair.
- Record Unraid version, CPU architecture, date, and
  `docker inspect --format '{{json .RepoDigests}}' ghcr.io/jmdarling/shin-wallslice:1`.
- Open WebUI; health is healthy; verify non-root Node with
  `docker exec shin-wallslice sh -c 'sed -n "/^Uid:/p" /proc/1/status'` (1000).
- Upload a still PNG/JPEG/WebP, adjust framing, render, download a PNG and ZIP.
  Check each device's dimensions and matching archive contents.
- Enable OLEDify and choose an anchor/threshold, then restart. Preferences return;
  temporary images do not.
- Replace/update the container retaining the same appdata. Preferences still return.
- Try another host port, autostart, exact-version pinning, and rollback when a prior
  compatible public version exists. Confirm saved appdata survives.

Record failures and observations; container simulation does not count as this test.
