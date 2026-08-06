package httpapi

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"math/big"
	"net/http"
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

	if body.Name == "" {
		body.Name = "我们家"
	}
	if len([]rune(body.Name)) > 20 {
		writeError(response, http.StatusBadRequest, "NAME_TOO_LONG", "家庭名称最多 20 个字")
		return
	}
	if body.DisplayName == "" {
		body.DisplayName = "我"
	}
	if len([]rune(body.DisplayName)) > 20 {
		writeError(response, http.StatusBadRequest, "NAME_TOO_LONG", "成员名称最多 20 个字")
		return
	}

	// Check user doesn't already have a family
	var existingFamilyID sql.NullString
	r.db.QueryRow("SELECT family_id FROM users WHERE id = ?", userID).Scan(&existingFamilyID)
	if existingFamilyID.Valid {
		writeError(response, http.StatusConflict, "ALREADY_IN_FAMILY", "你已经在一个家庭中了")
		return
	}

	familyID := database.NewID()
	avatarText := string([]rune(body.DisplayName)[:1])

	tx, err := r.db.Begin()
	if err != nil {
		r.logger.Error("begin tx", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "操作失败")
		return
	}
	defer tx.Rollback()

	_, err = tx.Exec("INSERT INTO families (id, name) VALUES (?, ?)", familyID, body.Name)
	if err != nil {
		r.logger.Error("insert family", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "创建家庭失败")
		return
	}

	_, err = tx.Exec(
		"UPDATE users SET family_id = ?, role = 'owner', display_name = ?, avatar_text = ? WHERE id = ?",
		familyID, body.DisplayName, avatarText, userID,
	)
	if err != nil {
		r.logger.Error("update user family", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "绑定家庭失败")
		return
	}

	// Add default locations
	defaultLocations := []string{"冰箱冷藏", "冰箱冷冻", "橱柜", "药箱", "浴室"}
	for _, loc := range defaultLocations {
		_, _ = tx.Exec("INSERT INTO locations (id, family_id, name) VALUES (?, ?, ?)",
			database.NewID(), familyID, loc)
	}

	if err := tx.Commit(); err != nil {
		r.logger.Error("commit tx", "error", err)
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

	if !r.isOwner(userID) {
		writeError(response, http.StatusForbidden, "FORBIDDEN", "只有管理员才能修改家庭名称")
		return
	}

	var body renameFamilyRequest
	if err := readJSON(request, &body); err != nil || body.Name == "" {
		writeError(response, http.StatusBadRequest, "INVALID_REQUEST", "请填写新名称")
		return
	}
	if len([]rune(body.Name)) > 20 {
		writeError(response, http.StatusBadRequest, "NAME_TOO_LONG", "家庭名称最多 20 个字")
		return
	}

	r.db.Exec("UPDATE families SET name = ? WHERE id = ?", body.Name, familyID)
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

	if !r.isOwner(userID) {
		writeError(response, http.StatusForbidden, "FORBIDDEN", "只有管理员才能邀请成员")
		return
	}

	code := generateInviteCode()
	expiresAt := time.Now().Add(24 * time.Hour)
	id := database.NewID()

	_, err := r.db.Exec(
		"INSERT INTO invitations (id, family_id, code, expires_at) VALUES (?, ?, ?, ?)",
		id, familyID, code, expiresAt,
	)
	if err != nil {
		r.logger.Error("create invitation", "error", err)
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

	// Check user doesn't already have a family
	var existingFamilyID sql.NullString
	r.db.QueryRow("SELECT family_id FROM users WHERE id = ?", userID).Scan(&existingFamilyID)
	if existingFamilyID.Valid {
		writeError(response, http.StatusConflict, "ALREADY_IN_FAMILY", "你已经在一个家庭中了，需要先退出当前家庭")
		return
	}

	var body joinFamilyRequest
	if err := readJSON(request, &body); err != nil || body.Code == "" {
		writeError(response, http.StatusBadRequest, "INVALID_REQUEST", "邀请码不能为空")
		return
	}
	if body.DisplayName == "" {
		body.DisplayName = "新成员"
	}
	if len([]rune(body.DisplayName)) > 20 {
		writeError(response, http.StatusBadRequest, "NAME_TOO_LONG", "成员名称最多 20 个字")
		return
	}

	// Find valid invitation
	var invID, familyID string
	var expiresAt time.Time
	var usedBy sql.NullString
	err := r.db.QueryRow(
		"SELECT id, family_id, expires_at, used_by FROM invitations WHERE code = ?", body.Code,
	).Scan(&invID, &familyID, &expiresAt, &usedBy)

	if err == sql.ErrNoRows {
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

	// Join family
	avatarText := string([]rune(body.DisplayName)[:1])

	tx, err := r.db.Begin()
	if err != nil {
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "操作失败")
		return
	}
	defer tx.Rollback()

	_, err = tx.Exec(
		"UPDATE users SET family_id = ?, role = 'member', display_name = ?, avatar_text = ? WHERE id = ?",
		familyID, body.DisplayName, avatarText, userID,
	)
	if err != nil {
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "加入家庭失败")
		return
	}

	_, _ = tx.Exec("UPDATE invitations SET used_by = ? WHERE id = ?", userID, invID)

	if err := tx.Commit(); err != nil {
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

	// Check if user is the only owner
	var ownerCount int
	r.db.QueryRow("SELECT COUNT(*) FROM users WHERE family_id = ? AND role = 'owner'", familyID).Scan(&ownerCount)

	var userRole string
	r.db.QueryRow("SELECT role FROM users WHERE id = ?", userID).Scan(&userRole)

	if userRole == "owner" && ownerCount <= 1 {
		// Check if there are other members
		var memberCount int
		r.db.QueryRow("SELECT COUNT(*) FROM users WHERE family_id = ?", familyID).Scan(&memberCount)
		if memberCount > 1 {
			writeError(response, http.StatusConflict, "LAST_OWNER", "你是唯一管理员，请先将管理员转交给其他成员")
			return
		}
		// Last person leaving — delete the family
		r.db.Exec("UPDATE users SET family_id = NULL, role = 'member' WHERE id = ?", userID)
		r.db.Exec("DELETE FROM families WHERE id = ?", familyID)
		writeJSON(response, http.StatusOK, map[string]string{"message": "已退出并解散家庭"})
		return
	}

	r.db.Exec("UPDATE users SET family_id = NULL, role = 'member' WHERE id = ?", userID)
	writeJSON(response, http.StatusOK, map[string]string{"message": "已退出家庭"})
}

// --- Update Member Role ---

type updateRoleRequest struct {
	MemberID string `json:"member_id"`
	Role     string `json:"role"` // "owner" | "member"
}

func (r *router) updateMemberRole(response http.ResponseWriter, request *http.Request) {
	familyID := getUserFamilyID(request.Context())
	userID := getUserID(request.Context())

	if !r.isOwner(userID) {
		writeError(response, http.StatusForbidden, "FORBIDDEN", "只有管理员才能修改角色")
		return
	}

	var body updateRoleRequest
	if err := readJSON(request, &body); err != nil || body.MemberID == "" {
		writeError(response, http.StatusBadRequest, "INVALID_REQUEST", "缺少成员 ID")
		return
	}
	if body.Role != "owner" && body.Role != "member" {
		writeError(response, http.StatusBadRequest, "INVALID_ROLE", "角色只能是 owner 或 member")
		return
	}

	// Verify target belongs to same family
	var targetFamilyID sql.NullString
	r.db.QueryRow("SELECT family_id FROM users WHERE id = ?", body.MemberID).Scan(&targetFamilyID)
	if !targetFamilyID.Valid || targetFamilyID.String != familyID {
		writeError(response, http.StatusNotFound, "NOT_FOUND", "成员不在当前家庭中")
		return
	}

	// Prevent demoting last owner
	if body.Role == "member" {
		var ownerCount int
		r.db.QueryRow("SELECT COUNT(*) FROM users WHERE family_id = ? AND role = 'owner'", familyID).Scan(&ownerCount)
		var targetRole string
		r.db.QueryRow("SELECT role FROM users WHERE id = ?", body.MemberID).Scan(&targetRole)
		if targetRole == "owner" && ownerCount <= 1 {
			writeError(response, http.StatusConflict, "LAST_OWNER", "家庭至少需要一位管理员")
			return
		}
	}

	r.db.Exec("UPDATE users SET role = ? WHERE id = ?", body.Role, body.MemberID)
	writeJSON(response, http.StatusOK, map[string]string{"message": "角色已更新"})
}

// --- Remove Member ---

type removeMemberRequest struct {
	MemberID string `json:"member_id"`
}

func (r *router) removeMember(response http.ResponseWriter, request *http.Request) {
	familyID := getUserFamilyID(request.Context())
	userID := getUserID(request.Context())

	if !r.isOwner(userID) {
		writeError(response, http.StatusForbidden, "FORBIDDEN", "只有管理员才能移除成员")
		return
	}

	var body removeMemberRequest
	if err := readJSON(request, &body); err != nil || body.MemberID == "" {
		writeError(response, http.StatusBadRequest, "INVALID_REQUEST", "缺少成员 ID")
		return
	}

	if body.MemberID == userID {
		writeError(response, http.StatusBadRequest, "CANNOT_REMOVE_SELF", "不能移除自己，请使用退出家庭功能")
		return
	}

	var targetFamilyID sql.NullString
	r.db.QueryRow("SELECT family_id FROM users WHERE id = ?", body.MemberID).Scan(&targetFamilyID)
	if !targetFamilyID.Valid || targetFamilyID.String != familyID {
		writeError(response, http.StatusNotFound, "NOT_FOUND", "成员不在当前家庭中")
		return
	}

	r.db.Exec("UPDATE users SET family_id = NULL, role = 'member' WHERE id = ?", body.MemberID)
	writeJSON(response, http.StatusOK, map[string]string{"message": "成员已移除"})
}

// --- Helpers ---

func (r *router) isOwner(userID string) bool {
	var role string
	err := r.db.QueryRow("SELECT role FROM users WHERE id = ?", userID).Scan(&role)
	return err == nil && role == "owner"
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
