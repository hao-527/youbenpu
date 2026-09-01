#!/usr/bin/env bash
set -euo pipefail

: "${DB_USER:?DB_USER is required}"
: "${DB_NAME:?DB_NAME is required}"
: "${BACKUP_FILE:?BACKUP_FILE is required}"

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
CHECKSUM_FILE="${CHECKSUM_FILE:-${BACKUP_FILE}.sha256}"
EXPECTED_CONFIRMATION="restore-${DB_NAME}"

if [[ "${CONFIRM_RESTORE:-}" != "${EXPECTED_CONFIRMATION}" ]]; then
  echo "Restore is destructive. Set CONFIRM_RESTORE=${EXPECTED_CONFIRMATION} to continue." >&2
  exit 2
fi
if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "Backup file not found: ${BACKUP_FILE}" >&2
  exit 1
fi
if [[ ! -f "${CHECKSUM_FILE}" && "${ALLOW_MISSING_CHECKSUM:-0}" != "1" ]]; then
  echo "Checksum file not found: ${CHECKSUM_FILE}" >&2
  echo "Set ALLOW_MISSING_CHECKSUM=1 only after independently verifying the backup." >&2
  exit 1
fi

command -v mysql >/dev/null 2>&1 || { echo "mysql client is required" >&2; exit 1; }
command -v gzip >/dev/null 2>&1 || { echo "gzip is required" >&2; exit 1; }

if [[ -f "${CHECKSUM_FILE}" ]]; then
  CHECKSUM_LINE_COUNT="$(awk 'NF { count++ } END { print count + 0 }' "${CHECKSUM_FILE}")"
  if [[ "${CHECKSUM_LINE_COUNT}" != "1" ]]; then
    echo "Checksum file must contain exactly one non-empty entry: ${CHECKSUM_FILE}" >&2
    exit 1
  fi

  EXPECTED_CHECKSUM="$(awk 'NF { print $1 }' "${CHECKSUM_FILE}")"
  if [[ ! "${EXPECTED_CHECKSUM}" =~ ^[[:xdigit:]]{64}$ ]]; then
    echo "Checksum file does not contain a valid SHA-256 digest: ${CHECKSUM_FILE}" >&2
    exit 1
  fi
  EXPECTED_CHECKSUM="$(printf '%s' "${EXPECTED_CHECKSUM}" | tr '[:upper:]' '[:lower:]')"

  if command -v sha256sum >/dev/null 2>&1; then
    ACTUAL_CHECKSUM="$(sha256sum "${BACKUP_FILE}" | awk '{print $1}')"
  elif command -v shasum >/dev/null 2>&1; then
    ACTUAL_CHECKSUM="$(shasum -a 256 "${BACKUP_FILE}" | awk '{print $1}')"
  else
    echo "sha256sum or shasum is required to verify the backup" >&2
    exit 1
  fi

  if [[ "${ACTUAL_CHECKSUM}" != "${EXPECTED_CHECKSUM}" ]]; then
    echo "Checksum mismatch for selected backup: ${BACKUP_FILE}" >&2
    exit 1
  fi
  echo "Checksum verified: ${BACKUP_FILE}"
fi
gzip -t "${BACKUP_FILE}"

echo "Restoring ${BACKUP_FILE} into ${DB_HOST}:${DB_PORT}/${DB_NAME}"
gzip -dc "${BACKUP_FILE}" | MYSQL_PWD="${DB_PASSWORD:-}" mysql \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --user="${DB_USER}" \
  --default-character-set=utf8mb4 \
  "${DB_NAME}"

echo "Restore completed. Run application readiness and data smoke checks before reopening traffic."
