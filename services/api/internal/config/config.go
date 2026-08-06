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

	// Database
	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string

	// WeChat Mini Program
	WXAppID     string
	WXAppSecret string

	// JWT
	JWTSecret string

	// Tencent COS
	COSBucket    string
	COSRegion    string
	COSSecretID  string
	COSSecretKey string
}

func Load() (Config, error) {
	cfg := Config{
		Environment:     envOrDefault("APP_ENV", "development"),
		HTTPAddress:     envOrDefault("HTTP_ADDRESS", defaultHTTPAddress),
		UploadDirectory: envOrDefault("UPLOAD_DIR", defaultUploadDirectory),
		ShutdownTimeout: defaultShutdownTimeout,

		DBHost:     envOrDefault("DB_HOST", "127.0.0.1"),
		DBPort:     envOrDefault("DB_PORT", "3306"),
		DBUser:     envOrDefault("DB_USER", "root"),
		DBPassword: envOrDefault("DB_PASSWORD", ""),
		DBName:     envOrDefault("DB_NAME", "youbenpu"),

		WXAppID:     envOrDefault("WX_APPID", ""),
		WXAppSecret: envOrDefault("WX_APP_SECRET", ""),

		JWTSecret: envOrDefault("JWT_SECRET", "youbenpu-dev-secret-change-me"),

		COSBucket:    envOrDefault("COS_BUCKET", "shenghuoyoubenpu-1410259056"),
		COSRegion:    envOrDefault("COS_REGION", "ap-beijing"),
		COSSecretID:  envOrDefault("COS_SECRET_ID", ""),
		COSSecretKey: envOrDefault("COS_SECRET_KEY", ""),
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
