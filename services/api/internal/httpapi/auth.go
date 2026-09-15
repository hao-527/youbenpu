package httpapi

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/zhanghao527/youbenpu/services/api/internal/database"
)

type contextKey string

const (
	ctxUserID   contextKey = "user_id"
	ctxFamilyID contextKey = "family_id"
)

// --- Login ---

type loginRequest struct {
	Code        string `json:"code"`
	DevIdentity string `json:"dev_identity"`
}

var demoIdentityPattern = regexp.MustCompile(`^[a-zA-Z0-9-]{16,96}$`)

type loginResponse struct {
	Token       string  `json:"token"`
	UserID      string  `json:"user_id"`
	FamilyID    *string `json:"family_id"`
	DisplayName string  `json:"display_name"`
	Role        string  `json:"role"`
	IsNewUser   bool    `json:"is_new_user"`
}

func (r *router) login(response http.ResponseWriter, request *http.Request) {
	var body loginRequest
	if err := readJSON(request, &body); err != nil || strings.TrimSpace(body.Code) == "" {
		writeError(response, http.StatusBadRequest, "INVALID_REQUEST", "code 不能为空")
		return
	}
	body.Code = strings.TrimSpace(body.Code)

	// Exchange code for openid via WeChat API
	openid, err := r.wxCode2Session(request.Context(), body.Code, body.DevIdentity)
	if err != nil {
		r.logger.Error("wx code2session", "error", err)
		writeError(response, http.StatusUnauthorized, "WX_AUTH_FAILED", "微信登录失败")
		return
	}

	// Find or create user
	var userID, displayName, role string
	var familyID sql.NullString
	isNewUser := false

	err = r.db.QueryRow(
		"SELECT id, family_id, display_name, role FROM users WHERE openid = ?", openid,
	).Scan(&userID, &familyID, &displayName, &role)

	if err == sql.ErrNoRows {
		// Create new user
		userID = database.NewID()
		displayName = "新成员"
		role = "member"
		_, err = r.db.Exec(
			"INSERT INTO users (id, openid, display_name, role, avatar_text) VALUES (?, ?, ?, ?, ?)",
			userID, openid, displayName, role, "新",
		)
		if err != nil {
			r.logger.Error("create user", "error", err)
			writeError(response, http.StatusInternalServerError, "DB_ERROR", "创建用户失败")
			return
		}
		isNewUser = true
	} else if err != nil {
		r.logger.Error("query user", "error", err)
		writeError(response, http.StatusInternalServerError, "DB_ERROR", "查询用户失败")
		return
	}

	// Generate JWT
	token, err := r.signJWT(userID, familyID.String)
	if err != nil {
		r.logger.Error("sign jwt", "error", err)
		writeError(response, http.StatusInternalServerError, "TOKEN_ERROR", "生成令牌失败")
		return
	}

	resp := loginResponse{
		Token:       token,
		UserID:      userID,
		DisplayName: displayName,
		Role:        role,
		IsNewUser:   isNewUser,
	}
	if familyID.Valid {
		resp.FamilyID = &familyID.String
	}

	writeJSON(response, http.StatusOK, resp)
}

// --- JWT ---

type jwtClaims struct {
	jwt.RegisteredClaims
	UserID   string `json:"uid"`
	FamilyID string `json:"fid,omitempty"`
}

func (r *router) signJWT(userID, familyID string) (string, error) {
	now := time.Now()
	claims := jwtClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(7 * 24 * time.Hour)),
			Issuer:    "youbenpu",
		},
		UserID:   userID,
		FamilyID: familyID,
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(r.config.JWTSecret))
}

func (r *router) parseJWT(tokenString string) (*jwtClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &jwtClaims{}, func(t *jwt.Token) (any, error) {
		// Do not accept another HMAC variant (or an algorithm confusion token)
		// just because it shares the same secret.
		if t.Method.Alg() != jwt.SigningMethodHS256.Alg() {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(r.config.JWTSecret), nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*jwtClaims)
	if !ok || !token.Valid || claims.UserID == "" || claims.Issuer != "youbenpu" {
		return nil, fmt.Errorf("invalid token claims")
	}
	return claims, nil
}

// --- Auth Middleware ---

func (r *router) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		authHeader := request.Header.Get("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			writeError(response, http.StatusUnauthorized, "UNAUTHORIZED", "请先登录")
			return
		}

		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		claims, err := r.parseJWT(tokenString)
		if err != nil {
			writeError(response, http.StatusUnauthorized, "INVALID_TOKEN", "登录已过期，请重新登录")
			return
		}

		// Refresh family_id from DB in case it changed (user joined a family after token was issued)
		var familyID sql.NullString
		err = r.db.QueryRow("SELECT family_id FROM users WHERE id = ?", claims.UserID).Scan(&familyID)
		if err != nil {
			writeError(response, http.StatusUnauthorized, "USER_NOT_FOUND", "用户不存在")
			return
		}

		ctx := context.WithValue(request.Context(), ctxUserID, claims.UserID)
		if familyID.Valid {
			ctx = context.WithValue(ctx, ctxFamilyID, familyID.String)
		}

		next.ServeHTTP(response, request.WithContext(ctx))
	})
}

// requireFamily ensures the user has joined a family. Re-read membership
// immediately before the handler instead of trusting the value loaded by the
// authentication middleware, which may be stale after a leave/remove action.
func (r *router) requireFamily(next http.Handler) http.Handler {
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		userID := getUserID(request.Context())
		var familyID sql.NullString
		if err := r.db.QueryRowContext(request.Context(), "SELECT family_id FROM users WHERE id = ?", userID).Scan(&familyID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				writeError(response, http.StatusUnauthorized, "USER_NOT_FOUND", "用户不存在")
				return
			}
			r.logger.Error("recheck family membership", "error", err)
			writeError(response, http.StatusInternalServerError, "DB_ERROR", "校验家庭状态失败")
			return
		}
		if !familyID.Valid || strings.TrimSpace(familyID.String) == "" {
			writeError(response, http.StatusForbidden, "NO_FAMILY", "请先创建或加入一个家庭")
			return
		}

		ctx := context.WithValue(request.Context(), ctxFamilyID, familyID.String)
		next.ServeHTTP(response, request.WithContext(ctx))
	})
}

func getUserID(ctx context.Context) string {
	v, _ := ctx.Value(ctxUserID).(string)
	return v
}

func getUserFamilyID(ctx context.Context) string {
	v, _ := ctx.Value(ctxFamilyID).(string)
	return v
}

// --- WeChat code2Session ---

type wxSessionResponse struct {
	OpenID     string `json:"openid"`
	SessionKey string `json:"session_key"`
	ErrCode    int    `json:"errcode"`
	ErrMsg     string `json:"errmsg"`
}

func (r *router) wxCode2Session(ctx context.Context, code, devIdentity string) (string, error) {
	// A development identity is never accepted merely because WeChat is not
	// configured. It must be explicitly enabled and is always rejected in
	// production.
	if r.config.WXAppID == "" {
		if !r.config.EnableDevLogin || r.config.Environment == "production" {
			return "", fmt.Errorf("development login is disabled")
		}
		identity := strings.TrimSpace(devIdentity)
		if !demoIdentityPattern.MatchString(identity) {
			return "", fmt.Errorf("missing or invalid development identity")
		}
		return "dev_openid_" + identity, nil
	}

	query := url.Values{}
	query.Set("appid", r.config.WXAppID)
	query.Set("secret", r.config.WXAppSecret)
	query.Set("js_code", code)
	query.Set("grant_type", "authorization_code")
	endpoint := "https://api.weixin.qq.com/sns/jscode2session?" + query.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return "", fmt.Errorf("create wechat request: %w", err)
	}
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("request wechat api: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return "", fmt.Errorf("wechat api returned status %d", resp.StatusCode)
	}

	bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, 64<<10))
	if err != nil {
		return "", fmt.Errorf("read response: %w", err)
	}

	var session wxSessionResponse
	if err := json.Unmarshal(bodyBytes, &session); err != nil {
		return "", fmt.Errorf("unmarshal response: %w", err)
	}

	if session.ErrCode != 0 {
		return "", fmt.Errorf("wechat error %d: %s", session.ErrCode, session.ErrMsg)
	}

	if session.OpenID == "" {
		return "", fmt.Errorf("empty openid in response")
	}

	return session.OpenID, nil
}

const maxJSONBodySize = 1 << 20 // 1 MiB

func readJSON(request *http.Request, dest any) error {
	body, err := io.ReadAll(io.LimitReader(request.Body, maxJSONBodySize+1))
	if err != nil {
		return err
	}
	if len(body) > maxJSONBodySize {
		return fmt.Errorf("request body too large")
	}

	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dest); err != nil {
		return err
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return fmt.Errorf("request contains multiple JSON values")
		}
		return fmt.Errorf("invalid trailing data: %w", err)
	}
	return nil
}
