package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/zhanghao527/youbenpu/services/api/internal/config"
	"github.com/zhanghao527/youbenpu/services/api/internal/database"
	"github.com/zhanghao527/youbenpu/services/api/internal/httpapi"
	"github.com/zhanghao527/youbenpu/services/api/internal/storage"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))

	cfg, err := config.Load()
	if err != nil {
		logger.Error("load configuration", "error", err)
		os.Exit(1)
	}

	// Database
	db, err := database.Connect(database.Config{
		Host:     cfg.DBHost,
		Port:     cfg.DBPort,
		User:     cfg.DBUser,
		Password: cfg.DBPassword,
		DBName:   cfg.DBName,
	})
	if err != nil {
		logger.Error("connect database", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := database.Migrate(db, logger); err != nil {
		logger.Error("run migrations", "error", err)
		os.Exit(1)
	}

	var objectStore storage.ObjectStore
	if cfg.ObjectStore == "cos" {
		objectStore, err = storage.NewCOSStore(cfg.COSBucket, cfg.COSRegion, cfg.COSSecretID, cfg.COSSecretKey)
	} else {
		objectStore, err = storage.NewLocalStore(cfg.UploadDirectory)
	}
	if err != nil {
		logger.Error("initialize object store", "driver", cfg.ObjectStore, "error", err)
		os.Exit(1)
	}
	logger.Info("object store initialized", "driver", objectStore.Driver())

	handler := httpapi.NewRouter(httpapi.Dependencies{
		Config:      cfg,
		Logger:      logger,
		DB:          db,
		ObjectStore: objectStore,
	})

	server := &http.Server{
		Addr:              cfg.HTTPAddress,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      20 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	shutdownSignal, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	serverErrors := make(chan error, 1)
	go func() {
		serverErrors <- server.ListenAndServe()
	}()

	logger.Info("api listening", "address", cfg.HTTPAddress, "environment", cfg.Environment)
	select {
	case err := <-serverErrors:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("api stopped unexpectedly", "error", err)
			os.Exit(1)
		}
	case <-shutdownSignal.Done():
		logger.Info("shutdown requested")
		ctx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
		defer cancel()

		if err := server.Shutdown(ctx); err != nil {
			logger.Error("graceful shutdown", "error", err)
			if closeErr := server.Close(); closeErr != nil {
				logger.Error("force server close", "error", closeErr)
			}
		}

		if err := <-serverErrors; err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("api stopped unexpectedly", "error", err)
			os.Exit(1)
		}
	}
}
