package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/zhanghao527/youbenpu/services/api/internal/config"
)

type failingWechatTransport struct{}

func TestMetaReportsAuthenticationModeWithoutCredentials(t *testing.T) {
	for _, tc := range []struct {
		name string
		cfg  config.Config
		mode string
	}{
		{"development", config.Config{Environment: "development", EnableDevLogin: true}, "development"},
		{"disabled", config.Config{Environment: "test"}, "disabled"},
		{"production-no-fallback", config.Config{Environment: "production", EnableDevLogin: true}, "disabled"},
		{"wechat", config.Config{Environment: "test", WXAppID: "isolated-app", WXAppSecret: "isolated-placeholder"}, "wechat"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := router{config: tc.cfg}
			response := httptest.NewRecorder()
			r.meta(response, httptest.NewRequest(http.MethodGet, "/api/v1/meta", nil))
			var body map[string]string
			if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil || body["auth_mode"] != tc.mode {
				t.Fatalf("unexpected authentication mode: %s", body["auth_mode"])
			}
			if strings.Contains(response.Body.String(), "isolated-") {
				t.Fatal("metadata must not expose credentials")
			}
		})
	}
}

func (failingWechatTransport) RoundTrip(*http.Request) (*http.Response, error) {
	return nil, errors.New("isolated transport failure")
}

func TestWechatTransportFailureDoesNotExposeCredentials(t *testing.T) {
	original := http.DefaultTransport
	http.DefaultTransport = failingWechatTransport{}
	t.Cleanup(func() { http.DefaultTransport = original })
	r := router{config: config.Config{WXAppID: "unit-test-app", WXAppSecret: "unit-test-placeholder-secret"}}
	_, err := r.wxCode2Session(context.Background(), "unit-test-placeholder-code", "")
	if err == nil || strings.Contains(err.Error(), "placeholder") || strings.Contains(err.Error(), "jscode2session?") {
		t.Fatal("transport error must not expose the request URL or credentials")
	}
}

func TestDevelopmentLoginBoundary(t *testing.T) {
	for _, tc := range []struct {
		name, environment, identity string
		enabled, allowed            bool
	}{
		{"local-enabled", "development", "delivery-auth-local-identity", true, true},
		{"production-always-rejected", "production", "delivery-auth-local-identity", true, false},
		{"disabled-rejected", "development", "delivery-auth-local-identity", false, false},
		{"missing-identity-rejected", "development", "", true, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := router{config: config.Config{Environment: tc.environment, EnableDevLogin: tc.enabled}}
			_, err := r.wxCode2Session(context.Background(), "local-development", tc.identity)
			if (err == nil) != tc.allowed {
				t.Fatalf("allowed=%v error=%v", tc.allowed, err)
			}
		})
	}
}

func TestSessionTokenBoundaries(t *testing.T) {
	const key = "isolated-unit-test-only"
	r := router{config: config.Config{JWTSecret: key}}
	valid, err := r.signJWT("delivery-user", "delivery-family")
	if err != nil {
		t.Fatal(err)
	}
	if claims, err := r.parseJWT(valid); err != nil || claims.UserID != "delivery-user" {
		t.Fatal("valid token rejected")
	}
	for _, tc := range []struct {
		name, issuer, user string
		method             jwt.SigningMethod
		expiry             time.Time
	}{
		{"expired", "youbenpu", "delivery-user", jwt.SigningMethodHS256, time.Now().Add(-time.Minute)},
		{"wrong-issuer", "other", "delivery-user", jwt.SigningMethodHS256, time.Now().Add(time.Hour)},
		{"empty-user", "youbenpu", "", jwt.SigningMethodHS256, time.Now().Add(time.Hour)},
		{"other-hmac-variant", "youbenpu", "delivery-user", jwt.SigningMethodHS512, time.Now().Add(time.Hour)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			token, err := jwt.NewWithClaims(tc.method, jwtClaims{UserID: tc.user, RegisteredClaims: jwt.RegisteredClaims{Issuer: tc.issuer, ExpiresAt: jwt.NewNumericDate(tc.expiry)}}).SignedString([]byte(key))
			if err != nil {
				t.Fatal(err)
			}
			if _, err := r.parseJWT(token); err == nil {
				t.Fatal("invalid session accepted")
			}
		})
	}
}

func TestSessionTokenRequiresExpiration(t *testing.T) {
	r := router{config: config.Config{JWTSecret: "isolated-expiry-test"}}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwtClaims{
		UserID: "isolated-user", RegisteredClaims: jwt.RegisteredClaims{Issuer: "youbenpu"},
	}).SignedString([]byte(r.config.JWTSecret))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := r.parseJWT(token); err == nil {
		t.Fatal("token without expiration must be rejected")
	}
}
