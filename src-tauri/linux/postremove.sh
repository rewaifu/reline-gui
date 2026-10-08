#!/bin/sh
# Remove the heavy dependency folders (reline_ws and the app-managed uv_bin)
# when the package is uninstalled. Runs as root, so it locates the invoking
# user's home via $SUDO_USER and falls back to scanning /home. Logs and the
# rest of the data directory are intentionally left in place.
#
# This script is shared by the .deb (postrm) and .rpm (%postun) packages.
# Both are also invoked during upgrades, so only act on a real removal:
#   - deb postrm  -> $1 == "remove" | "purge"
#   - rpm %postun -> $1 == "0" (no versions left) or empty
case "$1" in
  remove|purge|0|"") ;;
  *) exit 0 ;;
esac

remove_for_home() {
  base="$1/.local/share/reline-configurator"
  rm -rf "$base/reline_ws" "$base/uv_bin"
}

homes=""

if [ -n "$SUDO_USER" ] && [ "$SUDO_USER" != "root" ]; then
  home="$(getent passwd "$SUDO_USER" | cut -d: -f6)"
  [ -n "$home" ] && homes="$home"
fi

if [ -z "$homes" ]; then
  for d in /home/*; do
    [ -d "$d" ] && homes="$homes $d"
  done
fi

for home in $homes; do
  remove_for_home "$home"
done

exit 0
