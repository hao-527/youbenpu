package storage

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
)

type LocalStore struct {
	root string
}

func NewLocalStore(root string) (*LocalStore, error) {
	absoluteRoot, err := filepath.Abs(root)
	if err != nil {
		return nil, fmt.Errorf("resolve upload directory: %w", err)
	}
	if err := os.MkdirAll(absoluteRoot, 0o750); err != nil {
		return nil, fmt.Errorf("create upload directory: %w", err)
	}

	probe, err := os.CreateTemp(absoluteRoot, ".write-check-*")
	if err != nil {
		return nil, fmt.Errorf("upload directory is not writable: %w", err)
	}
	probePath := probe.Name()
	if err := probe.Close(); err != nil {
		os.Remove(probePath)
		return nil, fmt.Errorf("close upload directory write check: %w", err)
	}
	if err := os.Remove(probePath); err != nil {
		return nil, fmt.Errorf("remove upload directory write check: %w", err)
	}

	return &LocalStore{root: absoluteRoot}, nil
}

func (store *LocalStore) Driver() string {
	return "local"
}

func (store *LocalStore) Put(ctx context.Context, key, contentTypeHint string, source io.Reader) (Object, error) {
	if err := ctx.Err(); err != nil {
		return Object{}, err
	}

	target, cleanKey, err := store.resolve(key)
	if err != nil {
		return Object{}, err
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o750); err != nil {
		return Object{}, fmt.Errorf("create object directory: %w", err)
	}

	temporary, err := os.CreateTemp(filepath.Dir(target), ".upload-*")
	if err != nil {
		return Object{}, fmt.Errorf("create temporary object: %w", err)
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)

	written, copyErr := io.Copy(temporary, source)
	if copyErr != nil {
		temporary.Close()
		return Object{}, fmt.Errorf("write object: %w", copyErr)
	}

	// The local adapter derives the authoritative type from bytes so Put and Open
	// return the same metadata. COS may use the hint when storing that metadata.
	_ = contentTypeHint
	contentType, detectErr := detectContentType(temporary)
	closeErr := temporary.Close()
	if detectErr != nil {
		return Object{}, detectErr
	}
	if closeErr != nil {
		return Object{}, fmt.Errorf("close object: %w", closeErr)
	}
	if err := os.Rename(temporaryPath, target); err != nil {
		return Object{}, fmt.Errorf("commit object: %w", err)
	}

	info, err := os.Stat(target)
	if err != nil {
		return Object{}, fmt.Errorf("inspect object: %w", err)
	}
	return Object{
		Key:         cleanKey,
		Size:        written,
		ContentType: contentType,
		UpdatedAt:   info.ModTime(),
	}, nil
}

func (store *LocalStore) Open(ctx context.Context, key string) (io.ReadCloser, Object, error) {
	if err := ctx.Err(); err != nil {
		return nil, Object{}, err
	}

	target, cleanKey, err := store.resolve(key)
	if err != nil {
		return nil, Object{}, err
	}
	file, err := os.Open(target)
	if err != nil {
		return nil, Object{}, fmt.Errorf("open object: %w", err)
	}
	info, err := file.Stat()
	if err != nil {
		file.Close()
		return nil, Object{}, fmt.Errorf("inspect object: %w", err)
	}
	contentType, err := detectContentType(file)
	if err != nil {
		file.Close()
		return nil, Object{}, err
	}
	return file, Object{
		Key:         cleanKey,
		Size:        info.Size(),
		ContentType: contentType,
		UpdatedAt:   info.ModTime(),
	}, nil
}

func (store *LocalStore) Delete(ctx context.Context, key string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	target, _, err := store.resolve(key)
	if err != nil {
		return err
	}
	if err := os.Remove(target); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("delete object: %w", err)
	}
	return nil
}

func (store *LocalStore) resolve(key string) (target string, cleanKey string, err error) {
	cleanKey = strings.TrimPrefix(path.Clean("/"+strings.TrimSpace(key)), "/")
	if cleanKey == "" || cleanKey == "." {
		return "", "", fmt.Errorf("object key is required")
	}

	target = filepath.Join(store.root, filepath.FromSlash(cleanKey))
	relative, err := filepath.Rel(store.root, target)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return "", "", fmt.Errorf("object key escapes storage root")
	}
	return target, cleanKey, nil
}

func detectContentType(file *os.File) (string, error) {
	header := make([]byte, 512)
	count, err := file.ReadAt(header, 0)
	if err != nil && !errors.Is(err, io.EOF) {
		return "", fmt.Errorf("detect object content type: %w", err)
	}
	if count == 0 {
		return "application/octet-stream", nil
	}
	return http.DetectContentType(header[:count]), nil
}
