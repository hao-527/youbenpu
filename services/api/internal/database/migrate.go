package database

import (
	"database/sql"
	"embed"
	"fmt"
	"log/slog"
	"sort"
	"strconv"
	"strings"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// Migrate runs all pending SQL migrations in order.
// Migrations are embedded .sql files named like 001_init.sql, 002_xxx.sql.
// It uses the schema_migrations table to track which have been applied.
func Migrate(db *sql.DB, logger *slog.Logger) error {
	// Ensure schema_migrations table exists (bootstrap)
	_, err := db.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
		version    INT NOT NULL PRIMARY KEY,
		applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
	if err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	// Get current version
	var currentVersion int
	row := db.QueryRow("SELECT COALESCE(MAX(version), 0) FROM schema_migrations")
	if err := row.Scan(&currentVersion); err != nil {
		return fmt.Errorf("read current schema version: %w", err)
	}

	// List migration files
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
		// Extract version from filename: 001_init.sql -> 1
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

	sort.Slice(migrations, func(i, j int) bool {
		return migrations[i].version < migrations[j].version
	})

	// Apply pending migrations
	applied := 0
	for _, m := range migrations {
		if m.version <= currentVersion {
			continue
		}

		content, err := migrationsFS.ReadFile("migrations/" + m.filename)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", m.filename, err)
		}

		// Split by semicolons and execute each statement
		statements := splitStatements(string(content))
		for _, stmt := range statements {
			stmt = strings.TrimSpace(stmt)
			if stmt == "" {
				continue
			}
			if _, err := db.Exec(stmt); err != nil {
				return fmt.Errorf("execute migration %s: %w\nstatement: %s", m.filename, err, truncate(stmt, 200))
			}
		}

		// Record migration (skip if already recorded by the migration itself)
		_, _ = db.Exec("INSERT IGNORE INTO schema_migrations (version) VALUES (?)", m.version)

		logger.Info("migration applied", "version", m.version, "file", m.filename)
		applied++
	}

	if applied == 0 {
		logger.Info("database schema up to date", "version", currentVersion)
	}

	return nil
}

func splitStatements(content string) []string {
	var statements []string
	var current strings.Builder

	for _, line := range strings.Split(content, "\n") {
		trimmed := strings.TrimSpace(line)
		// Skip comments
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

	// Any remaining content
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
