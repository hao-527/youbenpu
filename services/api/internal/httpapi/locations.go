package httpapi

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"

	"github.com/zhanghao527/youbenpu/services/api/internal/database"
)

// --- List Locations ---

type locationResponse struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

func (r *router) listLocations(response http.ResponseWriter, request *http.Request) {
	familyID := getUserFamilyID(request.Context())

	rows, err := r.db.Query("SELECT id, name FROM locations WHERE family_id = ? ORDER BY created_at", familyID)
	if err != nil {
		r.logger.Error("list locations", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
		return
	}
	defer rows.Close()

	var locations []locationResponse
	for rows.Next() {
		var l locationResponse
		if err := rows.Scan(&l.ID, &l.Name); err != nil {
			r.logger.Error("scan location", "error", err)
			writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
			return
		}
		locations = append(locations, l)
	}
	if err := rows.Err(); err != nil {
		r.logger.Error("iterate locations", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
		return
	}

	if locations == nil {
		locations = []locationResponse{}
	}
	writeJSON(response, http.StatusOK, locations)
}

// --- Create Location ---

type createLocationRequest struct {
	Name string `json:"name"`
}

func (r *router) createLocation(response http.ResponseWriter, request *http.Request) {
	familyID := getUserFamilyID(request.Context())

	var body createLocationRequest
	if err := readJSON(request, &body); err != nil {
		writeError(response, http.StatusBadRequest, "INVALID_REQUEST", "请求格式错误")
		return
	}

	body.Name = strings.TrimSpace(body.Name)
	if body.Name == "" {
		writeError(response, http.StatusBadRequest, "MISSING_NAME", "位置名称不能为空")
		return
	}
	if len([]rune(body.Name)) > 20 {
		writeError(response, http.StatusBadRequest, "NAME_TOO_LONG", "位置名称最多 20 字")
		return
	}

	id := database.NewID()
	result, err := r.db.Exec("INSERT INTO locations (id, family_id, name) VALUES (?, ?, ?)", id, familyID, body.Name)
	if err != nil {
		if strings.Contains(err.Error(), "Duplicate") {
			writeError(response, http.StatusConflict, "DUPLICATE", "该位置已存在")
			return
		}
		r.logger.Error("create location", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "创建失败")
		return
	}
	if affected, err := result.RowsAffected(); err != nil || affected != 1 {
		r.logger.Error("read created location rows", "affected", affected, "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "创建失败")
		return
	}

	writeJSON(response, http.StatusCreated, map[string]string{"id": id, "name": body.Name})
}

// --- Delete Location ---

func (r *router) deleteLocation(response http.ResponseWriter, request *http.Request) {
	familyID := getUserFamilyID(request.Context())
	id := request.PathValue("id")
	if id == "" {
		writeError(response, http.StatusBadRequest, "MISSING_ID", "缺少位置 ID")
		return
	}

	var locationName string
	err := r.db.QueryRow("SELECT name FROM locations WHERE id = ? AND family_id = ?", id, familyID).Scan(&locationName)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(response, http.StatusNotFound, "NOT_FOUND", "位置不存在")
		return
	}
	if err != nil {
		r.logger.Error("find location", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
		return
	}

	var usageCount int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM inventory_items
		WHERE family_id = ? AND location = ? AND status NOT IN ('finished','discarded','deleted')`,
		familyID, locationName).Scan(&usageCount); err != nil {
		r.logger.Error("check location usage", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
		return
	}

	if usageCount > 0 {
		writeError(response, http.StatusConflict, "IN_USE", "还有物品存放在该位置，无法删除")
		return
	}

	result, err := r.db.Exec("DELETE FROM locations WHERE id = ? AND family_id = ?", id, familyID)
	if err != nil {
		r.logger.Error("delete location", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "删除失败")
		return
	}
	affected, err := result.RowsAffected()
	if err != nil {
		r.logger.Error("read deleted location rows", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "删除失败")
		return
	}
	if affected == 0 {
		writeError(response, http.StatusNotFound, "NOT_FOUND", "位置不存在")
		return
	}
	writeJSON(response, http.StatusOK, map[string]string{"message": "已删除"})
}

// --- List Categories ---

type categoryResponse struct {
	ID     string `json:"id"`
	Domain string `json:"domain"`
	Name   string `json:"name"`
}

func (r *router) listCategories(response http.ResponseWriter, request *http.Request) {
	familyID := getUserFamilyID(request.Context())
	domain := request.URL.Query().Get("domain") // "dish" or "inventory" or empty for all

	if domain != "" && domain != "dish" && domain != "inventory" {
		writeError(response, http.StatusBadRequest, "INVALID_DOMAIN", "domain 必须为 dish 或 inventory")
		return
	}

	var query string
	var args []any
	if domain != "" {
		query = "SELECT id, domain, name FROM custom_categories WHERE family_id = ? AND domain = ? ORDER BY created_at"
		args = []any{familyID, domain}
	} else {
		query = "SELECT id, domain, name FROM custom_categories WHERE family_id = ? ORDER BY domain, created_at"
		args = []any{familyID}
	}

	rows, err := r.db.Query(query, args...)
	if err != nil {
		r.logger.Error("list categories", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
		return
	}
	defer rows.Close()

	var categories []categoryResponse
	for rows.Next() {
		var c categoryResponse
		if err := rows.Scan(&c.ID, &c.Domain, &c.Name); err != nil {
			r.logger.Error("scan category", "error", err)
			writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
			return
		}
		categories = append(categories, c)
	}
	if err := rows.Err(); err != nil {
		r.logger.Error("iterate categories", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
		return
	}

	if categories == nil {
		categories = []categoryResponse{}
	}
	writeJSON(response, http.StatusOK, categories)
}

// --- Create Category ---

type createCategoryRequest struct {
	Domain string `json:"domain"` // "dish" or "inventory"
	Name   string `json:"name"`
}

func (r *router) createCategory(response http.ResponseWriter, request *http.Request) {
	familyID := getUserFamilyID(request.Context())

	var body createCategoryRequest
	if err := readJSON(request, &body); err != nil {
		writeError(response, http.StatusBadRequest, "INVALID_REQUEST", "请求格式错误")
		return
	}

	body.Name = strings.TrimSpace(body.Name)
	if body.Name == "" {
		writeError(response, http.StatusBadRequest, "MISSING_NAME", "分类名称不能为空")
		return
	}
	if len([]rune(body.Name)) > 10 {
		writeError(response, http.StatusBadRequest, "NAME_TOO_LONG", "分类名称最多 10 字")
		return
	}
	if body.Domain != "dish" && body.Domain != "inventory" {
		writeError(response, http.StatusBadRequest, "INVALID_DOMAIN", "domain 必须为 dish 或 inventory")
		return
	}

	id := database.NewID()
	result, err := r.db.Exec("INSERT INTO custom_categories (id, family_id, domain, name) VALUES (?, ?, ?, ?)",
		id, familyID, body.Domain, body.Name)
	if err != nil {
		if strings.Contains(err.Error(), "Duplicate") {
			writeError(response, http.StatusConflict, "DUPLICATE", "该分类已存在")
			return
		}
		r.logger.Error("create category", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "创建失败")
		return
	}
	if affected, err := result.RowsAffected(); err != nil || affected != 1 {
		r.logger.Error("read created category rows", "affected", affected, "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "创建失败")
		return
	}

	writeJSON(response, http.StatusCreated, map[string]string{"id": id, "domain": body.Domain, "name": body.Name})
}

// --- Delete Category ---

func (r *router) deleteCategory(response http.ResponseWriter, request *http.Request) {
	familyID := getUserFamilyID(request.Context())
	id := request.PathValue("id")
	if id == "" {
		writeError(response, http.StatusBadRequest, "MISSING_ID", "缺少分类 ID")
		return
	}

	var domain, name string
	err := r.db.QueryRow("SELECT domain, name FROM custom_categories WHERE id = ? AND family_id = ?", id, familyID).Scan(&domain, &name)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(response, http.StatusNotFound, "NOT_FOUND", "分类不存在")
		return
	}
	if err != nil {
		r.logger.Error("find category", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
		return
	}

	var usageCount int
	if domain == "dish" {
		err = r.db.QueryRow("SELECT COUNT(*) FROM dishes WHERE family_id = ? AND category = ?", familyID, name).Scan(&usageCount)
	} else {
		err = r.db.QueryRow(`SELECT COUNT(*) FROM inventory_items WHERE family_id = ? AND category = ? AND status != 'deleted'`,
			familyID, name).Scan(&usageCount)
	}
	if err != nil {
		r.logger.Error("check category usage", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
		return
	}

	if usageCount > 0 {
		writeError(response, http.StatusConflict, "IN_USE", "还有项目在使用该分类，无法删除")
		return
	}

	result, err := r.db.Exec("DELETE FROM custom_categories WHERE id = ? AND family_id = ?", id, familyID)
	if err != nil {
		r.logger.Error("delete category", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "删除失败")
		return
	}
	affected, err := result.RowsAffected()
	if err != nil {
		r.logger.Error("read deleted category rows", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "删除失败")
		return
	}
	if affected == 0 {
		writeError(response, http.StatusNotFound, "NOT_FOUND", "分类不存在")
		return
	}
	writeJSON(response, http.StatusOK, map[string]string{"message": "已删除"})
}
