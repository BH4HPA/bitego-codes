#!/usr/bin/env bash
set -euo pipefail

SERVER="${QCLOUD_DOCKER_SERVER:-}"
USERNAME="${QCLOUD_DOCKER_USERNAME:-}"
PASSWORD="${QCLOUD_DOCKER_PASSWORD:-}"
IMAGE_BASE="${QCLOUD_DOCKER_IMAGE:-}"
REPO="${QCLOUD_DOCKER_REPOSITORY:-}"

if [[ -z "$SERVER" ]]; then
  echo "QCLOUD_DOCKER_SERVER is required" >&2
  exit 1
fi
if [[ -z "$USERNAME" ]]; then
  echo "QCLOUD_DOCKER_USERNAME is required" >&2
  exit 1
fi
if [[ -z "$PASSWORD" ]]; then
  echo "QCLOUD_DOCKER_PASSWORD is required" >&2
  exit 1
fi

if [[ -z "$IMAGE_BASE" ]]; then
  if [[ -z "$REPO" ]]; then
    echo "QCLOUD_DOCKER_REPOSITORY is required (or set QCLOUD_DOCKER_IMAGE)" >&2
    exit 1
  fi
  IMAGE_BASE="${SERVER}/${REPO}"
fi

TAG="${1:-}"
if [[ -z "$TAG" ]]; then
  echo "Usage: bash ci/push-backend-image.sh <tag>" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found in PATH" >&2
  exit 1
fi

IMAGE_REF="${IMAGE_BASE}:${TAG}"

echo "Docker login: ${SERVER}"
echo "$PASSWORD" | docker login "$SERVER" -u "$USERNAME" --password-stdin

echo "Pushing image: ${IMAGE_REF}"
docker push "${IMAGE_REF}"

if [[ "${PUSH_LATEST:-}" == "1" || "${PUSH_LATEST:-}" == "true" ]]; then
  LATEST_REF="${IMAGE_BASE}:latest"
  docker tag "${IMAGE_REF}" "${LATEST_REF}"
  echo "Pushing image: ${LATEST_REF}"
  docker push "${LATEST_REF}"
fi

echo "Pushed: ${IMAGE_REF}"
