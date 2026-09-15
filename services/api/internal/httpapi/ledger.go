package httpapi

import (
	"database/sql"
	"errors"
	"net/http"
	"regexp"
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

var ledgerMonthPattern = regexp.MustCompile(`^\d{4}-(0[1-9]|1[0-2])$`)

func (r *router) listLedger(response http.ResponseWriter, request *http.Request) {
	familyID := getUserFamilyID(request.Context())
	userID := getUserID(request.Context())

	// Optional month filter: ?month=2025-08
	month := strings.TrimSpace(request.URL.Query().Get("month"))
	if month != "" && !ledgerMonthPattern.MatchString(month) {
		writeError(response, http.StatusBadRequest, "INVALID_MONTH", "月份格式应为 YYYY-MM")
		return
	}

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
			r.logger.Error("scan ledger entry", "error", err)
			writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
			return
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
	if err := rows.Err(); err != nil {
		r.logger.Error("iterate ledger entries", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
		return
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

	if validation := validateLedgerRequest(&body); validation != nil {
		writeError(response, http.StatusBadRequest, validation.code, validation.message)
		return
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
	userID := getUserID(request.Context())
	id := request.PathValue("id")
	if id == "" {
		writeError(response, http.StatusBadRequest, "MISSING_ID", "缺少记录 ID")
		return
	}

	// Private records may only be edited by their recorder. Shared records
	// remain editable by family members; making one private transfers its
	// recorder ownership to the member performing the change.
	var existingFamilyID, existingVisibility, recorderID string
	err := r.db.QueryRow("SELECT family_id, note_visibility, recorder_id FROM ledger_entries WHERE id = ?", id).Scan(&existingFamilyID, &existingVisibility, &recorderID)
	if errors.Is(err, sql.ErrNoRows) || existingFamilyID != familyID {
		writeError(response, http.StatusNotFound, "NOT_FOUND", "记录不存在")
		return
	}
	if err != nil {
		r.logger.Error("find ledger entry", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
		return
	}
	if existingVisibility == "private" && recorderID != userID {
		writeError(response, http.StatusForbidden, "FORBIDDEN", "只有记录创建者可以修改私密记录")
		return
	}

	var body createLedgerRequest
	if err := readJSON(request, &body); err != nil {
		writeError(response, http.StatusBadRequest, "INVALID_REQUEST", "请求格式错误")
		return
	}

	if validation := validateLedgerRequest(&body); validation != nil {
		writeError(response, http.StatusBadRequest, validation.code, validation.message)
		return
	}

	var notePtr *string
	if body.Note != "" {
		n := strings.TrimSpace(body.Note)
		notePtr = &n
	}

	result, err := r.db.Exec(`UPDATE ledger_entries SET
		type = ?, amount_cents = ?, purpose = ?, member_name = ?,
		occurred_at = ?, time_label = ?, note = ?, note_visibility = ?,
		recorder_id = CASE WHEN ? = 'private' THEN ? ELSE recorder_id END
		WHERE id = ? AND family_id = ? AND (note_visibility <> 'private' OR recorder_id = ?)`,
		body.Type, body.AmountCents, body.Purpose, body.MemberName,
		body.Date, body.TimeLabel, notePtr, body.NoteVisibility,
		body.NoteVisibility, userID, id, familyID, userID,
	)
	if err != nil {
		r.logger.Error("update ledger entry", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "更新失败")
		return
	}
	if affected, err := result.RowsAffected(); err != nil || affected != 1 {
		r.logger.Error("read updated ledger rows", "affected", affected, "error", err)
		writeError(response, http.StatusConflict, "STALE_RECORD", "记录已发生变化，请刷新后重试")
		return
	}

	writeJSON(response, http.StatusOK, map[string]string{"id": id})
}

// --- Delete Entry ---

func (r *router) deleteLedger(response http.ResponseWriter, request *http.Request) {
	familyID := getUserFamilyID(request.Context())
	userID := getUserID(request.Context())
	id := request.PathValue("id")
	if id == "" {
		writeError(response, http.StatusBadRequest, "MISSING_ID", "缺少记录 ID")
		return
	}

	var existingFamilyID, visibility, recorderID string
	err := r.db.QueryRow("SELECT family_id, note_visibility, recorder_id FROM ledger_entries WHERE id = ?", id).Scan(&existingFamilyID, &visibility, &recorderID)
	if errors.Is(err, sql.ErrNoRows) || existingFamilyID != familyID {
		writeError(response, http.StatusNotFound, "NOT_FOUND", "记录不存在")
		return
	}
	if err != nil {
		r.logger.Error("find ledger entry for delete", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
		return
	}
	if visibility == "private" && recorderID != userID {
		writeError(response, http.StatusForbidden, "FORBIDDEN", "只有记录创建者可以删除私密记录")
		return
	}

	result, err := r.db.Exec("DELETE FROM ledger_entries WHERE id = ? AND family_id = ? AND (note_visibility <> 'private' OR recorder_id = ?)", id, familyID, userID)
	if err != nil {
		r.logger.Error("delete ledger entry", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "删除失败")
		return
	}

	affected, err := result.RowsAffected()
	if err != nil {
		r.logger.Error("read deleted ledger rows", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "删除失败")
		return
	}
	if affected == 0 {
		writeError(response, http.StatusNotFound, "NOT_FOUND", "记录不存在")
		return
	}

	writeJSON(response, http.StatusOK, map[string]string{"message": "已删除"})
}
