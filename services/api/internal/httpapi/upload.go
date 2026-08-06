package httpapi

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/zhanghao527/youbenpu/services/api/internal/database"
)

// COS direct upload from miniprogram uses a server-signed policy.
// This avoids putting SecretKey in the client, and avoids routing file bytes
// through our API server (saves bandwidth).
//
// Flow:
// 1. Client calls POST /api/v1/upload/presign with desired file extension
// 2. Server returns { url, key, policy, signature, secret_id } — valid for 10 minutes
// 3. Client uses wx.uploadFile to PUT directly to COS with those credentials
//
// We use COS "POST Object" with a signed policy (simpler than STS temporary credentials
// and doesn't require the STS SDK).

type presignRequest struct {
	Ext string `json:"ext"` // e.g. "jpg", "png", "webp"
}

type presignResponse struct {
	URL           string `json:"url"`
	Key           string `json:"key"`
	Policy        string `json:"policy"`
	Signature     string `json:"signature"`
	SecretID      string `json:"secret_id"`
	SecurityToken string `json:"security_token,omitempty"`
}

func (r *router) uploadPresign(response http.ResponseWriter, request *http.Request) {
	if r.config.COSSecretID == "" || r.config.COSSecretKey == "" {
		writeError(response, http.StatusServiceUnavailable, "NOT_CONFIGURED", "图片上传服务未配置")
		return
	}

	var body presignRequest
	if err := readJSON(request, &body); err != nil {
		writeError(response, http.StatusBadRequest, "INVALID_REQUEST", "请求格式错误")
		return
	}

	// Validate extension
	allowedExts := map[string]bool{"jpg": true, "jpeg": true, "png": true, "webp": true, "gif": true}
	if !allowedExts[body.Ext] {
		body.Ext = "jpg"
	}

	// Generate unique key
	objectKey := fmt.Sprintf("uploads/%s/%s.%s",
		time.Now().Format("2006/01/02"),
		database.NewID(),
		body.Ext,
	)

	// COS bucket URL
	cosURL := fmt.Sprintf("https://%s.cos.%s.myqcloud.com", r.config.COSBucket, r.config.COSRegion)

	// Build policy (valid for 10 minutes)
	expiration := time.Now().Add(10 * time.Minute).UTC().Format("2006-01-02T15:04:05.000Z")
	policyDoc := map[string]any{
		"expiration": expiration,
		"conditions": []any{
			map[string]string{"bucket": r.config.COSBucket},
			[]any{"eq", "$key", objectKey},
			[]any{"content-length-range", 1, 10 * 1024 * 1024}, // max 10MB
		},
	}

	policyJSON, _ := json.Marshal(policyDoc)
	policyBase64 := base64.StdEncoding.EncodeToString(policyJSON)

	// Sign the policy with HMAC-SHA1
	mac := hmac.New(sha1.New, []byte(r.config.COSSecretKey))
	mac.Write([]byte(policyBase64))
	signature := hex.EncodeToString(mac.Sum(nil))

	writeJSON(response, http.StatusOK, presignResponse{
		URL:       cosURL,
		Key:       objectKey,
		Policy:    policyBase64,
		Signature: signature,
		SecretID:  r.config.COSSecretID,
	})
}
