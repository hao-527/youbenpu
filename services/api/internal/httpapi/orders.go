package httpapi

import (
	"database/sql"
	"errors"
	"net/http"
	"time"

	mysql "github.com/go-sql-driver/mysql"

	"github.com/zhanghao527/youbenpu/services/api/internal/database"
)

// --- List Orders ---

type orderItemResponse struct {
	ID       string  `json:"id"`
	DishID   string  `json:"dish_id"`
	DishName string  `json:"dish_name"`
	Quantity int     `json:"quantity"`
	PhotoURL *string `json:"photo_url"`
}

type orderResponse struct {
	ID            string              `json:"id"`
	RequesterName string              `json:"requester_name"`
	Status        string              `json:"status"`
	SubmittedAt   string              `json:"submitted_at"`
	Items         []orderItemResponse `json:"items"`
}

func (r *router) listOrders(response http.ResponseWriter, request *http.Request) {
	familyID := getUserFamilyID(request.Context())

	rows, err := r.db.Query(`SELECT id, requester_name, status, submitted_at
		FROM meal_orders WHERE family_id = ? ORDER BY created_at DESC LIMIT 50`, familyID)
	if err != nil {
		r.logger.Error("list orders", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
		return
	}
	defer rows.Close()

	var orders []orderResponse
	for rows.Next() {
		var o orderResponse
		if err := rows.Scan(&o.ID, &o.RequesterName, &o.Status, &o.SubmittedAt); err != nil {
			continue
		}
		orders = append(orders, o)
	}

	// Load items for each order
	for i := range orders {
		itemRows, err := r.db.Query(
			"SELECT id, dish_id, dish_name, quantity, photo_url FROM meal_order_items WHERE order_id = ?",
			orders[i].ID,
		)
		if err != nil {
			continue
		}
		for itemRows.Next() {
			var item orderItemResponse
			if err := itemRows.Scan(&item.ID, &item.DishID, &item.DishName, &item.Quantity, &item.PhotoURL); err != nil {
				continue
			}
			orders[i].Items = append(orders[i].Items, item)
		}
		itemRows.Close()
		if orders[i].Items == nil {
			orders[i].Items = []orderItemResponse{}
		}
	}

	if orders == nil {
		orders = []orderResponse{}
	}
	writeJSON(response, http.StatusOK, orders)
}

// --- Create Order ---

type createOrderItemRequest struct {
	DishID   string  `json:"dish_id"`
	DishName string  `json:"dish_name"`
	Quantity int     `json:"quantity"`
	PhotoURL *string `json:"photo_url"`
}

type createOrderRequest struct {
	Items []createOrderItemRequest `json:"items"`
}

func (r *router) createOrder(response http.ResponseWriter, request *http.Request) {
	familyID := getUserFamilyID(request.Context())
	userID := getUserID(request.Context())

	var body createOrderRequest
	if err := readJSON(request, &body); err != nil {
		writeError(response, http.StatusBadRequest, "INVALID_REQUEST", "请求格式错误")
		return
	}

	if len(body.Items) == 0 {
		writeError(response, http.StatusBadRequest, "NO_ITEMS", "至少选择一道菜")
		return
	}

	// A fast pre-check keeps the common conflict response friendly. The unique
	// generated-column index added by migration 002 remains the concurrency-safe
	// source of truth.
	var pendingCount int
	if err := r.db.QueryRow("SELECT COUNT(*) FROM meal_orders WHERE family_id = ? AND status = 'pending'", familyID).Scan(&pendingCount); err != nil {
		r.logger.Error("check pending orders", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "操作失败")
		return
	}
	if pendingCount > 0 {
		writeError(response, http.StatusConflict, "PENDING_EXISTS", "已有一张待完成点餐单，请先处理")
		return
	}

	var requesterName string
	if err := r.db.QueryRow("SELECT display_name FROM users WHERE id = ?", userID).Scan(&requesterName); err != nil {
		if !errors.Is(err, sql.ErrNoRows) {
			r.logger.Error("get order requester", "error", err)
			writeError(response, http.StatusInternalServerError, "DB_ERROR", "操作失败")
			return
		}
	}
	if requesterName == "" {
		requesterName = "我"
	}

	orderID := database.NewID()
	submittedAt := timeNowLabel()

	tx, err := r.db.Begin()
	if err != nil {
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "操作失败")
		return
	}
	defer tx.Rollback()

	_, err = tx.Exec(`INSERT INTO meal_orders (id, family_id, requester_id, requester_name, status, submitted_at)
		VALUES (?, ?, ?, ?, 'pending', ?)`, orderID, familyID, userID, requesterName, submittedAt)
	if err != nil {
		var mysqlError *mysql.MySQLError
		if errors.As(err, &mysqlError) && mysqlError.Number == 1062 {
			writeError(response, http.StatusConflict, "PENDING_EXISTS", "已有一张待完成点餐单，请先处理")
			return
		}
		r.logger.Error("create order", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "创建失败")
		return
	}

	for _, item := range body.Items {
		if item.DishName == "" || item.Quantity <= 0 {
			continue
		}
		itemID := database.NewID()
		_, err = tx.Exec(`INSERT INTO meal_order_items (id, order_id, dish_id, dish_name, quantity, photo_url)
			VALUES (?, ?, ?, ?, ?, ?)`, itemID, orderID, item.DishID, item.DishName, item.Quantity, item.PhotoURL)
		if err != nil {
			r.logger.Error("create order item", "error", err)
			writeError(response, http.StatusInternalServerError, "DB_ERROR", "创建失败")
			return
		}
	}

	if err := tx.Commit(); err != nil {
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "操作失败")
		return
	}

	writeJSON(response, http.StatusCreated, map[string]string{"id": orderID})
}

// --- Update Order Status ---

type updateOrderStatusRequest struct {
	Status string `json:"status"` // "completed" | "cancelled"
}

func (r *router) updateOrderStatus(response http.ResponseWriter, request *http.Request) {
	familyID := getUserFamilyID(request.Context())
	id := request.PathValue("id")
	if id == "" {
		writeError(response, http.StatusBadRequest, "MISSING_ID", "缺少点餐单 ID")
		return
	}

	var body updateOrderStatusRequest
	if err := readJSON(request, &body); err != nil {
		writeError(response, http.StatusBadRequest, "INVALID_REQUEST", "请求格式错误")
		return
	}

	if body.Status != "completed" && body.Status != "cancelled" {
		writeError(response, http.StatusBadRequest, "INVALID_STATUS", "状态只能是 completed 或 cancelled")
		return
	}

	result, err := r.db.Exec(
		"UPDATE meal_orders SET status = ? WHERE id = ? AND family_id = ? AND status = 'pending'",
		body.Status, id, familyID,
	)
	if err != nil {
		r.logger.Error("update order status", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "更新失败")
		return
	}

	affected, _ := result.RowsAffected()
	if affected == 0 {
		writeError(response, http.StatusNotFound, "NOT_FOUND", "点餐单不存在或已不是待完成状态")
		return
	}

	writeJSON(response, http.StatusOK, map[string]string{"id": id, "status": body.Status})
}

// --- Delete Order (only non-pending) ---

func (r *router) deleteOrder(response http.ResponseWriter, request *http.Request) {
	familyID := getUserFamilyID(request.Context())
	id := request.PathValue("id")
	if id == "" {
		writeError(response, http.StatusBadRequest, "MISSING_ID", "缺少点餐单 ID")
		return
	}

	result, err := r.db.Exec(
		"DELETE FROM meal_orders WHERE id = ? AND family_id = ? AND status != 'pending'",
		id, familyID,
	)
	if err != nil {
		r.logger.Error("delete order", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "删除失败")
		return
	}

	affected, _ := result.RowsAffected()
	if affected == 0 {
		writeError(response, http.StatusNotFound, "NOT_FOUND", "点餐单不存在或仍在待完成状态")
		return
	}

	writeJSON(response, http.StatusOK, map[string]string{"message": "已删除"})
}

// --- Helper ---

func timeNowLabel() string {
	return time.Now().Format("2006-01-02 15:04")
}
