package httpapi

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/zhanghao527/youbenpu/services/api/internal/database"
)

const maxImageUploadSize = 10 << 20 // 10 MiB

// COS direct upload from miniprogram uses a server-signed policy.
// The local upload endpoint below is used for development when the configured
// ObjectStore is LocalStore and COS credentials are intentionally absent.
type presignRequest struct {
	Ext string `json:"ext"` // e.g. "jpg", "png", "webp"
}

type presignResponse struct {
	URL           string `json:"url"`
	Key           string `json:"key"`
	Policy        string `json:"policy"`
	Signature     string `json:"signature"`
	SecretID      string `json:"secret_id"`
	ContentType   string `json:"content_type"`
	SecurityToken string `json:"security_token,omitempty"`
}

type uploadResponse struct {
	URL string `json:"url"`
}

// upload receives one multipart image and persists it through the configured
// ObjectStore. It is intentionally protected by authFamily so anonymous callers
// cannot use this development API as arbitrary file storage.
func (r *router) upload(response http.ResponseWriter, request *http.Request) {
	if r.objectStore == nil {
		writeError(response, http.StatusServiceUnavailable, "NOT_CONFIGURED", "图片上传服务未配置")
		return
	}

	// Leave room for multipart headers while keeping the actual file under 10 MiB.
	request.Body = http.MaxBytesReader(response, request.Body, maxImageUploadSize+(1<<20))
	if err := request.ParseMultipartForm(maxImageUploadSize); err != nil {
		writeError(response, http.StatusBadRequest, "INVALID_UPLOAD", "图片文件不能超过 10MB")
		return
	}

	defer request.MultipartForm.RemoveAll()

	file, header, err := request.FormFile("file")
	if err != nil {
		writeError(response, http.StatusBadRequest, "INVALID_UPLOAD", "请选择要上传的图片")
		return
	}
	defer file.Close()

	if header.Size <= 0 || header.Size > maxImageUploadSize {
		writeError(response, http.StatusBadRequest, "INVALID_UPLOAD", "图片文件不能超过 10MB")
		return
	}

	// Detect the real file bytes instead of trusting its filename or request header.
	probe := make([]byte, 512)
	count, readErr := io.ReadFull(file, probe)
	if readErr != nil && !errors.Is(readErr, io.ErrUnexpectedEOF) && !errors.Is(readErr, io.EOF) {
		writeError(response, http.StatusBadRequest, "INVALID_UPLOAD", "无法读取图片文件")
		return
	}
	probe = probe[:count]
	contentType := http.DetectContentType(probe)
	ext, ok := imageExtension(contentType)
	if !ok {
		writeError(response, http.StatusBadRequest, "INVALID_IMAGE", "仅支持 JPG、PNG、WEBP 或 GIF 图片")
		return
	}

	objectKey := fmt.Sprintf("uploads/%s/%s.%s", time.Now().Format("2006/01/02"), database.NewID(), ext)
	object, err := r.objectStore.Put(request.Context(), objectKey, contentType, io.MultiReader(bytes.NewReader(probe), file))
	if err != nil {
		r.logger.Error("store uploaded image", "error", err)
		writeError(response, http.StatusInternalServerError, "UPLOAD_FAILED", "图片上传失败，请稍后重试")
		return
	}

	writeJSON(response, http.StatusCreated, uploadResponse{URL: publicUploadURL(request, object.Key, object.PublicURL)})
}

func imageExtension(contentType string) (string, bool) {
	switch contentType {
	case "image/jpeg":
		return "jpg", true
	case "image/png":
		return "png", true
	case "image/webp":
		return "webp", true
	case "image/gif":
		return "gif", true
	default:
		return "", false
	}
}

func publicUploadURL(request *http.Request, key, objectPublicURL string) string {
	// COS gives uploads an HTTPS URL that a physical device can load directly.
	// Keep the API proxy as the local-storage fallback.
	if strings.HasPrefix(objectPublicURL, "https://") {
		return objectPublicURL
	}

	scheme := "http"
	if request.TLS != nil || strings.EqualFold(request.Header.Get("X-Forwarded-Proto"), "https") {
		scheme = "https"
	}
	return fmt.Sprintf("%s://%s/uploads/%s", scheme, request.Host, strings.TrimPrefix(key, "/"))
}

// serveUpload makes stored images available to mini-program Image components.
// Image downloads cannot include the JWT header, so upload keys are random and
// the ObjectStore remains responsible for path validation.
func (r *router) serveUpload(response http.ResponseWriter, request *http.Request) {
	if r.objectStore == nil {
		writeError(response, http.StatusServiceUnavailable, "NOT_CONFIGURED", "图片上传服务未配置")
		return
	}

	key := strings.TrimSpace(request.PathValue("path"))
	if key == "" || !strings.HasPrefix(key, "uploads/") {
		writeError(response, http.StatusNotFound, "NOT_FOUND", "图片不存在")
		return
	}

	file, object, err := r.objectStore.Open(request.Context(), key)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			writeError(response, http.StatusNotFound, "NOT_FOUND", "图片不存在")
			return
		}
		r.logger.Error("open uploaded image", "key", key, "error", err)
		writeError(response, http.StatusInternalServerError, "IMAGE_UNAVAILABLE", "图片暂时无法加载")
		return
	}
	defer file.Close()

	if _, ok := imageExtension(object.ContentType); !ok {
		writeError(response, http.StatusNotFound, "NOT_FOUND", "图片不存在")
		return
	}

	response.Header().Set("Content-Type", object.ContentType)
	response.Header().Set("Content-Length", fmt.Sprintf("%d", object.Size))
	response.Header().Set("Cache-Control", "public, max-age=86400")
	_, _ = io.Copy(response, file)
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

	body.Ext = strings.ToLower(strings.TrimPrefix(strings.TrimSpace(body.Ext), "."))
	contentTypes := map[string]string{
		"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
		"webp": "image/webp", "gif": "image/gif",
	}
	contentType, ok := contentTypes[body.Ext]
	if !ok {
		writeError(response, http.StatusBadRequest, "INVALID_EXTENSION", "仅支持 JPG、PNG、WEBP 或 GIF 图片")
		return
	}

	objectKey := fmt.Sprintf("uploads/%s/%s.%s", time.Now().Format("2006/01/02"), database.NewID(), body.Ext)
	cosURL := fmt.Sprintf("https://%s.cos.%s.myqcloud.com", r.config.COSBucket, r.config.COSRegion)
	expiration := time.Now().Add(10 * time.Minute).UTC().Format("2006-01-02T15:04:05.000Z")
	policyDoc := map[string]any{
		"expiration": expiration,
		"conditions": []any{
			map[string]string{"bucket": r.config.COSBucket},
			[]any{"eq", "$key", objectKey},
			[]any{"eq", "$Content-Type", contentType},
			[]any{"content-length-range", 1, maxImageUploadSize},
		},
	}

	policyJSON, _ := json.Marshal(policyDoc)
	policyBase64 := base64.StdEncoding.EncodeToString(policyJSON)
	mac := hmac.New(sha1.New, []byte(r.config.COSSecretKey))
	mac.Write([]byte(policyBase64))
	signature := hex.EncodeToString(mac.Sum(nil))

	writeJSON(response, http.StatusOK, presignResponse{
		URL:         cosURL,
		Key:         objectKey,
		Policy:      policyBase64,
		Signature:   signature,
		SecretID:    r.config.COSSecretID,
		ContentType: contentType,
	})
}
