package httpapi

import (
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/zhanghao527/youbenpu/services/api/internal/database"
	"github.com/zhanghao527/youbenpu/services/api/internal/ledger/billimport"
)

// maxBillUploadSize caps the uploaded bill file. Personal monthly bills are a
// few hundred KiB at most; 8 MiB leaves generous headroom without letting the
// endpoint be used as arbitrary storage.
const maxBillUploadSize = 8 << 20

// maxImportBatch bounds how many entries one confirm call may insert, keeping
// the batch INSERT and the request body within safe limits.
const maxImportBatch = 1000

type importPreviewResponse struct {
	Source  string           `json:"source"`
	Invalid int              `json:"invalid"`
	Total   int              `json:"total"`
	Counted int              `json:"counted"` // drafts that affect totals
	Neutral int              `json:"neutral"` // recorded but not counted
	Drafts  []importDraftDTO `json:"drafts"`
}

type importDraftDTO struct {
	Fingerprint       string `json:"fingerprint"`
	Type              string `json:"type"`
	AmountCents       int64  `json:"amount_cents"`
	Purpose           string `json:"purpose"`
	Date              string `json:"date"`
	TimeLabel         string `json:"time_label"`
	Note              string `json:"note"`
	CountsTowardTotal bool   `json:"counts_toward_total"`
	Duplicate         bool   `json:"duplicate"` // already imported before
}

// importLedger parses an uploaded WeChat/Alipay bill and returns a preview of
// draft entries. Nothing is written to the database here; the client reviews
// the drafts and posts the selected ones to importLedgerConfirm.
func (r *router) importLedger(response http.ResponseWriter, request *http.Request) {
	familyID := getUserFamilyID(request.Context())

	request.Body = http.MaxBytesReader(response, request.Body, maxBillUploadSize+(1<<20))
	if err := request.ParseMultipartForm(maxBillUploadSize); err != nil {
		writeError(response, http.StatusBadRequest, "INVALID_UPLOAD", "账单文件不能超过 8MB")
		return
	}

	file, _, err := request.FormFile("file")
	if err != nil {
		writeError(response, http.StatusBadRequest, "INVALID_UPLOAD", "请选择要导入的账单文件")
		return
	}
	defer file.Close()

	data, err := io.ReadAll(io.LimitReader(file, maxBillUploadSize))
	if err != nil {
		writeError(response, http.StatusBadRequest, "INVALID_UPLOAD", "无法读取账单文件")
		return
	}

	result, err := billimport.Parse(data)
	if err != nil {
		writeError(response, http.StatusBadRequest, "PARSE_FAILED", err.Error())
		return
	}

	r.respondImportPreview(response, familyID, result)
}

func (r *router) respondImportPreview(response http.ResponseWriter, familyID string, result *billimport.Result) {
	fingerprints := make([]string, 0, len(result.Drafts))
	for _, d := range result.Drafts {
		fingerprints = append(fingerprints, d.Fingerprint)
	}
	existing, err := r.existingFingerprints(familyID, fingerprints)
	if err != nil {
		r.logger.Error("lookup import fingerprints", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
		return
	}

	drafts := make([]importDraftDTO, 0, len(result.Drafts))
	counted, neutral := 0, 0
	for _, d := range result.Drafts {
		_, dup := existing[d.Fingerprint]
		drafts = append(drafts, importDraftDTO{
			Fingerprint:       d.Fingerprint,
			Type:              d.Type,
			AmountCents:       d.AmountCents,
			Purpose:           d.Purpose,
			Date:              d.Date,
			TimeLabel:         d.TimeLabel,
			Note:              d.Note,
			CountsTowardTotal: d.CountsTowardTotal,
			Duplicate:         dup,
		})
		if d.CountsTowardTotal {
			counted++
		} else {
			neutral++
		}
	}

	writeJSON(response, http.StatusOK, importPreviewResponse{
		Source:  string(result.Source),
		Invalid: result.Invalid,
		Total:   len(drafts),
		Counted: counted,
		Neutral: neutral,
		Drafts:  drafts,
	})
}

// existingFingerprints returns the subset of the given fingerprints that this
// family has already imported, so the preview can flag duplicates and confirm
// can skip them. An empty input returns an empty set without touching the DB.
func (r *router) existingFingerprints(familyID string, fingerprints []string) (map[string]struct{}, error) {
	found := make(map[string]struct{})
	if len(fingerprints) == 0 {
		return found, nil
	}

	placeholders := make([]string, len(fingerprints))
	args := make([]any, 0, len(fingerprints)+1)
	args = append(args, familyID)
	for i, fp := range fingerprints {
		placeholders[i] = "?"
		args = append(args, fp)
	}

	query := fmt.Sprintf(
		"SELECT import_fingerprint FROM ledger_entries WHERE family_id = ? AND import_fingerprint IN (%s)",
		strings.Join(placeholders, ","),
	)
	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var fp string
		if err := rows.Scan(&fp); err != nil {
			return nil, err
		}
		found[fp] = struct{}{}
	}
	return found, rows.Err()
}

type confirmImportRequest struct {
	Entries []confirmImportEntry `json:"entries"`
}

type confirmImportEntry struct {
	Fingerprint       string `json:"fingerprint"`
	Type              string `json:"type"`
	AmountCents       int64  `json:"amount_cents"`
	Purpose           string `json:"purpose"`
	Date              string `json:"date"`
	TimeLabel         string `json:"time_label"`
	Note              string `json:"note"`
	CountsTowardTotal bool   `json:"counts_toward_total"`
}

type confirmImportResponse struct {
	Imported int `json:"imported"`
	Skipped  int `json:"skipped"` // duplicates or invalid rows
}

// importLedgerConfirm writes the user-selected drafts to the ledger. It skips
// any fingerprint the family already imported (defence against double-submit),
// and imported entries default to shared visibility so the whole family sees
// them, matching manual ledger entries.
func (r *router) importLedgerConfirm(response http.ResponseWriter, request *http.Request) {
	familyID := getUserFamilyID(request.Context())
	userID := getUserID(request.Context())

	var body confirmImportRequest
	if err := readJSON(request, &body); err != nil {
		writeError(response, http.StatusBadRequest, "INVALID_REQUEST", "请求格式错误")
		return
	}
	if len(body.Entries) == 0 {
		writeError(response, http.StatusBadRequest, "NO_ENTRIES", "请选择要导入的记录")
		return
	}
	if len(body.Entries) > maxImportBatch {
		writeError(response, http.StatusBadRequest, "TOO_MANY", fmt.Sprintf("单次最多导入 %d 条", maxImportBatch))
		return
	}

	memberName := r.currentMemberName(familyID, userID)
	r.insertImportedEntries(response, familyID, userID, memberName, body.Entries)
}

func (r *router) insertImportedEntries(response http.ResponseWriter, familyID, userID, memberName string, entries []confirmImportEntry) {
	fingerprints := make([]string, 0, len(entries))
	for _, e := range entries {
		fingerprints = append(fingerprints, e.Fingerprint)
	}
	existing, err := r.existingFingerprints(familyID, fingerprints)
	if err != nil {
		r.logger.Error("confirm import fingerprints", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
		return
	}

	tx, err := r.db.Begin()
	if err != nil {
		r.logger.Error("begin import tx", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "导入失败")
		return
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`INSERT INTO ledger_entries
		(id, family_id, recorder_id, type, amount_cents, purpose, member_name, occurred_at, time_label, note, note_visibility, import_fingerprint, counts_toward_total)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'shared', ?, ?)`)
	if err != nil {
		r.logger.Error("prepare import insert", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "导入失败")
		return
	}
	defer stmt.Close()

	imported, skipped := 0, 0
	seen := make(map[string]struct{}, len(entries))
	for _, e := range entries {
		// Skip rows already imported in a prior run, duplicates within this
		// same payload, or rows that fail validation.
		if _, dup := existing[e.Fingerprint]; dup {
			skipped++
			continue
		}
		if _, dup := seen[e.Fingerprint]; dup {
			skipped++
			continue
		}
		if !validImportEntry(e) {
			skipped++
			continue
		}
		seen[e.Fingerprint] = struct{}{}

		if _, err := stmt.Exec(
			database.NewID(), familyID, userID, e.Type, e.AmountCents,
			truncateImportRunes(e.Purpose, 80), memberName, e.Date,
			truncateImportRunes(e.TimeLabel, 60), truncateImportRunes(e.Note, 300),
			e.Fingerprint, boolToTinyInt(e.CountsTowardTotal),
		); err != nil {
			r.logger.Error("insert imported entry", "error", err)
			writeError(response, http.StatusInternalServerError, "DB_ERROR", "导入失败")
			return
		}
		imported++
	}

	if err := tx.Commit(); err != nil {
		r.logger.Error("commit import tx", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "导入失败")
		return
	}

	writeJSON(response, http.StatusOK, confirmImportResponse{Imported: imported, Skipped: skipped})
}

// currentMemberName resolves the display name to stamp on imported entries.
// It prefers the user's per-family name (family_members), which is the name
// other members see in this family, and falls back to a safe default.
func (r *router) currentMemberName(familyID, userID string) string {
	var name string
	err := r.db.QueryRow(
		"SELECT display_name FROM family_members WHERE family_id = ? AND user_id = ?",
		familyID, userID,
	).Scan(&name)
	if err == nil && strings.TrimSpace(name) != "" {
		return name
	}
	return "我"
}

func validImportEntry(e confirmImportEntry) bool {
	if e.Type != "income" && e.Type != "expense" {
		return false
	}
	if e.AmountCents < 0 || e.AmountCents > 9_999_999_999 {
		return false
	}
	if strings.TrimSpace(e.Purpose) == "" {
		return false
	}
	if !isValidISODate(e.Date) {
		return false
	}
	if strings.TrimSpace(e.Fingerprint) == "" {
		return false
	}
	return true
}

func boolToTinyInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func truncateImportRunes(s string, max int) string {
	r := []rune(strings.TrimSpace(s))
	if len(r) <= max {
		return string(r)
	}
	return string(r[:max])
}
