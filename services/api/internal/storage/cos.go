package storage

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	cos "github.com/tencentyun/cos-go-sdk-v5"
)

// COSStore implements ObjectStore with Tencent Cloud Object Storage. Its public
// HTTPS endpoint is returned for uploaded images so a real mini-program does
// not need to retrieve images through an HTTP development-server proxy.
type COSStore struct {
	client        *cos.Client
	publicBaseURL string
}

func NewCOSStore(bucket, region, secretID, secretKey string) (*COSStore, error) {
	if strings.TrimSpace(bucket) == "" || strings.TrimSpace(region) == "" {
		return nil, fmt.Errorf("COS bucket and region are required")
	}
	if strings.TrimSpace(secretID) == "" || strings.TrimSpace(secretKey) == "" {
		return nil, fmt.Errorf("COS credentials are required")
	}

	bucketURL, err := cos.NewBucketURL(bucket, region, true)
	if err != nil {
		return nil, fmt.Errorf("create COS bucket URL: %w", err)
	}
	client := cos.NewClient(&cos.BaseURL{BucketURL: bucketURL}, &http.Client{
		Transport: &cos.AuthorizationTransport{
			SecretID:  secretID,
			SecretKey: secretKey,
		},
	})
	return &COSStore{
		client:        client,
		publicBaseURL: strings.TrimRight(bucketURL.String(), "/"),
	}, nil
}

func (store *COSStore) Driver() string {
	return "cos"
}

func (store *COSStore) Put(ctx context.Context, key, contentTypeHint string, source io.Reader) (Object, error) {
	if err := ctx.Err(); err != nil {
		return Object{}, err
	}

	cleanKey, err := normalizeObjectKey(key)
	if err != nil {
		return Object{}, err
	}
	if strings.TrimSpace(contentTypeHint) == "" {
		contentTypeHint = "application/octet-stream"
	}

	countingSource := &countingReader{reader: source}
	_, err = store.client.Object.Put(ctx, cleanKey, countingSource, &cos.ObjectPutOptions{
		ObjectPutHeaderOptions: &cos.ObjectPutHeaderOptions{ContentType: contentTypeHint},
	})
	if err != nil {
		return Object{}, fmt.Errorf("put COS object: %w", err)
	}

	return Object{
		Key:         cleanKey,
		Size:        countingSource.size,
		ContentType: contentTypeHint,
		UpdatedAt:   time.Now().UTC(),
		PublicURL:   store.publicBaseURL + "/" + cleanKey,
	}, nil
}

func (store *COSStore) Open(ctx context.Context, key string) (io.ReadCloser, Object, error) {
	if err := ctx.Err(); err != nil {
		return nil, Object{}, err
	}

	cleanKey, err := normalizeObjectKey(key)
	if err != nil {
		return nil, Object{}, err
	}
	response, err := store.client.Object.Get(ctx, cleanKey, nil)
	if err != nil {
		if isCOSNotFound(err) {
			return nil, Object{}, fmt.Errorf("open COS object: %w", os.ErrNotExist)
		}
		return nil, Object{}, fmt.Errorf("open COS object: %w", err)
	}

	size, _ := strconv.ParseInt(response.Header.Get("Content-Length"), 10, 64)
	updatedAt, _ := http.ParseTime(response.Header.Get("Last-Modified"))
	return response.Body, Object{
		Key:         cleanKey,
		Size:        size,
		ContentType: response.Header.Get("Content-Type"),
		UpdatedAt:   updatedAt,
	}, nil
}

func (store *COSStore) Delete(ctx context.Context, key string) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	cleanKey, err := normalizeObjectKey(key)
	if err != nil {
		return err
	}
	_, err = store.client.Object.Delete(ctx, cleanKey)
	if err != nil && !isCOSNotFound(err) {
		return fmt.Errorf("delete COS object: %w", err)
	}
	return nil
}

type countingReader struct {
	reader io.Reader
	size   int64
}

func (reader *countingReader) Read(buffer []byte) (int, error) {
	count, err := reader.reader.Read(buffer)
	reader.size += int64(count)
	return count, err
}

func isCOSNotFound(err error) bool {
	if errors.Is(err, os.ErrNotExist) {
		return true
	}
	response, ok := cos.IsCOSError(err)
	return ok && (response.Code == "NoSuchKey" || (response.Response != nil && response.Response.StatusCode == http.StatusNotFound))
}
