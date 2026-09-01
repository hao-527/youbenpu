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
	avatarText := string([]rune(body.DisplayName)[:1])
	tx, err := r.db.BeginTx(request.Context(), nil)
	if err != nil {
		r.logger.Error("begin create family", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "操作失败")
		return
	}
	defer tx.Rollback()

	var existingFamilyID sql.NullString
	err = tx.QueryRowContext(request.Context(),
		"SELECT family_id FROM users WHERE id = ? FOR UPDATE", userID,
	).Scan(&existingFamilyID)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(response, http.StatusUnauthorized, "USER_NOT_FOUND", "用户不存在")
		return
	}
	if err != nil {
		r.logger.Error("check user family before create", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "操作失败")
		return
	}
	if existingFamilyID.Valid {
		writeError(response, http.StatusConflict, "ALREADY_IN_FAMILY", "你已经在一个家庭中了")
		return
	}

	if _, err = tx.ExecContext(request.Context(),
		"INSERT INTO families (id, name) VALUES (?, ?)", familyID, body.Name,
	); err != nil {
		r.logger.Error("insert family", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "创建家庭失败")
		return
	}

	result, err := tx.ExecContext(request.Context(),
		"UPDATE users SET family_id = ?, role = 'owner', display_name = ?, avatar_text = ? WHERE id = ? AND family_id IS NULL",
		familyID, body.DisplayName, avatarText, userID,
	)
	if err != nil {
		r.logger.Error("update user family", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "绑定家庭失败")
		return
	}
	if affected, err := result.RowsAffected(); err != nil || affected != 1 {
		r.logger.Error("read bound family rows", "affected", affected, "error", err)
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
		"SELECT id, display_name, role, avatar_text FROM users WHERE family_id = ? ORDER BY created_at",
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
			continue
		}
		members = append(members, m)
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

// --- Join Family by Code ---

type joinFamilyRequest struct {
	Code        string `json:"code"`
	DisplayName string `json:"display_name"`
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

	// Discover the target family before the transaction, then revalidate every
	// authoritative value under locks ordered family -> user -> invitation.
	var candidateFamilyID string
	err := r.db.QueryRowContext(request.Context(),
		"SELECT family_id FROM invitations WHERE code = ?", body.Code,
	).Scan(&candidateFamilyID)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(response, http.StatusNotFound, "INVALID_CODE", "邀请码无效")
		return
	}
	if err != nil {
		r.logger.Error("discover invitation family", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
		return
	}

	tx, err := r.db.BeginTx(request.Context(), nil)
	if err != nil {
		r.logger.Error("begin join family", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "操作失败")
		return
	}
	defer tx.Rollback()

	var lockedFamilyID string
	err = tx.QueryRowContext(request.Context(),
		"SELECT id FROM families WHERE id = ? FOR UPDATE", candidateFamilyID,
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

	var existingFamilyID sql.NullString
	err = tx.QueryRowContext(request.Context(),
		"SELECT family_id FROM users WHERE id = ? FOR UPDATE", userID,
	).Scan(&existingFamilyID)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(response, http.StatusUnauthorized, "USER_NOT_FOUND", "用户不存在")
		return
	}
	if err != nil {
		r.logger.Error("check user family before join", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询失败")
		return
	}
	if existingFamilyID.Valid {
		writeError(response, http.StatusConflict, "ALREADY_IN_FAMILY", "你已经在一个家庭中了，需要先退出当前家庭")
		return
	}

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
	if familyID != candidateFamilyID {
		writeError(response, http.StatusNotFound, "INVALID_CODE", "邀请码无效")
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

	avatarText := string([]rune(body.DisplayName)[:1])
	result, err := tx.ExecContext(request.Context(),
		"UPDATE users SET family_id = ?, role = 'member', display_name = ?, avatar_text = ? WHERE id = ? AND family_id IS NULL",
		familyID, body.DisplayName, avatarText, userID,
	)
	if err != nil {
		r.logger.Error("join family", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "加入家庭失败")
		return
	}
	if affected, err := result.RowsAffected(); err != nil || affected != 1 {
		r.logger.Error("read joined family rows", "affected", affected, "error", err)
		writeError(response, http.StatusConflict, "ALREADY_IN_FAMILY", "用户家庭状态已变化，请重试")
		return
	}

	result, err = tx.ExecContext(request.Context(),
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

	if err := tx.Commit(); err != nil {
		r.logger.Error("commit join family", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "操作失败")
		return
	}
	writeJSON(response, http.StatusOK, map[string]string{"family_id": familyID, "message": "已加入家庭"})
}

// --- Join Family by QR (same logic, different entry point) ---
// The QR code encodes the same invitation code — the frontend scans it and calls joinFamily.
// No separate endpoint needed; the QR contains the code.

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

	var ownerCount int
	if err := tx.QueryRowContext(request.Context(),
		"SELECT COUNT(*) FROM users WHERE family_id = ? AND role = 'owner'", familyID,
	).Scan(&ownerCount); err != nil {
		r.logger.Error("count family owners for leave", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "退出家庭失败")
		return
	}

	disband := false
	if userRole == "owner" && ownerCount <= 1 {
		var memberCount int
		if err := tx.QueryRowContext(request.Context(),
			"SELECT COUNT(*) FROM users WHERE family_id = ?", familyID,
		).Scan(&memberCount); err != nil {
			r.logger.Error("count family members for leave", "error", err)
			writeError(response, http.StatusInternalServerError, "DB_ERROR", "退出家庭失败")
			return
		}
		if memberCount > 1 {
			writeError(response, http.StatusConflict, "LAST_OWNER", "你是唯一管理员，请先将管理员转交给其他成员")
			return
		}
		disband = true
	}

	result, err := tx.ExecContext(request.Context(),
		"UPDATE users SET family_id = NULL, role = 'member' WHERE id = ? AND family_id = ?", userID, familyID)
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

	if disband {
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
		"SELECT role FROM users WHERE id = ? AND family_id = ? FOR UPDATE", body.MemberID, familyID,
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
			"SELECT COUNT(*) FROM users WHERE family_id = ? AND role = 'owner'", familyID,
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
		"UPDATE users SET role = ? WHERE id = ? AND family_id = ?", body.Role, body.MemberID, familyID)
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
		"SELECT role FROM users WHERE id = ? AND family_id = ? FOR UPDATE", body.MemberID, familyID,
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
		"UPDATE users SET family_id = NULL, role = 'member' WHERE id = ? AND family_id = ?", body.MemberID, familyID)
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
		"SELECT role FROM users WHERE id = ? AND family_id = ? FOR UPDATE", userID, familyID,
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
// The frontend generates the QR via wx.getUnlimitedQRCode with this scene.
func generateQRScene(code string) string {
	_ = hex.EncodeToString // keep import used
	return "invite=" + code
}
