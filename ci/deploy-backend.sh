#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DEPLOY_GIT_PULL="${DEPLOY_GIT_PULL:-true}"
if [[ "${DEPLOY_GIT_PULL}" == "1" || "${DEPLOY_GIT_PULL}" == "true" ]]; then
  if command -v git >/dev/null 2>&1 && git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    if git -C "$ROOT_DIR" diff --quiet && git -C "$ROOT_DIR" diff --cached --quiet; then
      BEFORE_SHA="$(git -C "$ROOT_DIR" rev-parse HEAD)"
      git -C "$ROOT_DIR" pull --ff-only || true
      AFTER_SHA="$(git -C "$ROOT_DIR" rev-parse HEAD)"
      if [[ "${BEFORE_SHA}" != "${AFTER_SHA}" && -z "${DEPLOY_REEXECED:-}" ]]; then
        export DEPLOY_REEXECED=1
        exec bash "$ROOT_DIR/ci/deploy-backend.sh" "$@"
      fi
    else
      echo "git working tree is dirty, skip git pull" >&2
    fi
  fi
fi

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

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found in PATH" >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose plugin not available" >&2
  exit 1
fi

LOCK_DIR="/tmp/bitego-deploy-backend.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "deploy is already running" >&2
  exit 1
fi
trap 'rmdir "$LOCK_DIR" >/dev/null 2>&1 || true' EXIT

SERVER="${QCLOUD_DOCKER_SERVER:-}"
USERNAME="${QCLOUD_DOCKER_USERNAME:-}"
PASSWORD="${QCLOUD_DOCKER_PASSWORD:-}"
IMAGE_BASE="${QCLOUD_DOCKER_IMAGE:-}"
REPO="${QCLOUD_DOCKER_REPOSITORY:-}"

if [[ -z "$IMAGE_BASE" ]]; then
  if [[ -z "$SERVER" || -z "$REPO" ]]; then
    echo "QCLOUD_DOCKER_IMAGE or (QCLOUD_DOCKER_SERVER + QCLOUD_DOCKER_REPOSITORY) is required" >&2
    exit 1
  fi
  IMAGE_BASE="${SERVER}/${REPO}"
fi

TAG="${1:-${DEPLOY_TAG:-latest}}"

if [[ -z "$TAG" ]]; then
  echo "tag is required" >&2
  exit 1
fi

if [[ ! "$TAG" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]]; then
  echo "invalid tag: $TAG" >&2
  exit 1
fi

if [[ -n "$SERVER" && -n "$USERNAME" && -n "$PASSWORD" ]]; then
  echo "$PASSWORD" | docker login "$SERVER" -u "$USERNAME" --password-stdin
fi

export BACKEND_IMAGE="$IMAGE_BASE"
export BACKEND_TAG="$TAG"

docker pull "${BACKEND_IMAGE}:${BACKEND_TAG}" >/dev/null 2>&1 || true

docker compose -f "$ROOT_DIR/docker-compose.yml" pull backend
docker compose -f "$ROOT_DIR/docker-compose.yml" up -d --no-deps backend

HEALTH_URL="${BACKEND_HEALTH_URL:-http://127.0.0.1:3000/health}"
if ! command -v curl >/dev/null 2>&1; then
  echo "curl not found in PATH; cannot verify health: ${HEALTH_URL}" >&2
  docker compose -f "$ROOT_DIR/docker-compose.yml" ps backend >&2 || true
  docker compose -f "$ROOT_DIR/docker-compose.yml" logs --tail=200 backend >&2 || true
  exit 1
fi

for _ in $(seq 1 30); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    exit 0
  fi
  sleep 2
done

echo "health check timeout: ${HEALTH_URL}" >&2
docker compose -f "$ROOT_DIR/docker-compose.yml" ps backend >&2 || true
docker compose -f "$ROOT_DIR/docker-compose.yml" logs --tail=200 backend >&2 || true
exit 1
