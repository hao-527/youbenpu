package httpapi

import (
	"crypto/rand"
	"database/sql"
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
	DB          *sql.DB
	ObjectStore storage.ObjectStore
}

type router struct {
	config      config.Config
	logger      *slog.Logger
	db          *sql.DB
	objectStore storage.ObjectStore
}

func NewRouter(dependencies Dependencies) http.Handler {
	r := &router{
		config:      dependencies.Config,
		logger:      dependencies.Logger,
		db:          dependencies.DB,
		objectStore: dependencies.ObjectStore,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", r.health)
	mux.HandleFunc("GET /api/v1/meta", r.meta)
	mux.HandleFunc("POST /api/v1/auth/login", r.login)

	// Routes that need auth but NOT family (creating/joining family)
	authMux := http.NewServeMux()
	authMux.HandleFunc("POST /api/v1/family", r.createFamily)
	authMux.HandleFunc("POST /api/v1/family/join", r.joinFamily)
	mux.Handle("/api/v1/family", r.requireAuth(authMux))
	mux.Handle("/api/v1/family/", r.requireAuth(authMux))

	// Routes that need auth + family
	familyMux := http.NewServeMux()
	familyMux.HandleFunc("GET /api/v1/family/info", r.getFamily)
	familyMux.HandleFunc("PUT /api/v1/family/rename", r.renameFamily)
	familyMux.HandleFunc("POST /api/v1/family/invite", r.createInvitation)
	familyMux.HandleFunc("POST /api/v1/family/leave", r.leaveFamily)
	familyMux.HandleFunc("PUT /api/v1/family/member/role", r.updateMemberRole)
	familyMux.HandleFunc("DELETE /api/v1/family/member", r.removeMember)
	mux.Handle("/api/v1/family/info", r.requireAuth(r.requireFamily(familyMux)))
	mux.Handle("/api/v1/family/rename", r.requireAuth(r.requireFamily(familyMux)))
	mux.Handle("/api/v1/family/invite", r.requireAuth(r.requireFamily(familyMux)))
	mux.Handle("/api/v1/family/leave", r.requireAuth(r.requireFamily(familyMux)))
	mux.Handle("/api/v1/family/member/", r.requireAuth(r.requireFamily(familyMux)))

	// Ledger
	familyMux.HandleFunc("GET /api/v1/ledger", r.listLedger)
	familyMux.HandleFunc("POST /api/v1/ledger", r.createLedger)
	familyMux.HandleFunc("PUT /api/v1/ledger/{id}", r.updateLedger)
	familyMux.HandleFunc("DELETE /api/v1/ledger/{id}", r.deleteLedger)
	mux.Handle("/api/v1/ledger", r.requireAuth(r.requireFamily(familyMux)))
	mux.Handle("/api/v1/ledger/", r.requireAuth(r.requireFamily(familyMux)))

	// Inventory
	familyMux.HandleFunc("GET /api/v1/inventory", r.listInventory)
	familyMux.HandleFunc("POST /api/v1/inventory", r.createInventory)
	familyMux.HandleFunc("PUT /api/v1/inventory/{id}", r.updateInventory)
	familyMux.HandleFunc("PUT /api/v1/inventory/{id}/status", r.updateInventoryStatus)
	familyMux.HandleFunc("DELETE /api/v1/inventory/{id}", r.deleteInventory)
	mux.Handle("/api/v1/inventory", r.requireAuth(r.requireFamily(familyMux)))
	mux.Handle("/api/v1/inventory/", r.requireAuth(r.requireFamily(familyMux)))

	// Dishes
	familyMux.HandleFunc("GET /api/v1/dishes", r.listDishes)
	familyMux.HandleFunc("POST /api/v1/dishes", r.createDish)
	familyMux.HandleFunc("PUT /api/v1/dishes/{id}", r.updateDish)
	familyMux.HandleFunc("PUT /api/v1/dishes/{id}/toggle", r.toggleDishAvailable)
	familyMux.HandleFunc("DELETE /api/v1/dishes/{id}", r.deleteDish)
	mux.Handle("/api/v1/dishes", r.requireAuth(r.requireFamily(familyMux)))
	mux.Handle("/api/v1/dishes/", r.requireAuth(r.requireFamily(familyMux)))

	// Orders
	familyMux.HandleFunc("GET /api/v1/orders", r.listOrders)
	familyMux.HandleFunc("POST /api/v1/orders", r.createOrder)
	familyMux.HandleFunc("PUT /api/v1/orders/{id}/status", r.updateOrderStatus)
	familyMux.HandleFunc("DELETE /api/v1/orders/{id}", r.deleteOrder)
	mux.Handle("/api/v1/orders", r.requireAuth(r.requireFamily(familyMux)))
	mux.Handle("/api/v1/orders/", r.requireAuth(r.requireFamily(familyMux)))

	// Locations
	familyMux.HandleFunc("GET /api/v1/locations", r.listLocations)
	familyMux.HandleFunc("POST /api/v1/locations", r.createLocation)
	familyMux.HandleFunc("DELETE /api/v1/locations/{id}", r.deleteLocation)
	mux.Handle("/api/v1/locations", r.requireAuth(r.requireFamily(familyMux)))
	mux.Handle("/api/v1/locations/", r.requireAuth(r.requireFamily(familyMux)))

	// Custom categories
	familyMux.HandleFunc("GET /api/v1/categories", r.listCategories)
	familyMux.HandleFunc("POST /api/v1/categories", r.createCategory)
	familyMux.HandleFunc("DELETE /api/v1/categories/{id}", r.deleteCategory)
	mux.Handle("/api/v1/categories", r.requireAuth(r.requireFamily(familyMux)))
	mux.Handle("/api/v1/categories/", r.requireAuth(r.requireFamily(familyMux)))

	// Upload (presign for COS direct upload)
	familyMux.HandleFunc("POST /api/v1/upload/presign", r.uploadPresign)
	mux.Handle("/api/v1/upload/", r.requireAuth(r.requireFamily(familyMux)))

	return r.recoverPanic(r.requestLog(r.securityHeaders(r.cors(mux))))
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
