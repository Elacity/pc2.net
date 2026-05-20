#!/usr/bin/env bash
# verify-pssh-libav.sh — operator smoke check for CENC PSSH discoverability
#
# Runs ffprobe against an init.mp4 (local file or URL) and asserts that
# libav exposes an "Encryption initialization data" side-data entry on at
# least one stream. Pass/fail is the meaningful signal.
#
# Usage:
#   verify-pssh-libav.sh <init.mp4|URL>
#
# Env vars:
#   FFPROBE       Absolute path to ffprobe (overrides everything).
#   FFMPEG_PREFIX ffmpeg install prefix; the script appends /bin/ffprobe.
#                 Useful for local dev with a non-system build.
#
# Resolution order: $FFPROBE → $FFMPEG_PREFIX/bin/ffprobe → which ffprobe.
#
# Tracked: .cursor/tasks/MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE.

set -u

if [ "$#" -lt 1 ]; then
  echo "usage: $0 <init.mp4|URL>" >&2
  exit 2
fi

input="$1"

if [ -n "${FFPROBE:-}" ]; then
  probe="$FFPROBE"
elif [ -n "${FFMPEG_PREFIX:-}" ]; then
  probe="$FFMPEG_PREFIX/bin/ffprobe"
else
  probe="$(command -v ffprobe || true)"
fi

if [ -z "$probe" ] || [ ! -x "$probe" ]; then
  echo "ffprobe not found. Set FFPROBE or FFMPEG_PREFIX, or install ffmpeg." >&2
  exit 2
fi

out=$("$probe" -hide_banner -of json -show_entries stream_side_data_list -i "$input" 2>/dev/null) || {
  echo "FAIL: ffprobe failed to open $input" >&2
  exit 1
}

if echo "$out" | grep -q '"side_data_type": "Encryption initialization data"'; then
  echo "PASS: encryption init info present on at least one stream"
  echo "  probe: $probe"
  echo "  input: $input"
  exit 0
fi

echo "FAIL: no encryption side-data found"
echo "  probe: $probe"
echo "  input: $input"
echo "  ffprobe JSON:"
echo "$out" | sed 's/^/    /'
exit 1
