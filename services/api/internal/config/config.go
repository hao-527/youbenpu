package config

import (
	"fmt"
	"os"
	"strings"
	"time"
)

const (
	defaultHTTPAddress     = ":8080"
	defaultUploadDirectory = "./data/uploads"
	defaultShutdownTimeout = 10 * time.Second
)

type Config struct {
	Environment     string
	HTTPAddress     string
	UploadDirectory string
	ShutdownTimeout time.Duration
}

func Load() (Config, error) {
	cfg := Config{
		Environment:     envOrDefault("APP_ENV", "development"),
		HTTPAddress:     envOrDefault("HTTP_ADDRESS", defaultHTTPAddress),
		UploadDirectory: envOrDefault("UPLOAD_DIR", defaultUploadDirectory),
		ShutdownTimeout: defaultShutdownTimeout,
	}

	if value := strings.TrimSpace(os.Getenv("SHUTDOWN_TIMEOUT")); value != "" {
		duration, err := time.ParseDuration(value)
		if err != nil {
			return Config{}, fmt.Errorf("parse SHUTDOWN_TIMEOUT: %w", err)
		}
		cfg.ShutdownTimeout = duration
	}

	if !strings.HasPrefix(cfg.HTTPAddress, ":") && !strings.Contains(cfg.HTTPAddress, ":") {
		return Config{}, fmt.Errorf("HTTP_ADDRESS must be in host:port or :port form")
	}
	if cfg.ShutdownTimeout <= 0 {
		return Config{}, fmt.Errorf("SHUTDOWN_TIMEOUT must be greater than zero")
	}

	return cfg, nil
}

func envOrDefault(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}
