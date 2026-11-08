package httpapi

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/zhanghao527/youbenpu/services/api/internal/storage"
)

func TestRejectedUploadsRemoveTemporaryFiles(t *testing.T) {
	store, err := storage.NewLocalStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	r := router{objectStore: store}
	for _, tc := range []struct {
		name    string
		limit   int
		handler http.HandlerFunc
	}{
		{"image", maxImageUploadSize, r.upload},
		{"bill", maxBillUploadSize, r.importLedger},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var body bytes.Buffer
			writer := multipart.NewWriter(&body)
			part, err := writer.CreateFormFile("wrong-field", "oversized.bin")
			if err != nil {
				t.Fatal(err)
			}
			if _, err := part.Write(make([]byte, tc.limit+1)); err != nil {
				t.Fatal(err)
			}
			if err := writer.Close(); err != nil {
				t.Fatal(err)
			}
			request := httptest.NewRequest(http.MethodPost, "/upload", &body)
			request.Header.Set("Content-Type", writer.FormDataContentType())
			response := httptest.NewRecorder()
			tc.handler(response, request)
			if response.Code != http.StatusBadRequest {
				t.Fatalf("got status %d", response.Code)
			}
			if request.MultipartForm == nil || len(request.MultipartForm.File["wrong-field"]) != 1 {
				t.Fatal("test did not parse the disk-backed file")
			}
			file, err := request.MultipartForm.File["wrong-field"][0].Open()
			if err == nil {
				file.Close()
				request.MultipartForm.RemoveAll()
				t.Fatal("rejected request leaked its temporary file")
			}
		})
	}
}
