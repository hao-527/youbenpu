package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net/http"
	"runtime/debug"
	"time"

	"github.com/zhanghao527/youbenpu/services/api/internal/config"
	"github.com/zhanghao527/youbenpu/services/api/internal/storage"
)

type Dependencies struct {
	Config      config.Config
	Logger      *slog.Logger
	ObjectStore storage.ObjectStore
}

type router struct {
	config      config.Config
	logger      *slog.Logger
	objectStore storage.ObjectStore
}

func NewRouter(dependencies Dependencies) http.Handler {
	r := &router{
		config:      dependencies.Config,
		logger:      dependencies.Logger,
		objectStore: dependencies.ObjectStore,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", r.health)
	mux.HandleFunc("GET /api/v1/meta", r.meta)

	return r.recoverPanic(r.requestLog(r.securityHeaders(mux)))
}

func (r *router) health(response http.ResponseWriter, _ *http.Request) {
	writeJSON(response, http.StatusOK, map[string]string{
		"status":  "ok",
		"service": "youbenpu-api",
	})
}

func (r *router) meta(response http.ResponseWriter, _ *http.Request) {
	writeJSON(response, http.StatusOK, map[string]string{
		"name":                "生活有本谱",
		"api_version":         "v1",
		"environment":         r.config.Environment,
		"object_store_driver": r.objectStore.Driver(),
	})
}

func (r *router) securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		response.Header().Set("X-Content-Type-Options", "nosniff")
		response.Header().Set("Referrer-Policy", "no-referrer")
		response.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(response, request)
	})
}

func (r *router) requestLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		startedAt := time.Now()
		requestID := newRequestID()
		response.Header().Set("X-Request-ID", requestID)

		next.ServeHTTP(response, request)
		r.logger.Info("http request",
			"request_id", requestID,
			"method", request.Method,
			"path", request.URL.Path,
			"duration_ms", time.Since(startedAt).Milliseconds(),
		)
	})
}

func (r *router) recoverPanic(next http.Handler) http.Handler {
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		defer func() {
			if recovered := recover(); recovered != nil {
				r.logger.Error("panic recovered", "panic", recovered, "stack", string(debug.Stack()))
				writeError(response, http.StatusInternalServerError, "INTERNAL_ERROR", "服务暂时不可用")
			}
		}()
		next.ServeHTTP(response, request)
	})
}

func newRequestID() string {
	var value [8]byte
	if _, err := rand.Read(value[:]); err != nil {
		return time.Now().UTC().Format("20060102150405.000000000")
	}
	return hex.EncodeToString(value[:])
}
