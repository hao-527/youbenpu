package httpapi

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"math/big"
	"net/http"
	"strings"
	"time"

	"github.com/zhanghao527/youbenpu/services/api/internal/database"
)

// firstRune returns the first rune of s as a string, or a fallback when empty.
func firstRune(s, fallback string) string {
	runes := []rune(s)
	if len(runes) == 0 {
		return fallback
	}
	return string(runes[:1])
}

// setActiveFamily points users.family_id at the given family (the "currently
// viewed" family) and mirrors that family's role/display_name onto the users
// row so existing handlers that still read users.* keep working.
func setActiveFamily(ctx context.Context, tx *sql.Tx, userID, familyID string) error {
	var role, displayName, avatarText string
	if err := tx.QueryRowContext(ctx,
		"SELECT role, display_name, avatar_text FROM family_members WHERE family_id = ? AND user_id = ?",
		familyID, userID,
	).Scan(&role, &displayName, &avatarText); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx,
		"UPDATE users SET family_id = ?, role = ?, display_name = ?, avatar_text = ? WHERE id = ?",
		familyID, role, displayName, avatarText, userID,
	)
	return err
}

// clearActiveFamily moves the user's active pointer to any remaining family, or
// NULL when none are left.
func clearActiveFamily(ctx context.Context, tx *sql.Tx, userID string) error {
	var nextFamily sql.NullString
	err := tx.QueryRowContext(ctx,
		"SELECT family_id FROM family_members WHERE user_id = ? ORDER BY joined_at LIMIT 1", userID,
	).Scan(&nextFamily)
	if errors.Is(err, sql.ErrNoRows) || !nextFamily.Valid {
		_, err := tx.ExecContext(ctx, "UPDATE users SET family_id = NULL, role = 'member' WHERE id = ?", userID)
		return err
	}
	if err != nil {
		return err
	}
	return setActiveFamily(ctx, tx, userID, nextFamily.String)
}

// --- Create Family ---

type createFamilyRequest struct {
	Name        string `json:"name"`
	DisplayName string `json:"display_name"`
}

type familyResponse struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

func (r *router) createFamily(response http.ResponseWriter, request *http.Request) {
	userID := getUserID(request.Context())

	var body createFamilyRequest
	if err := readJSON(request, &body); err != nil {
		writeError(response, http.StatusBadRequest, "INVALID_REQUEST", "请求格式错误")
		return
	}

	body.Name = strings.TrimSpace(body.Name)
	if body.Name == "" {
		body.Name = "我们家"
	}
	if len([]rune(body.Name)) > 20 {
		writeError(response, http.StatusBadRequest, "NAME_TOO_LONG", "家庭名称最多 20 个字")
		return
	}
	body.DisplayName = strings.TrimSpace(body.DisplayName)
	if body.DisplayName == "" {
		body.DisplayName = "我"
	}
	if len([]rune(body.DisplayName)) > 20 {
		writeError(response, http.StatusBadRequest, "NAME_TOO_LONG", "成员名称最多 20 个字")
		return
	}

	familyID := database.NewID()
	avatarText := firstRune(body.DisplayName, "我")
	tx, err := r.db.BeginTx(request.Context(), nil)
	if err != nil {
		r.logger.Error("begin create family", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "操作失败")
		return
	}
	defer tx.Rollback()

	// A user may own multiple families now; no "already in a family" guard.
	if _, err = tx.ExecContext(request.Context(),
		"INSERT INTO families (id, name) VALUES (?, ?)", familyID, body.Name,
	); err != nil {
		r.logger.Error("insert family", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "创建家庭失败")
		return
	}

	if _, err = tx.ExecContext(request.Context(),
		"INSERT INTO family_members (family_id, user_id, role, display_name, avatar_text) VALUES (?, ?, 'owner', ?, ?)",
		familyID, userID, body.DisplayName, avatarText,
	); err != nil {
		r.logger.Error("insert family member", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "绑定家庭失败")
		return
	}

	if err := setActiveFamily(request.Context(), tx, userID, familyID); err != nil {
		r.logger.Error("set active family after create", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "绑定家庭失败")
		return
	}

	defaultLocations := []string{"冰箱冷藏", "冰箱冷冻", "橱柜", "药箱", "浴室"}
	for _, location := range defaultLocations {
		if _, err := tx.ExecContext(request.Context(),
			"INSERT INTO locations (id, family_id, name) VALUES (?, ?, ?)",
			database.NewID(), familyID, location,
		); err != nil {
			r.logger.Error("insert default location", "location", location, "error", err)
			writeError(response, http.StatusInternalServerError, "DB_ERROR", "创建默认位置失败")
			return
		}
	}

	if err := tx.Commit(); err != nil {
		r.logger.Error("commit create family", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "操作失败")
		return
	}
	writeJSON(response, http.StatusCreated, familyResponse{ID: familyID, Name: body.Name})
}

// --- List My Families ---

type myFamilyResponse struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Role     string `json:"role"`
	IsActive bool   `json:"is_active"`
}

func (r *router) listMyFamilies(response http.ResponseWriter, request *http.Request) {
	userID := getUserID(request.Context())

	var activeFamily sql.NullString
	if err := r.db.QueryRowContext(request.Context(),
		"SELECT family_id FROM users WHERE id = ?", userID,
	).Scan(&activeFamily); err != nil {
		r.logger.Error("read active family", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
		return
	}

	rows, err := r.db.QueryContext(request.Context(),
		`SELECT f.id, f.name, m.role
		 FROM family_members m JOIN families f ON f.id = m.family_id
		 WHERE m.user_id = ? ORDER BY m.joined_at`, userID)
	if err != nil {
		r.logger.Error("list my families", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
		return
	}
	defer rows.Close()

	families := make([]myFamilyResponse, 0)
	for rows.Next() {
		var f myFamilyResponse
		if err := rows.Scan(&f.ID, &f.Name, &f.Role); err != nil {
			r.logger.Error("scan my family", "error", err)
			writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
			return
		}
		f.IsActive = activeFamily.Valid && activeFamily.String == f.ID
		families = append(families, f)
	}
	if err := rows.Err(); err != nil {
		r.logger.Error("iterate my families", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
		return
	}

	writeJSON(response, http.StatusOK, families)
}

// --- Switch Active Family ---

type switchFamilyRequest struct {
	FamilyID string `json:"family_id"`
}

func (r *router) switchActiveFamily(response http.ResponseWriter, request *http.Request) {
	userID := getUserID(request.Context())

	var body switchFamilyRequest
	if err := readJSON(request, &body); err != nil || strings.TrimSpace(body.FamilyID) == "" {
		writeError(response, http.StatusBadRequest, "INVALID_REQUEST", "缺少家庭 ID")
		return
	}

	tx, err := r.db.BeginTx(request.Context(), nil)
	if err != nil {
		r.logger.Error("begin switch family", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "切换失败")
		return
	}
	defer tx.Rollback()

	var exists int
	err = tx.QueryRowContext(request.Context(),
		"SELECT COUNT(*) FROM family_members WHERE family_id = ? AND user_id = ?", body.FamilyID, userID,
	).Scan(&exists)
	if err != nil {
		r.logger.Error("check membership for switch", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "切换失败")
		return
	}
	if exists == 0 {
		writeError(response, http.StatusForbidden, "NOT_A_MEMBER", "你不是这个家庭的成员")
		return
	}

	if err := setActiveFamily(request.Context(), tx, userID, body.FamilyID); err != nil {
		r.logger.Error("set active family on switch", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "切换失败")
		return
	}
	if err := tx.Commit(); err != nil {
		r.logger.Error("commit switch family", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "切换失败")
		return
	}
	writeJSON(response, http.StatusOK, map[string]string{"family_id": body.FamilyID, "message": "已切换家庭"})
}

// --- Get Family Info ---

type familyInfoResponse struct {
	ID      string           `json:"id"`
	Name    string           `json:"name"`
	Members []memberResponse `json:"members"`
}

type memberResponse struct {
	ID          string `json:"id"`
	DisplayName string `json:"display_name"`
	Role        string `json:"role"`
	AvatarText  string `json:"avatar_text"`
}

func (r *router) getFamily(response http.ResponseWriter, request *http.Request) {
	familyID := getUserFamilyID(request.Context())

	var name string
	err := r.db.QueryRow("SELECT name FROM families WHERE id = ?", familyID).Scan(&name)
	if err != nil {
		writeError(response, http.StatusNotFound, "NOT_FOUND", "家庭不存在")
		return
	}

	rows, err := r.db.Query(
		"SELECT user_id, display_name, role, avatar_text FROM family_members WHERE family_id = ? ORDER BY joined_at",
		familyID,
	)
	if err != nil {
		r.logger.Error("query members", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
		return
	}
	defer rows.Close()

	var members []memberResponse
	for rows.Next() {
		var m memberResponse
		if err := rows.Scan(&m.ID, &m.DisplayName, &m.Role, &m.AvatarText); err != nil {
			r.logger.Error("scan family member", "error", err)
			writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
			return
		}
		members = append(members, m)
	}
	if err := rows.Err(); err != nil {
		r.logger.Error("iterate family members", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
		return
	}

	if members == nil {
		members = []memberResponse{}
	}
	writeJSON(response, http.StatusOK, familyInfoResponse{ID: familyID, Name: name, Members: members})
}

// --- Rename Family ---

type renameFamilyRequest struct {
	Name string `json:"name"`
}

func (r *router) renameFamily(response http.ResponseWriter, request *http.Request) {
	familyID := getUserFamilyID(request.Context())
	userID := getUserID(request.Context())

	var body renameFamilyRequest
	if err := readJSON(request, &body); err != nil {
		writeError(response, http.StatusBadRequest, "INVALID_REQUEST", "请填写新名称")
		return
	}
	body.Name = strings.TrimSpace(body.Name)
	if body.Name == "" {
		writeError(response, http.StatusBadRequest, "INVALID_REQUEST", "请填写新名称")
		return
	}
	if len([]rune(body.Name)) > 20 {
		writeError(response, http.StatusBadRequest, "NAME_TOO_LONG", "家庭名称最多 20 个字")
		return
	}

	tx, err := r.db.BeginTx(request.Context(), nil)
	if err != nil {
		r.logger.Error("begin rename family", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "修改失败")
		return
	}
	defer tx.Rollback()

	role, err := r.lockFamilyMember(request.Context(), tx, familyID, userID)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(response, http.StatusForbidden, "FORBIDDEN", "只有管理员才能修改家庭名称")
		return
	}
	if err != nil {
		r.logger.Error("lock family for rename", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "修改失败")
		return
	}
	if role != "owner" {
		writeError(response, http.StatusForbidden, "FORBIDDEN", "只有管理员才能修改家庭名称")
		return
	}

	result, err := tx.ExecContext(request.Context(), "UPDATE families SET name = ? WHERE id = ?", body.Name, familyID)
	if err != nil {
		r.logger.Error("rename family", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "修改失败")
		return
	}
	if affected, err := result.RowsAffected(); err != nil || affected > 1 {
		r.logger.Error("read renamed family rows", "affected", affected, "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "修改失败")
		return
	}
	if err := tx.Commit(); err != nil {
		r.logger.Error("commit rename family", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "修改失败")
		return
	}
	writeJSON(response, http.StatusOK, map[string]string{"name": body.Name})
}

// --- Generate Invitation Code ---

type inviteResponse struct {
	Code      string `json:"code"`
	ExpiresAt string `json:"expires_at"`
}

func (r *router) createInvitation(response http.ResponseWriter, request *http.Request) {
	familyID := getUserFamilyID(request.Context())
	userID := getUserID(request.Context())
	code := generateInviteCode()
	expiresAt := time.Now().Add(24 * time.Hour)
	id := database.NewID()

	tx, err := r.db.BeginTx(request.Context(), nil)
	if err != nil {
		r.logger.Error("begin create invitation", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "创建邀请码失败")
		return
	}
	defer tx.Rollback()

	role, err := r.lockFamilyMember(request.Context(), tx, familyID, userID)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(response, http.StatusForbidden, "FORBIDDEN", "只有管理员才能邀请成员")
		return
	}
	if err != nil {
		r.logger.Error("lock family for invitation", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "创建邀请码失败")
		return
	}
	if role != "owner" {
		writeError(response, http.StatusForbidden, "FORBIDDEN", "只有管理员才能邀请成员")
		return
	}

	if _, err := tx.ExecContext(request.Context(),
		"INSERT INTO invitations (id, family_id, code, expires_at) VALUES (?, ?, ?, ?)",
		id, familyID, code, expiresAt,
	); err != nil {
		r.logger.Error("create invitation", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "创建邀请码失败")
		return
	}
	if err := tx.Commit(); err != nil {
		r.logger.Error("commit invitation", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "创建邀请码失败")
		return
	}

	writeJSON(response, http.StatusCreated, inviteResponse{
		Code:      code,
		ExpiresAt: expiresAt.Format(time.RFC3339),
	})
}

// --- Invitation Info (preview before joining) ---

type invitationInfoResponse struct {
	FamilyID   string `json:"family_id"`
	FamilyName string `json:"family_name"`
	Valid      bool   `json:"valid"`
	Reason     string `json:"reason,omitempty"`
}

func (r *router) getInvitationInfo(response http.ResponseWriter, request *http.Request) {
	code := strings.TrimSpace(request.PathValue("code"))
	if code == "" {
		writeError(response, http.StatusBadRequest, "INVALID_REQUEST", "缺少邀请码")
		return
	}

	var familyID, familyName string
	var expiresAt time.Time
	var usedBy sql.NullString
	err := r.db.QueryRowContext(request.Context(),
		`SELECT i.family_id, f.name, i.expires_at, i.used_by
		 FROM invitations i JOIN families f ON f.id = i.family_id
		 WHERE i.code = ?`, code,
	).Scan(&familyID, &familyName, &expiresAt, &usedBy)
	if errors.Is(err, sql.ErrNoRows) {
		writeJSON(response, http.StatusOK, invitationInfoResponse{Valid: false, Reason: "邀请码无效"})
		return
	}
	if err != nil {
		r.logger.Error("invitation info", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
		return
	}

	info := invitationInfoResponse{FamilyID: familyID, FamilyName: familyName, Valid: true}
	if usedBy.Valid {
		info.Valid = false
		info.Reason = "该邀请码已被使用"
	} else if time.Now().After(expiresAt) {
		info.Valid = false
		info.Reason = "邀请码已过期"
	}
	writeJSON(response, http.StatusOK, info)
}

// --- Join Family by Code ---

type joinFamilyRequest struct {
	Code        string `json:"code"`
	DisplayName string `json:"display_name"`
	// MergeFromFamilyID, when set, copies that family's data into the family
	// being joined. The user must be a member of the source family. Private
	// ledger notes are never copied.
	MergeFromFamilyID string `json:"merge_from_family_id"`
}

func (r *router) joinFamily(response http.ResponseWriter, request *http.Request) {
	userID := getUserID(request.Context())

	var body joinFamilyRequest
	if err := readJSON(request, &body); err != nil {
		writeError(response, http.StatusBadRequest, "INVALID_REQUEST", "邀请码不能为空")
		return
	}
	body.Code = strings.TrimSpace(body.Code)
	if body.Code == "" {
		writeError(response, http.StatusBadRequest, "INVALID_REQUEST", "邀请码不能为空")
		return
	}
	body.DisplayName = strings.TrimSpace(body.DisplayName)
	if body.DisplayName == "" {
		body.DisplayName = "新成员"
	}
	if len([]rune(body.DisplayName)) > 20 {
		writeError(response, http.StatusBadRequest, "NAME_TOO_LONG", "成员名称最多 20 个字")
		return
	}

	tx, err := r.db.BeginTx(request.Context(), nil)
	if err != nil {
		r.logger.Error("begin join family", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "操作失败")
		return
	}
	defer tx.Rollback()

	// Lock the invitation row and validate it.
	var invID, familyID string
	var expiresAt time.Time
	var usedBy sql.NullString
	err = tx.QueryRowContext(request.Context(),
		"SELECT id, family_id, expires_at, used_by FROM invitations WHERE code = ? FOR UPDATE", body.Code,
	).Scan(&invID, &familyID, &expiresAt, &usedBy)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(response, http.StatusNotFound, "INVALID_CODE", "邀请码无效")
		return
	}
	if err != nil {
		r.logger.Error("query invitation", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
		return
	}
	if usedBy.Valid {
		writeError(response, http.StatusGone, "CODE_USED", "该邀请码已被使用")
		return
	}
	if time.Now().After(expiresAt) {
		writeError(response, http.StatusGone, "CODE_EXPIRED", "邀请码已过期")
		return
	}

	// Lock the family so concurrent joins serialize.
	var lockedFamilyID string
	err = tx.QueryRowContext(request.Context(),
		"SELECT id FROM families WHERE id = ? FOR UPDATE", familyID,
	).Scan(&lockedFamilyID)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(response, http.StatusNotFound, "INVALID_CODE", "邀请码无效")
		return
	}
	if err != nil {
		r.logger.Error("lock family for join", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
		return
	}

	// Already a member? Treat as success (idempotent) by just switching active.
	var alreadyMember int
	if err := tx.QueryRowContext(request.Context(),
		"SELECT COUNT(*) FROM family_members WHERE family_id = ? AND user_id = ?", familyID, userID,
	).Scan(&alreadyMember); err != nil {
		r.logger.Error("check existing membership", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
		return
	}
	if alreadyMember > 0 {
		writeError(response, http.StatusConflict, "ALREADY_MEMBER", "你已经是这个家庭的成员了")
		return
	}

	avatarText := firstRune(body.DisplayName, "新")
	if _, err := tx.ExecContext(request.Context(),
		"INSERT INTO family_members (family_id, user_id, role, display_name, avatar_text) VALUES (?, ?, 'member', ?, ?)",
		familyID, userID, body.DisplayName, avatarText,
	); err != nil {
		r.logger.Error("insert join member", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "加入家庭失败")
		return
	}

	// Mark the invitation used.
	result, err := tx.ExecContext(request.Context(),
		"UPDATE invitations SET used_by = ? WHERE id = ? AND used_by IS NULL", userID, invID,
	)
	if err != nil {
		r.logger.Error("mark invitation used", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "加入家庭失败")
		return
	}
	if affected, err := result.RowsAffected(); err != nil || affected != 1 {
		r.logger.Error("read used invitation rows", "affected", affected, "error", err)
		writeError(response, http.StatusGone, "CODE_USED", "该邀请码已被使用")
		return
	}

	// Optional data merge from a source family the user belongs to.
	if strings.TrimSpace(body.MergeFromFamilyID) != "" {
		if body.MergeFromFamilyID == familyID {
			writeError(response, http.StatusBadRequest, "INVALID_MERGE", "不能合并到同一个家庭")
			return
		}
		var srcMember int
		if err := tx.QueryRowContext(request.Context(),
			"SELECT COUNT(*) FROM family_members WHERE family_id = ? AND user_id = ?", body.MergeFromFamilyID, userID,
		).Scan(&srcMember); err != nil {
			r.logger.Error("check merge source membership", "error", err)
			writeError(response, http.StatusInternalServerError, "DB_ERROR", "合并失败")
			return
		}
		if srcMember == 0 {
			writeError(response, http.StatusForbidden, "NOT_A_MEMBER", "你不是来源家庭的成员，无法合并")
			return
		}
		if err := r.mergeFamilyData(request.Context(), tx, body.MergeFromFamilyID, familyID); err != nil {
			r.logger.Error("merge family data", "error", err)
			writeError(response, http.StatusInternalServerError, "DB_ERROR", "合并家庭数据失败")
			return
		}
	}

	// Make the newly joined family the active one.
	if err := setActiveFamily(request.Context(), tx, userID, familyID); err != nil {
		r.logger.Error("set active family after join", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "加入家庭失败")
		return
	}

	if err := tx.Commit(); err != nil {
		r.logger.Error("commit join family", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "操作失败")
		return
	}
	writeJSON(response, http.StatusOK, map[string]string{"family_id": familyID, "message": "已加入家庭"})
}

// mergeFamilyData copies business data from src family into dst family within
// the given transaction. Private ledger notes are excluded (privacy). Locations
// and custom categories are de-duplicated by name; ledger/inventory/dishes/
// orders are always inserted as new rows.
func (r *router) mergeFamilyData(ctx context.Context, tx *sql.Tx, srcFamilyID, dstFamilyID string) error {
	// Ledger: skip private records entirely so private notes never leak.
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO ledger_entries
		 (id, family_id, recorder_id, type, amount_cents, purpose, member_name, occurred_at, time_label, note, note_visibility)
		 SELECT UUID(), ?, recorder_id, type, amount_cents, purpose, member_name, occurred_at, time_label, note, note_visibility
		 FROM ledger_entries WHERE family_id = ? AND note_visibility = 'shared'`,
		dstFamilyID, srcFamilyID,
	); err != nil {
		return err
	}

	// Inventory items.
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO inventory_items
		 (id, family_id, name, category, location, quantity_label, expiry_date, status, photo_url)
		 SELECT UUID(), ?, name, category, location, quantity_label, expiry_date, status, photo_url
		 FROM inventory_items WHERE family_id = ? AND status != 'deleted'`,
		dstFamilyID, srcFamilyID,
	); err != nil {
		return err
	}

	// Dishes.
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO dishes
		 (id, family_id, name, category, method, ingredients_json, photo_url, available)
		 SELECT UUID(), ?, name, category, method, ingredients_json, photo_url, available
		 FROM dishes WHERE family_id = ?`,
		dstFamilyID, srcFamilyID,
	); err != nil {
		return err
	}

	// Locations: de-duplicate by name.
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO locations (id, family_id, name)
		 SELECT UUID(), ?, s.name FROM locations s
		 WHERE s.family_id = ?
		   AND NOT EXISTS (SELECT 1 FROM locations d WHERE d.family_id = ? AND d.name = s.name)`,
		dstFamilyID, srcFamilyID, dstFamilyID,
	); err != nil {
		return err
	}

	// Custom categories: de-duplicate by (domain, name).
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO custom_categories (id, family_id, domain, name)
		 SELECT UUID(), ?, s.domain, s.name FROM custom_categories s
		 WHERE s.family_id = ?
		   AND NOT EXISTS (SELECT 1 FROM custom_categories d WHERE d.family_id = ? AND d.domain = s.domain AND d.name = s.name)`,
		dstFamilyID, srcFamilyID, dstFamilyID,
	); err != nil {
		return err
	}

	return nil
}

// --- Leave Family ---

func (r *router) leaveFamily(response http.ResponseWriter, request *http.Request) {
	userID := getUserID(request.Context())
	familyID := getUserFamilyID(request.Context())

	tx, err := r.db.BeginTx(request.Context(), nil)
	if err != nil {
		r.logger.Error("begin leave family", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "退出家庭失败")
		return
	}
	defer tx.Rollback()

	userRole, err := r.lockFamilyMember(request.Context(), tx, familyID, userID)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(response, http.StatusNotFound, "NOT_FOUND", "家庭或成员不存在")
		return
	}
	if err != nil {
		r.logger.Error("lock family for leave", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "退出家庭失败")
		return
	}

	var ownerCount, memberCount int
	if err := tx.QueryRowContext(request.Context(),
		"SELECT COUNT(*) FROM family_members WHERE family_id = ? AND role = 'owner'", familyID,
	).Scan(&ownerCount); err != nil {
		r.logger.Error("count family owners for leave", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "退出家庭失败")
		return
	}
	if err := tx.QueryRowContext(request.Context(),
		"SELECT COUNT(*) FROM family_members WHERE family_id = ?", familyID,
	).Scan(&memberCount); err != nil {
		r.logger.Error("count family members for leave", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "退出家庭失败")
		return
	}

	disband := false
	if userRole == "owner" && ownerCount <= 1 {
		if memberCount > 1 {
			writeError(response, http.StatusConflict, "LAST_OWNER", "你是唯一管理员，请先将管理员转交给其他成员")
			return
		}
		disband = true
	}

	result, err := tx.ExecContext(request.Context(),
		"DELETE FROM family_members WHERE family_id = ? AND user_id = ?", familyID, userID)
	if err != nil {
		r.logger.Error("leave family", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "退出家庭失败")
		return
	}
	if affected, err := result.RowsAffected(); err != nil || affected != 1 {
		r.logger.Error("read left family rows", "affected", affected, "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "退出家庭失败")
		return
	}

	// Move the user's active pointer to a remaining family (or NULL).
	if err := clearActiveFamily(request.Context(), tx, userID); err != nil {
		r.logger.Error("clear active family on leave", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "退出家庭失败")
		return
	}

	if disband {
		// Deleting the family cascades to family_members and business data.
		result, err = tx.ExecContext(request.Context(), "DELETE FROM families WHERE id = ?", familyID)
		if err != nil {
			r.logger.Error("disband family", "error", err)
			writeError(response, http.StatusInternalServerError, "DB_ERROR", "解散家庭失败")
			return
		}
		if affected, err := result.RowsAffected(); err != nil || affected != 1 {
			r.logger.Error("read disbanded family rows", "affected", affected, "error", err)
			writeError(response, http.StatusInternalServerError, "DB_ERROR", "解散家庭失败")
			return
		}
	}

	if err := tx.Commit(); err != nil {
		r.logger.Error("commit leave family", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "退出家庭失败")
		return
	}
	message := "已退出家庭"
	if disband {
		message = "已退出并解散家庭"
	}
	writeJSON(response, http.StatusOK, map[string]string{"message": message})
}

// --- Update Member Role ---

type updateRoleRequest struct {
	MemberID string `json:"member_id"`
	Role     string `json:"role"` // "owner" | "member"
}

func (r *router) updateMemberRole(response http.ResponseWriter, request *http.Request) {
	familyID := getUserFamilyID(request.Context())
	userID := getUserID(request.Context())

	var body updateRoleRequest
	if err := readJSON(request, &body); err != nil || body.MemberID == "" {
		writeError(response, http.StatusBadRequest, "INVALID_REQUEST", "缺少成员 ID")
		return
	}
	if body.Role != "owner" && body.Role != "member" {
		writeError(response, http.StatusBadRequest, "INVALID_ROLE", "角色只能是 owner 或 member")
		return
	}

	tx, err := r.db.BeginTx(request.Context(), nil)
	if err != nil {
		r.logger.Error("begin update member role", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "角色更新失败")
		return
	}
	defer tx.Rollback()

	actorRole, err := r.lockFamilyMember(request.Context(), tx, familyID, userID)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(response, http.StatusForbidden, "FORBIDDEN", "只有管理员才能修改角色")
		return
	}
	if err != nil {
		r.logger.Error("lock family for member role update", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "角色更新失败")
		return
	}
	if actorRole != "owner" {
		writeError(response, http.StatusForbidden, "FORBIDDEN", "只有管理员才能修改角色")
		return
	}

	var targetRole string
	err = tx.QueryRowContext(request.Context(),
		"SELECT role FROM family_members WHERE user_id = ? AND family_id = ? FOR UPDATE", body.MemberID, familyID,
	).Scan(&targetRole)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(response, http.StatusNotFound, "NOT_FOUND", "成员不在当前家庭中")
		return
	}
	if err != nil {
		r.logger.Error("find member for role update", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "角色更新失败")
		return
	}

	if targetRole == body.Role {
		if err := tx.Commit(); err != nil {
			r.logger.Error("commit unchanged member role", "error", err)
			writeError(response, http.StatusInternalServerError, "DB_ERROR", "角色更新失败")
			return
		}
		writeJSON(response, http.StatusOK, map[string]string{"message": "角色已更新"})
		return
	}

	if body.Role == "member" && targetRole == "owner" {
		var ownerCount int
		if err := tx.QueryRowContext(request.Context(),
			"SELECT COUNT(*) FROM family_members WHERE family_id = ? AND role = 'owner'", familyID,
		).Scan(&ownerCount); err != nil {
			r.logger.Error("count family owners for role update", "error", err)
			writeError(response, http.StatusInternalServerError, "DB_ERROR", "角色更新失败")
			return
		}
		if ownerCount <= 1 {
			writeError(response, http.StatusConflict, "LAST_OWNER", "家庭至少需要一位管理员")
			return
		}
	}

	result, err := tx.ExecContext(request.Context(),
		"UPDATE family_members SET role = ? WHERE user_id = ? AND family_id = ?", body.Role, body.MemberID, familyID)
	if err != nil {
		r.logger.Error("update member role", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "角色更新失败")
		return
	}
	if affected, err := result.RowsAffected(); err != nil || affected != 1 {
		r.logger.Error("read updated member role rows", "affected", affected, "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "角色更新失败")
		return
	}
	// Keep the target's active-family mirror in sync if that family is active.
	if _, err := tx.ExecContext(request.Context(),
		"UPDATE users SET role = ? WHERE id = ? AND family_id = ?", body.Role, body.MemberID, familyID); err != nil {
		r.logger.Error("sync active role", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "角色更新失败")
		return
	}
	if err := tx.Commit(); err != nil {
		r.logger.Error("commit member role update", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "角色更新失败")
		return
	}
	writeJSON(response, http.StatusOK, map[string]string{"message": "角色已更新"})
}

// --- Remove Member ---

type removeMemberRequest struct {
	MemberID string `json:"member_id"`
}

func (r *router) removeMember(response http.ResponseWriter, request *http.Request) {
	familyID := getUserFamilyID(request.Context())
	userID := getUserID(request.Context())

	var body removeMemberRequest
	if err := readJSON(request, &body); err != nil || body.MemberID == "" {
		writeError(response, http.StatusBadRequest, "INVALID_REQUEST", "缺少成员 ID")
		return
	}
	if body.MemberID == userID {
		writeError(response, http.StatusBadRequest, "CANNOT_REMOVE_SELF", "不能移除自己，请使用退出家庭功能")
		return
	}

	tx, err := r.db.BeginTx(request.Context(), nil)
	if err != nil {
		r.logger.Error("begin remove member", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "移除成员失败")
		return
	}
	defer tx.Rollback()

	actorRole, err := r.lockFamilyMember(request.Context(), tx, familyID, userID)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(response, http.StatusForbidden, "FORBIDDEN", "只有管理员才能移除成员")
		return
	}
	if err != nil {
		r.logger.Error("lock family for member removal", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "移除成员失败")
		return
	}
	if actorRole != "owner" {
		writeError(response, http.StatusForbidden, "FORBIDDEN", "只有管理员才能移除成员")
		return
	}

	var targetRole string
	err = tx.QueryRowContext(request.Context(),
		"SELECT role FROM family_members WHERE user_id = ? AND family_id = ? FOR UPDATE", body.MemberID, familyID,
	).Scan(&targetRole)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(response, http.StatusNotFound, "NOT_FOUND", "成员不在当前家庭中")
		return
	}
	if err != nil {
		r.logger.Error("find member for removal", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "移除成员失败")
		return
	}

	result, err := tx.ExecContext(request.Context(),
		"DELETE FROM family_members WHERE user_id = ? AND family_id = ?", body.MemberID, familyID)
	if err != nil {
		r.logger.Error("remove member", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "移除成员失败")
		return
	}
	if affected, err := result.RowsAffected(); err != nil || affected != 1 {
		r.logger.Error("read removed member rows", "affected", affected, "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "移除成员失败")
		return
	}
	// If the removed family was the target's active family, move their pointer.
	if _, err := tx.ExecContext(request.Context(),
		"UPDATE users SET family_id = NULL, role = 'member' WHERE id = ? AND family_id = ?", body.MemberID, familyID); err != nil {
		r.logger.Error("clear removed member active", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "移除成员失败")
		return
	}
	if _, err := tx.ExecContext(request.Context(),
		`UPDATE users u SET u.family_id = (
			SELECT m.family_id FROM family_members m WHERE m.user_id = u.id ORDER BY m.joined_at LIMIT 1
		 ) WHERE u.id = ? AND u.family_id IS NULL`, body.MemberID); err != nil {
		r.logger.Error("reassign removed member active", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "移除成员失败")
		return
	}
	if err := tx.Commit(); err != nil {
		r.logger.Error("commit member removal", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "移除成员失败")
		return
	}
	writeJSON(response, http.StatusOK, map[string]string{"message": "成员已移除"})
}

// --- Helpers ---

// lockFamilyMember serializes membership mutations per family and then
// revalidates the actor's membership inside the same transaction.
func (r *router) lockFamilyMember(ctx context.Context, tx *sql.Tx, familyID, userID string) (string, error) {
	var lockedFamilyID string
	if err := tx.QueryRowContext(ctx,
		"SELECT id FROM families WHERE id = ? FOR UPDATE", familyID,
	).Scan(&lockedFamilyID); err != nil {
		return "", err
	}

	var role string
	if err := tx.QueryRowContext(ctx,
		"SELECT role FROM family_members WHERE user_id = ? AND family_id = ? FOR UPDATE", userID, familyID,
	).Scan(&role); err != nil {
		return "", err
	}
	return role, nil
}

func generateInviteCode() string {
	const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // no I/O/0/1 to avoid confusion
	code := make([]byte, 6)
	for i := range code {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		code[i] = charset[n.Int64()]
	}
	return string(code)
}

// generateQRScene returns the scene value to encode in a miniprogram QR code.
func generateQRScene(code string) string {
	_ = hex.EncodeToString // keep import used
	return "invite=" + code
}
