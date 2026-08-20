package storage

import (
	"context"
	"fmt"
	"io"
	"path"
	"strings"
	"time"
)

type Object struct {
	Key         string
	Size        int64
	ContentType string
	UpdatedAt   time.Time

	// PublicURL is an optional HTTPS URL that image clients can use directly.
	// It is set by providers, such as a public COS bucket, that can serve an
	// object without routing the request through this API.
	PublicURL string
}

// ObjectStore keeps the domain independent from a concrete storage provider.
// LocalStore is used during development; a Tencent COS adapter can implement the
// same interface without changing handlers or domain services. Put receives a
// content-type hint, while the returned Object metadata is authoritative.
type ObjectStore interface {
	Driver() string
	Put(ctx context.Context, key, contentTypeHint string, source io.Reader) (Object, error)
	Open(ctx context.Context, key string) (io.ReadCloser, Object, error)
	Delete(ctx context.Context, key string) error
}

func normalizeObjectKey(key string) (string, error) {
	cleanKey := strings.TrimPrefix(path.Clean("/"+strings.TrimSpace(key)), "/")
	if cleanKey == "" || cleanKey == "." {
		return "", fmt.Errorf("object key is required")
	}
	return cleanKey, nil
}
