#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/projects/backend"

if [[ ! -d "$BACKEND_DIR" ]]; then
  echo "backend dir not found: $BACKEND_DIR" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found in PATH" >&2
  exit 1
fi

SERVER="${QCLOUD_DOCKER_SERVER:-}"
IMAGE_BASE="${QCLOUD_DOCKER_IMAGE:-}"
REPO="${QCLOUD_DOCKER_REPOSITORY:-}"

if [[ -z "$IMAGE_BASE" ]]; then
  if [[ -z "$SERVER" ]]; then
    echo "QCLOUD_DOCKER_SERVER is required (or set QCLOUD_DOCKER_IMAGE)" >&2
    exit 1
  fi
  if [[ -z "$REPO" ]]; then
    echo "QCLOUD_DOCKER_REPOSITORY is required (or set QCLOUD_DOCKER_IMAGE)" >&2
    exit 1
  fi
  IMAGE_BASE="${SERVER}/${REPO}"
fi

TAG="${1:-}"
if [[ -z "$TAG" ]]; then
  if [[ -n "${CI_COMMIT_SHORT_SHA:-}" ]]; then
    TAG="$CI_COMMIT_SHORT_SHA"
  elif [[ -n "${GITHUB_SHA:-}" ]]; then
    TAG="${GITHUB_SHA:0:7}"
  elif command -v git >/dev/null 2>&1 && git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    TAG="$(git -C "$ROOT_DIR" rev-parse --short HEAD)"
  else
    TAG="$(date +%Y%m%d%H%M%S)"
  fi
fi

PLATFORM_ARGS=()
if [[ -n "${DOCKER_PLATFORM:-}" ]]; then
  PLATFORM_ARGS+=(--platform "$DOCKER_PLATFORM")
fi

IMAGE_REF="${IMAGE_BASE}:${TAG}"
echo "Building backend image: ${IMAGE_REF}"
docker build "${PLATFORM_ARGS[@]}" -t "${IMAGE_REF}" -f "${BACKEND_DIR}/Dockerfile" "${BACKEND_DIR}"

echo "Built: ${IMAGE_REF}"
