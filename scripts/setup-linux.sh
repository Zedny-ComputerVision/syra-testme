#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
BACKEND_ENV="${REPO_ROOT}/backend/.env.docker"
BACKEND_ENV_EXAMPLE="${REPO_ROOT}/backend/.env.docker.example"
FRONTEND_ENV="${REPO_ROOT}/frontend/.env.production"
FRONTEND_ENV_EXAMPLE="${REPO_ROOT}/frontend/.env.production.example"
COMPOSE_FILES=(-f "${REPO_ROOT}/docker-compose.yml" -f "${REPO_ROOT}/docker-compose.local-db.yml")
PREPARE_ONLY=0

usage() {
  cat <<'EOF'
Usage: bash scripts/setup-linux.sh [--prepare-only]

Prepares a Linux Docker stack for local development:
- creates backend/.env.docker if missing
- creates frontend/.env.production if missing
- creates backend/storage if missing
- starts frontend, backend, and a local PostgreSQL container
- seeds a large demo dataset after the backend becomes healthy

Environment overrides:
- SYRA_DATABASE_URL
- SYRA_POSTGRES_PASSWORD
- SYRA_JWT_SECRET
- SYRA_FRONTEND_URL
- SYRA_BACKEND_URL
- SYRA_CORS_ORIGINS
- SYRA_NGINX_CLIENT_MAX_BODY_SIZE
- SYRA_SEED_DEMO_DATA=0 to skip automatic seeding
- SYRA_SEED_FORCE=1 to append another seeded batch even if users already exist
EOF
}

log() {
  printf '[setup-linux] %s\n' "$*"
}

die() {
  printf '[setup-linux] %s\n' "$*" >&2
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
  local source_file="$1"
  local target_file="$2"
  if [[ -f "$target_file" ]]; then
    return
  fi
  [[ -f "$source_file" ]] || die "Missing example file: $source_file"
  cp "$source_file" "$target_file"
}

compose() {
  POSTGRES_PASSWORD="$POSTGRES_PASSWORD" docker compose "${COMPOSE_FILES[@]}" "$@"
}

generate_secret() {
  printf '%s%s\n' "$(tr -d '-' </proc/sys/kernel/random/uuid)" "$(tr -d '-' </proc/sys/kernel/random/uuid)"
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
        docker logs --tail 80 "$container_id" >&2 || true
        die "Service '$service' became $status."
        ;;
    esac
    sleep "$interval_seconds"
    elapsed=$((elapsed + interval_seconds))
  done

  docker logs --tail 80 "$container_id" >&2 || true
  die "Timed out waiting for service '$service' to become healthy."
}

seed_demo_data() {
  if [[ "$SEED_DEMO_DATA" != "1" ]]; then
    log "Skipping demo seed because SYRA_SEED_DEMO_DATA=${SEED_DEMO_DATA}."
    return
  fi

  log "Seeding demo data."
  if [[ "$SEED_FORCE" == "1" ]]; then
    compose run --rm -T -v "${REPO_ROOT}/backend/scripts:/app/scripts:ro" backend python scripts/seed_mass_data.py --force
  else
    compose run --rm -T -v "${REPO_ROOT}/backend/scripts:/app/scripts:ro" backend python scripts/seed_mass_data.py
  fi
}

for arg in "$@"; do
  case "$arg" in
    --prepare-only)
      PREPARE_ONLY=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown argument: $arg"
      ;;
  esac
done

ensure_linux
ensure_docker

POSTGRES_PASSWORD="${SYRA_POSTGRES_PASSWORD:-syra-local-password}"
JWT_SECRET="${SYRA_JWT_SECRET:-$(generate_secret)}"
FRONTEND_URL="${SYRA_FRONTEND_URL:-http://localhost}"
BACKEND_URL="${SYRA_BACKEND_URL:-http://localhost/api}"
CORS_ORIGINS="${SYRA_CORS_ORIGINS:-http://localhost}"
DATABASE_URL="${SYRA_DATABASE_URL:-postgresql+psycopg://syra:${POSTGRES_PASSWORD}@db:5432/syra_lms}"
NGINX_CLIENT_MAX_BODY_SIZE="${SYRA_NGINX_CLIENT_MAX_BODY_SIZE:-512m}"
SEED_DEMO_DATA="${SYRA_SEED_DEMO_DATA:-1}"
SEED_FORCE="${SYRA_SEED_FORCE:-0}"

ensure_file "$BACKEND_ENV_EXAMPLE" "$BACKEND_ENV"
ensure_file "$FRONTEND_ENV_EXAMPLE" "$FRONTEND_ENV"

set_env_value "$BACKEND_ENV" "DATABASE_URL" "$DATABASE_URL"
set_env_value "$BACKEND_ENV" "JWT_SECRET" "$JWT_SECRET"
set_env_value "$BACKEND_ENV" "FRONTEND_BASE_URL" "$FRONTEND_URL"
set_env_value "$BACKEND_ENV" "BACKEND_BASE_URL" "$BACKEND_URL"
set_env_value "$BACKEND_ENV" "CORS_ORIGINS" "$CORS_ORIGINS"
set_env_value "$BACKEND_ENV" "MEDIA_STORAGE_PROVIDER" "local"
set_env_value "$BACKEND_ENV" "PROCTORING_VIDEO_STORAGE_PROVIDER" "local"
set_env_value "$BACKEND_ENV" "WORKERS" "2"

set_env_value "$FRONTEND_ENV" "VITE_API_BASE_URL" "/api/"
set_env_value "$FRONTEND_ENV" "NGINX_CLIENT_MAX_BODY_SIZE" "$NGINX_CLIENT_MAX_BODY_SIZE"

mkdir -p \
  "${REPO_ROOT}/backend/storage" \
  "${REPO_ROOT}/backend/storage/videos" \
  "${REPO_ROOT}/backend/storage/evidence" \
  "${REPO_ROOT}/backend/storage/identity" \
  "${REPO_ROOT}/backend/storage/reports" \
  "${REPO_ROOT}/backend/storage/video_chunks"

if [[ "$PREPARE_ONLY" -eq 1 ]]; then
  log "Prepared env files and storage directories."
  exit 0
fi

log "Starting frontend, backend, and local PostgreSQL with Docker Compose."
(
  cd "$REPO_ROOT"
  compose up --build -d
)

wait_for_service_health backend
seed_demo_data
wait_for_service_health frontend

log "Stack started."
(
  cd "$REPO_ROOT"
  compose ps
)

API_HEALTH_URL="${BACKEND_URL%/}"
if [[ "$API_HEALTH_URL" == */api ]]; then
  API_HEALTH_URL="${API_HEALTH_URL}/health"
else
  API_HEALTH_URL="${API_HEALTH_URL}/api/health"
fi

cat <<EOF

App: ${FRONTEND_URL}
API health: ${API_HEALTH_URL}

Demo credentials:
  admin@example.com / Admin1234!
  instructor@example.com / Instructor1234!
  student1@example.com / Student1234!
  student2@example.com / Student1234!

Stop the stack with:
  docker compose -f docker-compose.yml -f docker-compose.local-db.yml down
EOF
