package httpapi

import (
	"net/http"
	"strings"

	"github.com/zhanghao527/youbenpu/services/api/internal/database"
)

// --- List Items ---

type inventoryItemResponse struct {
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	Category      string  `json:"category"`
	Location      string  `json:"location"`
	QuantityLabel string  `json:"quantity_label"`
	ExpiryDate    *string `json:"expiry_date"`
	Status        string  `json:"status"`
	PhotoURL      *string `json:"photo_url"`
}

func (r *router) listInventory(response http.ResponseWriter, request *http.Request) {
	familyID := getUserFamilyID(request.Context())

	// Optional status filter: ?status=normal,expiring,expired
	statusFilter := request.URL.Query().Get("status")

	var query string
	var args []any

	if statusFilter != "" {
		statuses := strings.Split(statusFilter, ",")
		placeholders := make([]string, len(statuses))
		for i, s := range statuses {
			placeholders[i] = "?"
			args = append(args, strings.TrimSpace(s))
		}
		query = `SELECT id, name, category, location, quantity_label, expiry_date, status, photo_url
			FROM inventory_items WHERE family_id = ? AND status IN (` + strings.Join(placeholders, ",") + `)
			ORDER BY created_at DESC`
		args = append([]any{familyID}, args...)
	} else {
		query = `SELECT id, name, category, location, quantity_label, expiry_date, status, photo_url
			FROM inventory_items WHERE family_id = ?
			ORDER BY created_at DESC`
		args = []any{familyID}
	}

	rows, err := r.db.Query(query, args...)
	if err != nil {
		r.logger.Error("list inventory", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
		return
	}
	defer rows.Close()

	var items []inventoryItemResponse
	for rows.Next() {
		var item inventoryItemResponse
		if err := rows.Scan(&item.ID, &item.Name, &item.Category, &item.Location,
			&item.QuantityLabel, &item.ExpiryDate, &item.Status, &item.PhotoURL); err != nil {
			continue
		}
		items = append(items, item)
	}

	if items == nil {
		items = []inventoryItemResponse{}
	}
	writeJSON(response, http.StatusOK, items)
}

// --- Create Item ---

type createInventoryRequest struct {
	Name          string  `json:"name"`
	Category      string  `json:"category"`
	Location      string  `json:"location"`
	QuantityLabel string  `json:"quantity_label"`
	ExpiryDate    *string `json:"expiry_date"`
	Status        string  `json:"status"`
	PhotoURL      *string `json:"photo_url"`
}

func (r *router) createInventory(response http.ResponseWriter, request *http.Request) {
	familyID := getUserFamilyID(request.Context())

	var body createInventoryRequest
	if err := readJSON(request, &body); err != nil {
		writeError(response, http.StatusBadRequest, "INVALID_REQUEST", "请求格式错误")
		return
	}

	body.Name = strings.TrimSpace(body.Name)
	if body.Name == "" {
		writeError(response, http.StatusBadRequest, "MISSING_NAME", "物品名称不能为空")
		return
	}
	if body.Location == "" {
		writeError(response, http.StatusBadRequest, "MISSING_LOCATION", "存放位置不能为空")
		return
	}
	if body.Category == "" {
		body.Category = "日用品"
	}
	if body.QuantityLabel == "" {
		body.QuantityLabel = "1 件"
	}
	if body.Status == "" {
		body.Status = "normal"
	}

	id := database.NewID()

	_, err := r.db.Exec(`INSERT INTO inventory_items
		(id, family_id, name, category, location, quantity_label, expiry_date, status, photo_url)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, familyID, body.Name, body.Category, body.Location,
		body.QuantityLabel, body.ExpiryDate, body.Status, body.PhotoURL,
	)
	if err != nil {
		r.logger.Error("create inventory item", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "创建失败")
		return
	}

	writeJSON(response, http.StatusCreated, map[string]string{"id": id})
}

// --- Update Item ---

func (r *router) updateInventory(response http.ResponseWriter, request *http.Request) {
	familyID := getUserFamilyID(request.Context())
	id := request.PathValue("id")
	if id == "" {
		writeError(response, http.StatusBadRequest, "MISSING_ID", "缺少物品 ID")
		return
	}

	var existingFamilyID string
	err := r.db.QueryRow("SELECT family_id FROM inventory_items WHERE id = ?", id).Scan(&existingFamilyID)
	if err != nil || existingFamilyID != familyID {
		writeError(response, http.StatusNotFound, "NOT_FOUND", "物品不存在")
		return
	}

	var body createInventoryRequest
	if err := readJSON(request, &body); err != nil {
		writeError(response, http.StatusBadRequest, "INVALID_REQUEST", "请求格式错误")
		return
	}

	body.Name = strings.TrimSpace(body.Name)
	if body.Name == "" {
		writeError(response, http.StatusBadRequest, "MISSING_NAME", "物品名称不能为空")
		return
	}
	if body.Location == "" {
		writeError(response, http.StatusBadRequest, "MISSING_LOCATION", "存放位置不能为空")
		return
	}

	_, err = r.db.Exec(`UPDATE inventory_items SET
		name = ?, category = ?, location = ?, quantity_label = ?,
		expiry_date = ?, status = ?, photo_url = ?
		WHERE id = ? AND family_id = ?`,
		body.Name, body.Category, body.Location, body.QuantityLabel,
		body.ExpiryDate, body.Status, body.PhotoURL,
		id, familyID,
	)
	if err != nil {
		r.logger.Error("update inventory item", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "更新失败")
		return
	}

	writeJSON(response, http.StatusOK, map[string]string{"id": id})
}

// --- Update Status (mark finished/discarded/deleted) ---

type updateStatusRequest struct {
	Status string `json:"status"`
}

func (r *router) updateInventoryStatus(response http.ResponseWriter, request *http.Request) {
	familyID := getUserFamilyID(request.Context())
	id := request.PathValue("id")
	if id == "" {
		writeError(response, http.StatusBadRequest, "MISSING_ID", "缺少物品 ID")
		return
	}

	var body updateStatusRequest
	if err := readJSON(request, &body); err != nil {
		writeError(response, http.StatusBadRequest, "INVALID_REQUEST", "请求格式错误")
		return
	}

	validStatuses := map[string]bool{
		"normal": true, "expiring": true, "expired": true,
		"finished": true, "discarded": true, "deleted": true,
	}
	if !validStatuses[body.Status] {
		writeError(response, http.StatusBadRequest, "INVALID_STATUS", "无效的状态值")
		return
	}

	result, err := r.db.Exec("UPDATE inventory_items SET status = ? WHERE id = ? AND family_id = ?",
		body.Status, id, familyID)
	if err != nil {
		r.logger.Error("update inventory status", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "更新失败")
		return
	}

	affected, _ := result.RowsAffected()
	if affected == 0 {
		writeError(response, http.StatusNotFound, "NOT_FOUND", "物品不存在")
		return
	}

	writeJSON(response, http.StatusOK, map[string]string{"id": id, "status": body.Status})
}

// --- Delete Item (permanent) ---

func (r *router) deleteInventory(response http.ResponseWriter, request *http.Request) {
	familyID := getUserFamilyID(request.Context())
	id := request.PathValue("id")
	if id == "" {
		writeError(response, http.StatusBadRequest, "MISSING_ID", "缺少物品 ID")
		return
	}

	result, err := r.db.Exec("DELETE FROM inventory_items WHERE id = ? AND family_id = ?", id, familyID)
	if err != nil {
		r.logger.Error("delete inventory item", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "删除失败")
		return
	}

	affected, _ := result.RowsAffected()
	if affected == 0 {
		writeError(response, http.StatusNotFound, "NOT_FOUND", "物品不存在")
		return
	}

	writeJSON(response, http.StatusOK, map[string]string{"message": "已删除"})
}
