package database

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"log/slog"
	"sort"
	"strconv"
	"strings"
)

const migrationLockName = "youbenpu_schema_migrations"

//go:embed migrations/*.sql
var migrationsFS embed.FS

// Migrate runs all pending SQL migrations in order while holding a MySQL
// advisory lock. Each migration is written to be idempotent because MySQL 5.7
// implicitly commits DDL even when it is executed through sql.Tx.
func Migrate(db *sql.DB, logger *slog.Logger) error {
	ctx := context.Background()
	conn, err := db.Conn(ctx)
	if err != nil {
		return fmt.Errorf("acquire migration connection: %w", err)
	}
	defer conn.Close()

	var lockAcquired int
	if err := conn.QueryRowContext(ctx, "SELECT GET_LOCK(?, 30)", migrationLockName).Scan(&lockAcquired); err != nil {
		return fmt.Errorf("acquire migration lock: %w", err)
	}
	if lockAcquired != 1 {
		return fmt.Errorf("acquire migration lock: timed out")
	}
	defer func() {
		var released sql.NullInt64
		if err := conn.QueryRowContext(context.Background(), "SELECT RELEASE_LOCK(?)", migrationLockName).Scan(&released); err != nil {
			logger.Error("release migration lock", "error", err)
			return
		}
		if !released.Valid || released.Int64 != 1 {
			logger.Error("release migration lock", "result", released)
		}
	}()

	_, err = conn.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		version    INT NOT NULL PRIMARY KEY,
		applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
	if err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	var currentVersion int
	if err := conn.QueryRowContext(ctx, "SELECT COALESCE(MAX(version), 0) FROM schema_migrations").Scan(&currentVersion); err != nil {
		return fmt.Errorf("read current schema version: %w", err)
	}

	entries, err := migrationsFS.ReadDir("migrations")
	if err != nil {
		return fmt.Errorf("read migrations dir: %w", err)
	}

	type migration struct {
		version  int
		filename string
	}
	var migrations []migration
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		parts := strings.SplitN(entry.Name(), "_", 2)
		if len(parts) < 2 {
			continue
		}
		version, err := strconv.Atoi(parts[0])
		if err != nil {
			continue
		}
		migrations = append(migrations, migration{version: version, filename: entry.Name()})
	}
	sort.Slice(migrations, func(i, j int) bool { return migrations[i].version < migrations[j].version })

	applied := 0
	for _, migration := range migrations {
		if migration.version <= currentVersion {
			continue
		}
		content, err := migrationsFS.ReadFile("migrations/" + migration.filename)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", migration.filename, err)
		}
		if err := applyMigration(ctx, conn, migration.version, migration.filename, string(content)); err != nil {
			return err
		}
		logger.Info("migration applied", "version", migration.version, "file", migration.filename)
		currentVersion = migration.version
		applied++
	}

	if applied == 0 {
		logger.Info("database schema up to date", "version", currentVersion)
	}
	return nil
}

func applyMigration(ctx context.Context, conn *sql.Conn, version int, filename, content string) error {
	tx, err := conn.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin migration %s: %w", filename, err)
	}
	defer tx.Rollback()

	for _, statement := range splitStatements(content) {
		statement = strings.TrimSpace(statement)
		if statement == "" {
			continue
		}
		if _, err := tx.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("execute migration %s: %w\nstatement: %s", filename, err, truncate(statement, 200))
		}
	}

	if _, err := tx.ExecContext(ctx, "INSERT INTO schema_migrations (version) VALUES (?)", version); err != nil {
		return fmt.Errorf("record migration %s: %w", filename, err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit migration %s: %w", filename, err)
	}
	return nil
}

func splitStatements(content string) []string {
	var statements []string
	var current strings.Builder
	for _, line := range strings.Split(content, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "--") {
			continue
		}
		current.WriteString(line)
		current.WriteString("\n")
		if strings.HasSuffix(trimmed, ";") {
			statements = append(statements, current.String())
			current.Reset()
		}
	}
	if remaining := strings.TrimSpace(current.String()); remaining != "" {
		statements = append(statements, remaining)
	}
	return statements
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
