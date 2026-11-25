#!/usr/bin/env bash
# Builds the Breakthroughs app's Home preview for web and copies it to src/apppreview/ (served at /apppreview/).
# Usage: scripts/sync-app-preview.sh [path-to-breakthroughs-flutter-checkout]
set -euo pipefail
APP_DIR="${1:-../../Flutter/breakthroughs-flutter-journey-segments}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$HERE/src/apppreview"
( cd "$APP_DIR" && flutter build web --target lib/main_preview.dart --base-href /apppreview/ --release )
find "$OUT" -mindepth 1 ! -name README.md -delete
cp -R "$APP_DIR/build/web/." "$OUT/"
echo "App preview copied to $OUT"
