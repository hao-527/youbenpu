-- Migration 004: track the source-bill fingerprint of imported ledger entries.
-- This lets bill import (WeChat/Alipay) skip transactions the family already
-- imported, so re-importing an overlapping statement never double-records.
-- NULL for manually created entries. Guards make the migration retryable.

SET @column_exists = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'ledger_entries'
      AND COLUMN_NAME = 'import_fingerprint'
);
SET @migration_sql = IF(
    @column_exists = 0,
    'ALTER TABLE ledger_entries ADD COLUMN import_fingerprint VARCHAR(64) NULL',
    'SELECT 1'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @index_exists = (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'ledger_entries'
      AND INDEX_NAME = 'uk_ledger_import_fingerprint'
);
SET @migration_sql = IF(
    @index_exists = 0,
    'ALTER TABLE ledger_entries ADD UNIQUE KEY uk_ledger_import_fingerprint (family_id, import_fingerprint)',
    'SELECT 1'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;
