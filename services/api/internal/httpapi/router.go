package httpapi

import (
	"context"
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

type BuildInfo struct {
	Version string
	Commit  string
}

type Dependencies struct {
	Config      config.Config
	Logger      *slog.Logger
	DB          *sql.DB
	ObjectStore storage.ObjectStore
	BuildInfo   BuildInfo
}

type router struct {
	config      config.Config
	logger      *slog.Logger
	db          *sql.DB
	objectStore storage.ObjectStore
	buildInfo   BuildInfo
}

func NewRouter(dependencies Dependencies) http.Handler {
	r := &router{
		config:      dependencies.Config,
		logger:      dependencies.Logger,
		db:          dependencies.DB,
		objectStore: dependencies.ObjectStore,
		buildInfo:   dependencies.BuildInfo,
	}

	mux := http.NewServeMux()

	// Public routes
	mux.HandleFunc("GET /healthz", r.health)
	mux.HandleFunc("GET /readyz", r.ready)
	mux.HandleFunc("GET /api/v1/meta", r.meta)
	mux.HandleFunc("POST /api/v1/auth/login", r.login)

	// Auth required (no family needed)
	mux.Handle("POST /api/v1/family", r.auth(http.HandlerFunc(r.wrapCreateFamily)))
	mux.Handle("POST /api/v1/family/join", r.auth(http.HandlerFunc(r.wrapJoinFamily)))
	mux.Handle("GET /api/v1/families", r.auth(http.HandlerFunc(r.wrapListMyFamilies)))
	mux.Handle("PUT /api/v1/families/active", r.auth(http.HandlerFunc(r.wrapSwitchActiveFamily)))
	mux.Handle("GET /api/v1/invitations/{code}", r.auth(http.HandlerFunc(r.wrapGetInvitationInfo)))

	// Auth + Family required
	mux.Handle("GET /api/v1/family/info", r.authFamily(http.HandlerFunc(r.wrapGetFamily)))
	mux.Handle("PUT /api/v1/family/rename", r.authFamily(http.HandlerFunc(r.wrapRenameFamily)))
	mux.Handle("POST /api/v1/family/invite", r.authFamily(http.HandlerFunc(r.wrapCreateInvitation)))
	mux.Handle("POST /api/v1/family/leave", r.authFamily(http.HandlerFunc(r.wrapLeaveFamily)))
	mux.Handle("PUT /api/v1/family/member/role", r.authFamily(http.HandlerFunc(r.wrapUpdateMemberRole)))
	mux.Handle("DELETE /api/v1/family/member", r.authFamily(http.HandlerFunc(r.wrapRemoveMember)))

	// Ledger
	mux.Handle("GET /api/v1/ledger", r.authFamily(http.HandlerFunc(r.wrapListLedger)))
	mux.Handle("POST /api/v1/ledger", r.authFamily(http.HandlerFunc(r.wrapCreateLedger)))
	mux.Handle("PUT /api/v1/ledger/{id}", r.authFamily(http.HandlerFunc(r.wrapUpdateLedger)))
	mux.Handle("DELETE /api/v1/ledger/{id}", r.authFamily(http.HandlerFunc(r.wrapDeleteLedger)))
	mux.Handle("POST /api/v1/ledger/import", r.authFamily(http.HandlerFunc(r.wrapImportLedger)))
	mux.Handle("POST /api/v1/ledger/import/confirm", r.authFamily(http.HandlerFunc(r.wrapImportLedgerConfirm)))

	// Inventory
	mux.Handle("GET /api/v1/inventory", r.authFamily(http.HandlerFunc(r.wrapListInventory)))
	mux.Handle("POST /api/v1/inventory", r.authFamily(http.HandlerFunc(r.wrapCreateInventory)))
	mux.Handle("DELETE /api/v1/inventory/batch", r.authFamily(http.HandlerFunc(r.wrapDeleteInventoryBatch)))
	mux.Handle("PUT /api/v1/inventory/{id}", r.authFamily(http.HandlerFunc(r.wrapUpdateInventory)))
	mux.Handle("PUT /api/v1/inventory/{id}/status", r.authFamily(http.HandlerFunc(r.wrapUpdateInventoryStatus)))
	mux.Handle("DELETE /api/v1/inventory/{id}", r.authFamily(http.HandlerFunc(r.wrapDeleteInventory)))

	// Dishes
	mux.Handle("GET /api/v1/dishes", r.authFamily(http.HandlerFunc(r.wrapListDishes)))
	mux.Handle("POST /api/v1/dishes", r.authFamily(http.HandlerFunc(r.wrapCreateDish)))
	mux.Handle("PUT /api/v1/dishes/{id}", r.authFamily(http.HandlerFunc(r.wrapUpdateDish)))
	mux.Handle("PUT /api/v1/dishes/{id}/toggle", r.authFamily(http.HandlerFunc(r.wrapToggleDishAvailable)))
	mux.Handle("DELETE /api/v1/dishes/{id}", r.authFamily(http.HandlerFunc(r.wrapDeleteDish)))

	// Orders
	mux.Handle("GET /api/v1/orders", r.authFamily(http.HandlerFunc(r.wrapListOrders)))
	mux.Handle("POST /api/v1/orders", r.authFamily(http.HandlerFunc(r.wrapCreateOrder)))
	mux.Handle("PUT /api/v1/orders/{id}/status", r.authFamily(http.HandlerFunc(r.wrapUpdateOrderStatus)))
	mux.Handle("DELETE /api/v1/orders/{id}", r.authFamily(http.HandlerFunc(r.wrapDeleteOrder)))

	// Locations & Categories
	mux.Handle("GET /api/v1/locations", r.authFamily(http.HandlerFunc(r.wrapListLocations)))
	mux.Handle("POST /api/v1/locations", r.authFamily(http.HandlerFunc(r.wrapCreateLocation)))
	mux.Handle("DELETE /api/v1/locations/{id}", r.authFamily(http.HandlerFunc(r.wrapDeleteLocation)))
	mux.Handle("GET /api/v1/categories", r.authFamily(http.HandlerFunc(r.wrapListCategories)))
	mux.Handle("POST /api/v1/categories", r.authFamily(http.HandlerFunc(r.wrapCreateCategory)))
	mux.Handle("DELETE /api/v1/categories/{id}", r.authFamily(http.HandlerFunc(r.wrapDeleteCategory)))

	// Upload
	mux.Handle("POST /api/v1/upload", r.authFamily(http.HandlerFunc(r.wrapUpload)))
	mux.Handle("POST /api/v1/upload/presign", r.authFamily(http.HandlerFunc(r.wrapUploadPresign)))
	// Uploaded images are public because mini-program Image requests cannot attach
	// the user's Bearer token. Keys are generated randomly and validated by storage.
	mux.HandleFunc("GET /uploads/{path...}", r.serveUpload)

	return r.recoverPanic(r.requestLog(r.securityHeaders(r.cors(mux))))
}

// auth wraps a handler with authentication only.
func (r *router) auth(next http.Handler) http.Handler {
	return r.requireAuth(next)
}

// authFamily wraps with both auth and family check.
func (r *router) authFamily(next http.Handler) http.Handler {
	return r.requireAuth(r.requireFamily(next))
}

// Wrapper functions that adapt handler signatures
func (r *router) wrapCreateFamily(w http.ResponseWriter, req *http.Request) { r.createFamily(w, req) }
func (r *router) wrapJoinFamily(w http.ResponseWriter, req *http.Request)   { r.joinFamily(w, req) }
func (r *router) wrapListMyFamilies(w http.ResponseWriter, req *http.Request) {
	r.listMyFamilies(w, req)
}
func (r *router) wrapSwitchActiveFamily(w http.ResponseWriter, req *http.Request) {
	r.switchActiveFamily(w, req)
}
func (r *router) wrapGetInvitationInfo(w http.ResponseWriter, req *http.Request) {
	r.getInvitationInfo(w, req)
}
func (r *router) wrapGetFamily(w http.ResponseWriter, req *http.Request)    { r.getFamily(w, req) }
func (r *router) wrapRenameFamily(w http.ResponseWriter, req *http.Request) { r.renameFamily(w, req) }
func (r *router) wrapCreateInvitation(w http.ResponseWriter, req *http.Request) {
	r.createInvitation(w, req)
}
func (r *router) wrapLeaveFamily(w http.ResponseWriter, req *http.Request) { r.leaveFamily(w, req) }
func (r *router) wrapUpdateMemberRole(w http.ResponseWriter, req *http.Request) {
	r.updateMemberRole(w, req)
}
func (r *router) wrapRemoveMember(w http.ResponseWriter, req *http.Request)  { r.removeMember(w, req) }
func (r *router) wrapListLedger(w http.ResponseWriter, req *http.Request)    { r.listLedger(w, req) }
func (r *router) wrapCreateLedger(w http.ResponseWriter, req *http.Request)  { r.createLedger(w, req) }
func (r *router) wrapUpdateLedger(w http.ResponseWriter, req *http.Request)  { r.updateLedger(w, req) }
func (r *router) wrapDeleteLedger(w http.ResponseWriter, req *http.Request)  { r.deleteLedger(w, req) }
func (r *router) wrapImportLedger(w http.ResponseWriter, req *http.Request)  { r.importLedger(w, req) }
func (r *router) wrapImportLedgerConfirm(w http.ResponseWriter, req *http.Request) {
	r.importLedgerConfirm(w, req)
}
func (r *router) wrapListInventory(w http.ResponseWriter, req *http.Request) { r.listInventory(w, req) }
func (r *router) wrapCreateInventory(w http.ResponseWriter, req *http.Request) {
	r.createInventory(w, req)
}
func (r *router) wrapUpdateInventory(w http.ResponseWriter, req *http.Request) {
	r.updateInventory(w, req)
}
func (r *router) wrapUpdateInventoryStatus(w http.ResponseWriter, req *http.Request) {
	r.updateInventoryStatus(w, req)
}
func (r *router) wrapDeleteInventory(w http.ResponseWriter, req *http.Request) {
	r.deleteInventory(w, req)
}
func (r *router) wrapDeleteInventoryBatch(w http.ResponseWriter, req *http.Request) {
	r.deleteInventoryBatch(w, req)
}
func (r *router) wrapListDishes(w http.ResponseWriter, req *http.Request) { r.listDishes(w, req) }
func (r *router) wrapCreateDish(w http.ResponseWriter, req *http.Request) { r.createDish(w, req) }
func (r *router) wrapUpdateDish(w http.ResponseWriter, req *http.Request) { r.updateDish(w, req) }
func (r *router) wrapToggleDishAvailable(w http.ResponseWriter, req *http.Request) {
	r.toggleDishAvailable(w, req)
}
func (r *router) wrapDeleteDish(w http.ResponseWriter, req *http.Request)  { r.deleteDish(w, req) }
func (r *router) wrapListOrders(w http.ResponseWriter, req *http.Request)  { r.listOrders(w, req) }
func (r *router) wrapCreateOrder(w http.ResponseWriter, req *http.Request) { r.createOrder(w, req) }
func (r *router) wrapUpdateOrderStatus(w http.ResponseWriter, req *http.Request) {
	r.updateOrderStatus(w, req)
}
func (r *router) wrapDeleteOrder(w http.ResponseWriter, req *http.Request)   { r.deleteOrder(w, req) }
func (r *router) wrapListLocations(w http.ResponseWriter, req *http.Request) { r.listLocations(w, req) }
func (r *router) wrapCreateLocation(w http.ResponseWriter, req *http.Request) {
	r.createLocation(w, req)
}
func (r *router) wrapDeleteLocation(w http.ResponseWriter, req *http.Request) {
	r.deleteLocation(w, req)
}
func (r *router) wrapListCategories(w http.ResponseWriter, req *http.Request) {
	r.listCategories(w, req)
}
func (r *router) wrapCreateCategory(w http.ResponseWriter, req *http.Request) {
	r.createCategory(w, req)
}
func (r *router) wrapDeleteCategory(w http.ResponseWriter, req *http.Request) {
	r.deleteCategory(w, req)
}
func (r *router) wrapUpload(w http.ResponseWriter, req *http.Request)        { r.upload(w, req) }
func (r *router) wrapUploadPresign(w http.ResponseWriter, req *http.Request) { r.uploadPresign(w, req) }

func (r *router) health(response http.ResponseWriter, _ *http.Request) {
	writeJSON(response, http.StatusOK, map[string]string{
		"status":  "ok",
		"service": "youbenpu-api",
	})
}

func (r *router) ready(response http.ResponseWriter, request *http.Request) {
	if r.db == nil {
		r.logger.Error("readiness check failed", "error", "database is not configured")
		writeError(response, http.StatusServiceUnavailable, "DB_UNAVAILABLE", "服务暂未就绪")
		return
	}

	ctx, cancel := context.WithTimeout(request.Context(), 2*time.Second)
	defer cancel()

	if err := r.db.PingContext(ctx); err != nil {
		r.logger.Error("readiness check failed", "error", err)
		writeError(response, http.StatusServiceUnavailable, "DB_UNAVAILABLE", "服务暂未就绪")
		return
	}
	writeJSON(response, http.StatusOK, map[string]string{
		"status":  "ready",
		"service": "youbenpu-api",
	})
}

func (r *router) meta(response http.ResponseWriter, _ *http.Request) {
	writeJSON(response, http.StatusOK, map[string]string{
		"name":        "生活有本谱",
		"api_version": "v1",
		"environment": r.config.Environment,
		"version":     r.buildInfo.Version,
		"commit":      r.buildInfo.Commit,
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
