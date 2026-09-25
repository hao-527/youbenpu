-- Migration 005: mark whether a ledger entry counts toward income/expense
-- totals. Imported bill rows that were recorded for traceability but did not
-- move money (closed/unpaid orders, deposit freeze/unfreeze, neutral transfers)
-- set this to 0; refunds are recorded as income with this = 1 so they offset
-- the original expense. Manual entries and all existing rows default to 1.
-- Guard makes the migration retryable.

SET @column_exists = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'ledger_entries'
      AND COLUMN_NAME = 'counts_toward_total'
);
SET @migration_sql = IF(
    @column_exists = 0,
    'ALTER TABLE ledger_entries ADD COLUMN counts_toward_total TINYINT(1) NOT NULL DEFAULT 1',
    'SELECT 1'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;
