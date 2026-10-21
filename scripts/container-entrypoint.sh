#!/bin/sh
set -eu
# Docker named volumes work directly as node. Unraid starts this initializer
# with --user 0:0 because Docker cannot set ownership on a new host bind mount.
if [ "$(id -u)" = 0 ]; then
  if [ -L /data ] || [ ! -d /data ]; then
    echo 'Data initialization error: /data must be a real dedicated directory' >&2
    exit 1
  fi
  # Never recurse or follow links. Only the mount root and our one persistent file.
  chown --no-dereference 1000:1000 /data
  chmod 750 /data
  if [ -e /data/preferences.json ] || [ -L /data/preferences.json ]; then
    if [ -L /data/preferences.json ] || [ ! -f /data/preferences.json ] || [ "$(stat -c %h /data/preferences.json)" != 1 ]; then
      echo 'Data initialization error: preferences.json must be a regular file with one link' >&2
      exit 1
    fi
    chown --no-dereference 1000:1000 /data/preferences.json
    chmod 640 /data/preferences.json
  fi
  exec gosu 1000:1000 "$@"
fi
exec "$@"
