package httpapi

import (
	"net/http"
	"strings"

	"github.com/zhanghao527/youbenpu/services/api/internal/database"
)

// --- List Entries ---

type ledgerEntryResponse struct {
	ID             string  `json:"id"`
	Type           string  `json:"type"`
	AmountCents    int64   `json:"amount_cents"`
	Purpose        string  `json:"purpose"`
	MemberName     string  `json:"member_name"`
	Date           string  `json:"date"`
	TimeLabel      string  `json:"time_label"`
	Note           *string `json:"note,omitempty"`
	NoteVisibility string  `json:"note_visibility"`
}

func (r *router) listLedger(response http.ResponseWriter, request *http.Request) {
	familyID := getUserFamilyID(request.Context())
	userID := getUserID(request.Context())

	// Optional month filter: ?month=2025-08
	month := request.URL.Query().Get("month")

	var query string
	var args []any

	if month != "" {
		query = `SELECT id, type, amount_cents, purpose, member_name, occurred_at, time_label, note, note_visibility, recorder_id
			FROM ledger_entries WHERE family_id = ? AND DATE_FORMAT(occurred_at, '%Y-%m') = ?
			ORDER BY occurred_at DESC, created_at DESC`
		args = []any{familyID, month}
	} else {
		query = `SELECT id, type, amount_cents, purpose, member_name, occurred_at, time_label, note, note_visibility, recorder_id
			FROM ledger_entries WHERE family_id = ?
			ORDER BY occurred_at DESC, created_at DESC LIMIT 200`
		args = []any{familyID}
	}

	rows, err := r.db.Query(query, args...)
	if err != nil {
		r.logger.Error("list ledger", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
		return
	}
	defer rows.Close()

	var entries []ledgerEntryResponse
	for rows.Next() {
		var e ledgerEntryResponse
		var note *string
		var recorderID string
		if err := rows.Scan(&e.ID, &e.Type, &e.AmountCents, &e.Purpose, &e.MemberName, &e.Date, &e.TimeLabel, &note, &e.NoteVisibility, &recorderID); err != nil {
			continue
		}
		// Private notes only visible to the recorder
		if note != nil && e.NoteVisibility == "private" && recorderID != userID {
			e.Note = nil
		} else {
			e.Note = note
		}
		// Format date as YYYY-MM-DD
		if len(e.Date) >= 10 {
			e.Date = e.Date[:10]
		}
		entries = append(entries, e)
	}

	if entries == nil {
		entries = []ledgerEntryResponse{}
	}
	writeJSON(response, http.StatusOK, entries)
}

// --- Create Entry ---

type createLedgerRequest struct {
	Type           string `json:"type"`
	AmountCents    int64  `json:"amount_cents"`
	Purpose        string `json:"purpose"`
	MemberName     string `json:"member_name"`
	Date           string `json:"date"`
	TimeLabel      string `json:"time_label"`
	Note           string `json:"note"`
	NoteVisibility string `json:"note_visibility"`
}

func (r *router) createLedger(response http.ResponseWriter, request *http.Request) {
	familyID := getUserFamilyID(request.Context())
	userID := getUserID(request.Context())

	var body createLedgerRequest
	if err := readJSON(request, &body); err != nil {
		writeError(response, http.StatusBadRequest, "INVALID_REQUEST", "请求格式错误")
		return
	}

	if body.Type != "income" && body.Type != "expense" {
		writeError(response, http.StatusBadRequest, "INVALID_TYPE", "类型只能是 income 或 expense")
		return
	}
	if body.AmountCents <= 0 || body.AmountCents > 9_999_999_999 {
		writeError(response, http.StatusBadRequest, "INVALID_AMOUNT", "金额无效")
		return
	}
	body.Purpose = strings.TrimSpace(body.Purpose)
	if body.Purpose == "" {
		writeError(response, http.StatusBadRequest, "MISSING_PURPOSE", "用途不能为空")
		return
	}
	if body.MemberName == "" {
		writeError(response, http.StatusBadRequest, "MISSING_MEMBER", "成员名称不能为空")
		return
	}
	if body.Date == "" {
		writeError(response, http.StatusBadRequest, "MISSING_DATE", "日期不能为空")
		return
	}
	if body.NoteVisibility == "" {
		body.NoteVisibility = "shared"
	}

	id := database.NewID()
	var notePtr *string
	if body.Note != "" {
		n := strings.TrimSpace(body.Note)
		notePtr = &n
	}

	_, err := r.db.Exec(`INSERT INTO ledger_entries
		(id, family_id, recorder_id, type, amount_cents, purpose, member_name, occurred_at, time_label, note, note_visibility)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, familyID, userID, body.Type, body.AmountCents, body.Purpose,
		body.MemberName, body.Date, body.TimeLabel, notePtr, body.NoteVisibility,
	)
	if err != nil {
		r.logger.Error("create ledger entry", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "创建失败")
		return
	}

	writeJSON(response, http.StatusCreated, map[string]string{"id": id})
}

// --- Update Entry ---

func (r *router) updateLedger(response http.ResponseWriter, request *http.Request) {
	familyID := getUserFamilyID(request.Context())
	id := request.PathValue("id")
	if id == "" {
		writeError(response, http.StatusBadRequest, "MISSING_ID", "缺少记录 ID")
		return
	}

	// Verify ownership
	var existingFamilyID string
	err := r.db.QueryRow("SELECT family_id FROM ledger_entries WHERE id = ?", id).Scan(&existingFamilyID)
	if err != nil || existingFamilyID != familyID {
		writeError(response, http.StatusNotFound, "NOT_FOUND", "记录不存在")
		return
	}

	var body createLedgerRequest
	if err := readJSON(request, &body); err != nil {
		writeError(response, http.StatusBadRequest, "INVALID_REQUEST", "请求格式错误")
		return
	}

	if body.Type != "income" && body.Type != "expense" {
		writeError(response, http.StatusBadRequest, "INVALID_TYPE", "类型只能是 income 或 expense")
		return
	}
	if body.AmountCents <= 0 || body.AmountCents > 9_999_999_999 {
		writeError(response, http.StatusBadRequest, "INVALID_AMOUNT", "金额无效")
		return
	}
	body.Purpose = strings.TrimSpace(body.Purpose)
	if body.Purpose == "" {
		writeError(response, http.StatusBadRequest, "MISSING_PURPOSE", "用途不能为空")
		return
	}
	if body.NoteVisibility == "" {
		body.NoteVisibility = "shared"
	}

	var notePtr *string
	if body.Note != "" {
		n := strings.TrimSpace(body.Note)
		notePtr = &n
	}

	_, err = r.db.Exec(`UPDATE ledger_entries SET
		type = ?, amount_cents = ?, purpose = ?, member_name = ?,
		occurred_at = ?, time_label = ?, note = ?, note_visibility = ?
		WHERE id = ? AND family_id = ?`,
		body.Type, body.AmountCents, body.Purpose, body.MemberName,
		body.Date, body.TimeLabel, notePtr, body.NoteVisibility,
		id, familyID,
	)
	if err != nil {
		r.logger.Error("update ledger entry", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "更新失败")
		return
	}

	writeJSON(response, http.StatusOK, map[string]string{"id": id})
}

// --- Delete Entry ---

func (r *router) deleteLedger(response http.ResponseWriter, request *http.Request) {
	familyID := getUserFamilyID(request.Context())
	id := request.PathValue("id")
	if id == "" {
		writeError(response, http.StatusBadRequest, "MISSING_ID", "缺少记录 ID")
		return
	}

	result, err := r.db.Exec("DELETE FROM ledger_entries WHERE id = ? AND family_id = ?", id, familyID)
	if err != nil {
		r.logger.Error("delete ledger entry", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "删除失败")
		return
	}

	affected, _ := result.RowsAffected()
	if affected == 0 {
		writeError(response, http.StatusNotFound, "NOT_FOUND", "记录不存在")
		return
	}

	writeJSON(response, http.StatusOK, map[string]string{"message": "已删除"})
}
