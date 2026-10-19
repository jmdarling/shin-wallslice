#!/bin/sh
# Run as PUID:PGID so files written to the output volume get NAS-friendly ownership.
set -eu

PUID="${PUID:-99}"
PGID="${PGID:-100}"
umask "${UMASK:-022}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  chown -R "$PUID:$PGID" "$DATA_DIR"
  # Only the top level of the output share is touched; existing user files are left alone.
  if [ -d "$OUTPUT_DIR" ]; then
    chown "$PUID:$PGID" "$OUTPUT_DIR" 2>/dev/null || true
  fi
  export HOME=/tmp
  exec setpriv --reuid="$PUID" --regid="$PGID" --clear-groups --inh-caps=-all -- "$@"
fi

exec "$@"
