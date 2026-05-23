#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
H5_DIR="$ROOT_DIR/projects/miniprogram"
DIST_DIR="$H5_DIR/dist"

if [[ -f "$HOME/.env" ]]; then
  set -a
  . "$HOME/.env"
  set +a
fi
if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  . "$ROOT_DIR/.env"
  set +a
fi

COS_BUCKET="${QCLOUD_H5APP_COS_BUCKET:-}"
COS_REGION="${QCLOUD_H5APP_COS_REGION:-}"
COS_ENDPOINT="${QCLOUD_H5APP_COS_ENDPOINT:-}"
SECRET_ID="${QCLOUD_H5APP_COS_SECRET_ID:-${QCLOUD_SECRET_ID:-}}"
SECRET_KEY="${QCLOUD_H5APP_COS_SECRET_KEY:-${QCLOUD_SECRET_KEY:-}}"

if [[ -z "$COS_BUCKET" ]]; then
  echo "QCLOUD_H5APP_COS_BUCKET is required" >&2
  exit 1
fi
if [[ -z "$COS_REGION" && -z "$COS_ENDPOINT" ]]; then
  echo "QCLOUD_H5APP_COS_REGION (or QCLOUD_H5APP_COS_ENDPOINT) is required" >&2
  exit 1
fi
if [[ -z "$SECRET_ID" || -z "$SECRET_KEY" ]]; then
  echo "QCLOUD_SECRET_ID/QCLOUD_SECRET_KEY (or QCLOUD_H5APP_COS_SECRET_ID/QCLOUD_H5APP_COS_SECRET_KEY) is required" >&2
  exit 1
fi

if [[ ! -d "$DIST_DIR" ]]; then
  echo "dist not found: $DIST_DIR (run build:h5 first)" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 not found in PATH" >&2
  exit 1
fi

python3 -m pip show coscmd >/dev/null 2>&1 || python3 -m pip install --user --quiet coscmd
export PATH="$HOME/.local/bin:$PATH"

if ! command -v coscmd >/dev/null 2>&1; then
  echo "coscmd not found after install" >&2
  exit 1
fi

CONFIG_ARGS=(config -a "$SECRET_ID" -s "$SECRET_KEY" -b "$COS_BUCKET")
if [[ -n "$COS_ENDPOINT" ]]; then
  CONFIG_ARGS+=(-e "$COS_ENDPOINT")
else
  CONFIG_ARGS+=(-r "$COS_REGION")
fi
coscmd "${CONFIG_ARGS[@]}"

coscmd upload -rs --delete -f "$DIST_DIR/" /

