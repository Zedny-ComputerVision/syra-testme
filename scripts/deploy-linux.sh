#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

printf '[deploy-linux] Redirecting to scripts/setup-linux.sh --production\n'
exec bash "${SCRIPT_DIR}/setup-linux.sh" "$@" --production
