#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
exec docker compose --project-name "${SUBBOOST_COMPOSE_PROJECT:-subboost}" \
  --env-file "${SUBBOOST_ENV_FILE:-.env}" \
  -f docker-compose.yml -f docker-compose.tunnel.yml "$@"
