#!/usr/bin/env bash
set -euo pipefail

: "${DB_USER:?DB_USER is required}"
: "${DB_NAME:?DB_NAME is required}"

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/youbenpu}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_PATH="${BACKUP_DIR}/${DB_NAME}-${TIMESTAMP}.sql.gz"
TEMP_PATH="${BACKUP_PATH}.tmp"
CHECKSUM_PATH="${BACKUP_PATH}.sha256"
CHECKSUM_TEMP_PATH="${CHECKSUM_PATH}.tmp"

umask 077
mkdir -p "${BACKUP_DIR}"
trap 'rm -f "${TEMP_PATH}" "${CHECKSUM_TEMP_PATH}"' EXIT

command -v mysqldump >/dev/null 2>&1 || { echo "mysqldump is required" >&2; exit 1; }
command -v gzip >/dev/null 2>&1 || { echo "gzip is required" >&2; exit 1; }
if command -v sha256sum >/dev/null 2>&1; then
  CHECKSUM_TOOL="sha256sum"
elif command -v shasum >/dev/null 2>&1; then
  CHECKSUM_TOOL="shasum"
else
  echo "sha256sum or shasum is required" >&2
  exit 1
fi

MYSQL_PWD="${DB_PASSWORD:-}" mysqldump \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --user="${DB_USER}" \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --events \
  --hex-blob \
  --default-character-set=utf8mb4 \
  "${DB_NAME}" \
  | gzip -9 > "${TEMP_PATH}"

gzip -t "${TEMP_PATH}"
mv "${TEMP_PATH}" "${BACKUP_PATH}"

if [[ "${CHECKSUM_TOOL}" == "sha256sum" ]]; then
  BACKUP_CHECKSUM="$(sha256sum "${BACKUP_PATH}" | awk '{print $1}')"
else
  BACKUP_CHECKSUM="$(shasum -a 256 "${BACKUP_PATH}" | awk '{print $1}')"
fi
if [[ ! "${BACKUP_CHECKSUM}" =~ ^[[:xdigit:]]{64}$ ]]; then
  echo "Failed to calculate a valid SHA-256 checksum" >&2
  exit 1
fi
printf '%s\n' "${BACKUP_CHECKSUM}" > "${CHECKSUM_TEMP_PATH}"
mv "${CHECKSUM_TEMP_PATH}" "${CHECKSUM_PATH}"

find "${BACKUP_DIR}" -type f \( -name "${DB_NAME}-*.sql.gz" -o -name "${DB_NAME}-*.sql.gz.sha256" \) \
  -mtime "+${RETENTION_DAYS}" -delete

echo "Backup created: ${BACKUP_PATH}"
echo "Checksum created: ${CHECKSUM_PATH}"
