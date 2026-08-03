package storage

import (
	"context"
	"io"
	"time"
)

type Object struct {
	Key         string
	Size        int64
	ContentType string
	UpdatedAt   time.Time
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
