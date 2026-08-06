package database

import (
	"crypto/rand"
	"encoding/hex"
	"time"
)

// NewID generates a compact, sortable unique ID.
// Format: 8-char timestamp (hex seconds) + 8-char random = 16 chars.
func NewID() string {
	timestamp := time.Now().Unix()
	var random [4]byte
	rand.Read(random[:])
	return hex.EncodeToString([]byte{
		byte(timestamp >> 24), byte(timestamp >> 16), byte(timestamp >> 8), byte(timestamp),
	}) + hex.EncodeToString(random[:])
}
