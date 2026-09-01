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
	defaultJWTSecret       = "youbenpu-dev-secret-change-me"
)

type Config struct {
	Environment     string
	HTTPAddress     string
	ObjectStore     string
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
		Environment:     strings.ToLower(envOrDefault("APP_ENV", "development")),
		HTTPAddress:     envOrDefault("HTTP_ADDRESS", defaultHTTPAddress),
		ObjectStore:     strings.ToLower(envOrDefault("OBJECT_STORE", "local")),
		UploadDirectory: envOrDefault("UPLOAD_DIR", defaultUploadDirectory),
		ShutdownTimeout: defaultShutdownTimeout,

		DBHost:     envOrDefault("DB_HOST", "127.0.0.1"),
		DBPort:     envOrDefault("DB_PORT", "3306"),
		DBUser:     envOrDefault("DB_USER", "root"),
		DBPassword: envOrDefault("DB_PASSWORD", ""),
		DBName:     envOrDefault("DB_NAME", "youbenpu"),

		WXAppID:     envOrDefault("WX_APPID", ""),
		WXAppSecret: envOrDefault("WX_APP_SECRET", ""),

		JWTSecret: envOrDefault("JWT_SECRET", defaultJWTSecret),

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

	if cfg.Environment != "development" && cfg.Environment != "test" && cfg.Environment != "production" {
		return Config{}, fmt.Errorf("APP_ENV must be development, test or production")
	}
	if !strings.HasPrefix(cfg.HTTPAddress, ":") && !strings.Contains(cfg.HTTPAddress, ":") {
		return Config{}, fmt.Errorf("HTTP_ADDRESS must be in host:port or :port form")
	}
	if cfg.ShutdownTimeout <= 0 {
		return Config{}, fmt.Errorf("SHUTDOWN_TIMEOUT must be greater than zero")
	}
	if cfg.ObjectStore != "local" && cfg.ObjectStore != "cos" {
		return Config{}, fmt.Errorf("OBJECT_STORE must be local or cos")
	}
	if cfg.ObjectStore == "cos" && (cfg.COSBucket == "" || cfg.COSRegion == "" || cfg.COSSecretID == "" || cfg.COSSecretKey == "") {
		return Config{}, fmt.Errorf("COS_BUCKET, COS_REGION, COS_SECRET_ID and COS_SECRET_KEY are required when OBJECT_STORE=cos")
	}
	if (cfg.WXAppID == "") != (cfg.WXAppSecret == "") {
		return Config{}, fmt.Errorf("WX_APPID and WX_APP_SECRET must be configured together")
	}
	if cfg.Environment == "production" {
		if cfg.JWTSecret == defaultJWTSecret || len([]byte(cfg.JWTSecret)) < 32 {
			return Config{}, fmt.Errorf("JWT_SECRET must be a strong value of at least 32 bytes in production")
		}
		if cfg.WXAppID == "" || cfg.WXAppSecret == "" {
			return Config{}, fmt.Errorf("WX_APPID and WX_APP_SECRET are required in production")
		}
	}

	return cfg, nil
}

func envOrDefault(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}
