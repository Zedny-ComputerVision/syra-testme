#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
BACKEND_ENV="${REPO_ROOT}/backend/.env.docker"
FRONTEND_ENV="${REPO_ROOT}/frontend/.env.production"
COMPOSE_FILES=(-f "${REPO_ROOT}/docker-compose.yml")

log() {
  printf '[deploy-linux] %s\n' "$*"
}

die() {
  printf '[deploy-linux] %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

ensure_linux() {
  [[ "$(uname -s)" == "Linux" ]] || die "This script is intended for Linux."
}

ensure_docker() {
  require_command docker
  docker compose version >/dev/null 2>&1 || die "Docker Compose plugin is required."
  docker info >/dev/null 2>&1 || die "Docker daemon is not reachable. Start Docker and try again."
}

ensure_file() {
  local file="$1"
  [[ -f "$file" ]] || die "Missing required file: $file"
}

compose() {
  docker compose "${COMPOSE_FILES[@]}" "$@"
}

set_env_value() {
  local file="$1"
  local key="$2"
  local value="$3"
  local tmp_file
  tmp_file="$(mktemp)"
  awk -v key="$key" -v value="$value" '
    BEGIN { found = 0 }
    index($0, key "=") == 1 {
      print key "=" value
      found = 1
      next
    }
    { print }
    END {
      if (!found) {
        print key "=" value
      }
    }
  ' "$file" >"$tmp_file"
  mv "$tmp_file" "$file"
}

generate_secret() {
  printf '%s%s\n' "$(tr -d '-' </proc/sys/kernel/random/uuid)" "$(tr -d '-' </proc/sys/kernel/random/uuid)"
}

read_env_value() {
  local file="$1"
  local key="$2"
  awk -F= -v key="$key" 'index($0, key "=") == 1 { sub(/^[^=]*=/, "", $0); print; exit }' "$file"
}

ensure_backend_env_sane() {
  local jwt_secret
  jwt_secret="$(read_env_value "$BACKEND_ENV" "JWT_SECRET")"
  if [[ -z "$jwt_secret" || "$jwt_secret" == "local-dev-secret-with-at-least-32-chars" ]]; then
    jwt_secret="$(generate_secret)"
    set_env_value "$BACKEND_ENV" "JWT_SECRET" "$jwt_secret"
    log "Generated a persistent JWT_SECRET in backend/.env.docker."
  fi

  set_env_value "$BACKEND_ENV" "PRECHECK_ALLOW_TEST_BYPASS" "false"
}

seed_login_users() {
  if [[ "$SEED_LOGIN_USERS" != "1" ]]; then
    log "Skipping login user seed because SYRA_SEED_LOGIN_USERS=${SEED_LOGIN_USERS}."
    return
  fi

  log "Ensuring login users exist in the configured database."
  compose run --rm -T \
    -v "${REPO_ROOT}/backend/scripts:/app/scripts:ro" \
    -e SYRA_RESET_LOGIN_PASSWORDS="$RESET_LOGIN_PASSWORDS" \
    -e SYRA_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    -e SYRA_INSTRUCTOR_PASSWORD="$INSTRUCTOR_PASSWORD" \
    -e SYRA_STUDENT_PASSWORD="$STUDENT_PASSWORD" \
    backend python scripts/ensure_login_users.py
}

wait_for_service_health() {
  local service="$1"
  local timeout_seconds="${2:-900}"
  local interval_seconds=5
  local elapsed=0
  local container_id
  local status

  container_id="$(compose ps -q "$service")"
  [[ -n "$container_id" ]] || die "Could not determine container id for service: $service"

  while (( elapsed < timeout_seconds )); do
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)"
    case "$status" in
      healthy)
        log "Service '$service' is healthy."
        return 0
        ;;
      unhealthy|exited|dead)
        docker logs --tail 120 "$container_id" >&2 || true
        die "Service '$service' became $status."
        ;;
    esac
    sleep "$interval_seconds"
    elapsed=$((elapsed + interval_seconds))
  done

  docker logs --tail 120 "$container_id" >&2 || true
  die "Timed out waiting for service '$service' to become healthy."
}

require_http_200() {
  local url="$1"
  local label="$2"
  local timeout_seconds="${3:-30}"
  local status

  status="$(curl --silent --show-error --location --max-time "$timeout_seconds" --output /dev/null --write-out '%{http_code}' "$url" || true)"
  [[ "$status" == "200" ]] || die "${label} check failed for ${url} (status ${status:-unreachable})."
  log "${label} check passed (${url})."
}

ensure_linux
ensure_docker
ensure_file "$BACKEND_ENV"
ensure_file "$FRONTEND_ENV"

ensure_backend_env_sane

SEED_LOGIN_USERS="${SYRA_SEED_LOGIN_USERS:-0}"
RESET_LOGIN_PASSWORDS="${SYRA_RESET_LOGIN_PASSWORDS:-1}"
ADMIN_PASSWORD="${SYRA_ADMIN_PASSWORD:-Admin1234!}"
INSTRUCTOR_PASSWORD="${SYRA_INSTRUCTOR_PASSWORD:-Instructor1234!}"
STUDENT_PASSWORD="${SYRA_STUDENT_PASSWORD:-Student1234!}"

frontend_url="$(read_env_value "$BACKEND_ENV" "FRONTEND_BASE_URL")"
backend_url="$(read_env_value "$BACKEND_ENV" "BACKEND_BASE_URL")"

[[ -n "$frontend_url" ]] || frontend_url="http://localhost"
[[ -n "$backend_url" ]] || backend_url="${frontend_url%/}/api"

api_health_url="${backend_url%/}/health"
db_health_url="${backend_url%/}/health/db"
login_url="${frontend_url%/}/login"

log "Deploying production stack with Docker Compose."
(
  cd "$REPO_ROOT"
  compose up --build -d --remove-orphans
)

wait_for_service_health backend
seed_login_users
wait_for_service_health frontend

require_http_200 "$frontend_url" "Frontend"
require_http_200 "$api_health_url" "API health"
require_http_200 "$db_health_url" "API DB health"

cat <<EOF

App: ${frontend_url}
Login: ${login_url}
API health: ${api_health_url}
DB health: ${db_health_url}

Stack status:
EOF

(
  cd "$REPO_ROOT"
  compose ps
)
