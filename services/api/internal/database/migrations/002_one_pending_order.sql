-- Migration 002: enforce at most one pending order per family on MySQL 5.7.
-- The information_schema guards make this migration retryable if DDL succeeds
-- but recording schema_migrations is interrupted.

SET @column_exists = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'meal_orders'
      AND COLUMN_NAME = 'pending_family_id'
);
SET @migration_sql = IF(
    @column_exists = 0,
    'ALTER TABLE meal_orders ADD COLUMN pending_family_id VARCHAR(36) GENERATED ALWAYS AS (CASE WHEN status = ''pending'' THEN family_id ELSE NULL END) STORED',
    'SELECT 1'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @index_exists = (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'meal_orders'
      AND INDEX_NAME = 'uk_orders_one_pending'
);
SET @migration_sql = IF(
    @index_exists = 0,
    'ALTER TABLE meal_orders ADD UNIQUE KEY uk_orders_one_pending (pending_family_id)',
    'SELECT 1'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;
