package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/zhanghao527/youbenpu/services/api/internal/database"
)

// --- List Dishes ---

type dishResponse struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Category    string   `json:"category"`
	Method      string   `json:"method"`
	Ingredients []string `json:"ingredients"`
	PhotoURL    *string  `json:"photo_url"`
	Available   bool     `json:"available"`
}

func (r *router) listDishes(response http.ResponseWriter, request *http.Request) {
	familyID := getUserFamilyID(request.Context())

	rows, err := r.db.Query(`SELECT id, name, category, method, ingredients_json, photo_url, available
		FROM dishes WHERE family_id = ? ORDER BY created_at DESC`, familyID)
	if err != nil {
		r.logger.Error("list dishes", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
		return
	}
	defer rows.Close()

	var dishes []dishResponse
	for rows.Next() {
		var d dishResponse
		var ingredientsJSON []byte
		var photoURL *string
		if err := rows.Scan(&d.ID, &d.Name, &d.Category, &d.Method, &ingredientsJSON, &photoURL, &d.Available); err != nil {
			r.logger.Error("scan dish", "error", err)
			writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
			return
		}
		d.PhotoURL = photoURL
		if ingredientsJSON != nil {
			if err := json.Unmarshal(ingredientsJSON, &d.Ingredients); err != nil {
				r.logger.Error("decode dish ingredients", "error", err, "dish_id", d.ID)
				writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
				return
			}
		}
		if d.Ingredients == nil {
			d.Ingredients = []string{}
		}
		dishes = append(dishes, d)
	}
	if err := rows.Err(); err != nil {
		r.logger.Error("iterate dishes", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
		return
	}

	if dishes == nil {
		dishes = []dishResponse{}
	}
	writeJSON(response, http.StatusOK, dishes)
}

// --- Create Dish ---

type createDishRequest struct {
	Name        string   `json:"name"`
	Category    string   `json:"category"`
	Method      string   `json:"method"`
	Ingredients []string `json:"ingredients"`
	PhotoURL    *string  `json:"photo_url"`
}

func (r *router) createDish(response http.ResponseWriter, request *http.Request) {
	familyID := getUserFamilyID(request.Context())

	var body createDishRequest
	if err := readJSON(request, &body); err != nil {
		writeError(response, http.StatusBadRequest, "INVALID_REQUEST", "请求格式错误")
		return
	}

	body.Name = strings.TrimSpace(body.Name)
	if validation := validateDishRequest(&body); validation != nil {
		writeError(response, http.StatusBadRequest, validation.code, validation.message)
		return
	}

	// Check for duplicate name in same family
	var exists int
	if err := r.db.QueryRow("SELECT COUNT(*) FROM dishes WHERE family_id = ? AND LOWER(name) = LOWER(?)",
		familyID, body.Name).Scan(&exists); err != nil {
		r.logger.Error("check duplicate dish", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
		return
	}
	if exists > 0 {
		writeError(response, http.StatusConflict, "DUPLICATE_NAME", "已有同名菜品")
		return
	}

	id := database.NewID()
	ingredientsJSON, _ := json.Marshal(body.Ingredients)

	_, err := r.db.Exec(`INSERT INTO dishes
		(id, family_id, name, category, method, ingredients_json, photo_url, available)
		VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
		id, familyID, body.Name, body.Category, body.Method, ingredientsJSON, body.PhotoURL,
	)
	if err != nil {
		r.logger.Error("create dish", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "创建失败")
		return
	}

	writeJSON(response, http.StatusCreated, map[string]string{"id": id})
}

// --- Update Dish ---

func (r *router) updateDish(response http.ResponseWriter, request *http.Request) {
	familyID := getUserFamilyID(request.Context())
	id := request.PathValue("id")
	if id == "" {
		writeError(response, http.StatusBadRequest, "MISSING_ID", "缺少菜品 ID")
		return
	}

	var existingFamilyID string
	err := r.db.QueryRow("SELECT family_id FROM dishes WHERE id = ?", id).Scan(&existingFamilyID)
	if err != nil || existingFamilyID != familyID {
		writeError(response, http.StatusNotFound, "NOT_FOUND", "菜品不存在")
		return
	}

	var body createDishRequest
	if err := readJSON(request, &body); err != nil {
		writeError(response, http.StatusBadRequest, "INVALID_REQUEST", "请求格式错误")
		return
	}

	if validation := validateDishRequest(&body); validation != nil {
		writeError(response, http.StatusBadRequest, validation.code, validation.message)
		return
	}

	// Check duplicate name (excluding self)
	var exists int
	if err := r.db.QueryRow("SELECT COUNT(*) FROM dishes WHERE family_id = ? AND LOWER(name) = LOWER(?) AND id != ?",
		familyID, body.Name, id).Scan(&exists); err != nil {
		r.logger.Error("check duplicate dish on update", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
		return
	}
	if exists > 0 {
		writeError(response, http.StatusConflict, "DUPLICATE_NAME", "已有同名菜品")
		return
	}

	ingredientsJSON, _ := json.Marshal(body.Ingredients)

	result, err := r.db.Exec(`UPDATE dishes SET name = ?, category = ?, method = ?, ingredients_json = ?, photo_url = ?
		WHERE id = ? AND family_id = ?`,
		body.Name, body.Category, body.Method, ingredientsJSON, body.PhotoURL, id, familyID,
	)
	if err != nil {
		r.logger.Error("update dish", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "更新失败")
		return
	}
	if affected, err := result.RowsAffected(); err != nil || affected != 1 {
		r.logger.Error("read updated dish rows", "affected", affected, "error", err)
		writeError(response, http.StatusConflict, "STALE_RECORD", "菜品已发生变化，请刷新后重试")
		return
	}

	writeJSON(response, http.StatusOK, map[string]string{"id": id})
}

// --- Toggle Dish Availability ---

func (r *router) toggleDishAvailable(response http.ResponseWriter, request *http.Request) {
	familyID := getUserFamilyID(request.Context())
	id := request.PathValue("id")
	if id == "" {
		writeError(response, http.StatusBadRequest, "MISSING_ID", "缺少菜品 ID")
		return
	}

	result, err := r.db.Exec("UPDATE dishes SET available = NOT available WHERE id = ? AND family_id = ?", id, familyID)
	if err != nil {
		r.logger.Error("toggle dish", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "操作失败")
		return
	}
	affected, err := result.RowsAffected()
	if err != nil {
		r.logger.Error("read toggled dish rows", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "操作失败")
		return
	}
	if affected == 0 {
		writeError(response, http.StatusNotFound, "NOT_FOUND", "菜品不存在")
		return
	}

	writeJSON(response, http.StatusOK, map[string]string{"id": id})
}

// --- Delete Dish ---

func (r *router) deleteDish(response http.ResponseWriter, request *http.Request) {
	familyID := getUserFamilyID(request.Context())
	id := request.PathValue("id")
	if id == "" {
		writeError(response, http.StatusBadRequest, "MISSING_ID", "缺少菜品 ID")
		return
	}

	tx, err := r.db.BeginTx(request.Context(), nil)
	if err != nil {
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "删除失败")
		return
	}
	defer tx.Rollback()
	var lockedFamily string
	if err := tx.QueryRowContext(request.Context(), "SELECT id FROM families WHERE id = ? FOR UPDATE", familyID).Scan(&lockedFamily); err != nil {
		writeError(response, http.StatusConflict, "STALE_RECORD", "家庭状态已变化，请刷新后重试")
		return
	}

	// Don't delete if referenced in a pending order
	var pendingCount int
	if err := tx.QueryRow(`SELECT COUNT(*) FROM meal_order_items oi
		JOIN meal_orders o ON o.id = oi.order_id
		WHERE oi.dish_id = ? AND o.family_id = ? AND o.status = 'pending'`, id, familyID).Scan(&pendingCount); err != nil {
		r.logger.Error("check dish order usage", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
		return
	}
	if pendingCount > 0 {
		writeError(response, http.StatusConflict, "IN_USE", "该菜品正在一个待完成的点餐单中，无法删除")
		return
	}

	result, err := tx.Exec("DELETE FROM dishes WHERE id = ? AND family_id = ?", id, familyID)
	if err != nil {
		r.logger.Error("delete dish", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "删除失败")
		return
	}
	affected, err := result.RowsAffected()
	if err != nil {
		r.logger.Error("read deleted dish rows", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "删除失败")
		return
	}
	if affected == 0 {
		writeError(response, http.StatusNotFound, "NOT_FOUND", "菜品不存在")
		return
	}

	if err := tx.Commit(); err != nil {
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "删除失败")
		return
	}

	writeJSON(response, http.StatusOK, map[string]string{"message": "已删除"})
}
