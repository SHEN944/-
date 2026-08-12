#!/usr/bin/env bash
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bash "$ROOT_DIR/scripts/preview-stop.sh" 2>/dev/null || true
sleep 1
PORT=${1:-${TRAVEL_PREVIEW_PORT:-8000}}
bash "$ROOT_DIR/scripts/preview-start.sh" "$PORT"
